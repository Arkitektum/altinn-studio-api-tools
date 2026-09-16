// First, because it is what puts a browser in front of everything below. See testDom.ts.
import { choose, click, find, findByText, render, stubFetch, type, type Rendered, type Routes } from "./testDom";
import assert from "node:assert/strict";
import { beforeEach, describe, it, type TestContext } from "node:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { makeQueryClient } from "./queries";
import type { DataElementInput, PublicToken } from "./types";

const token: PublicToken = {
    id: "t1",
    kind: "test-user",
    label: "Sophie Salt",
    claims: {},
    scopes: [],
    issuedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    partyId: "510001",
    userId: "1001",
    ssn: "01899699552"
};

const A = "99d0632c-5917-448c-8ab6-a5d3b681376b";
const B = "11112222-3333-4444-5555-666677778888";

/** What every test has to have answered before the tool shows anything at all. */
const boot: Routes = {
    "GET /api/config": {
        appHost: "http://local.altinn.cloud:8000",
        localtestUrl: "http://localhost:5101",
        validationUrl: "",
        exampleDataDir: "/examples"
    },
    "GET /api/catalogue": [],
    "GET /api/examples": { dir: "/examples", groups: [] },
    "GET /api/localtest/status": { reachable: true, status: 200, url: "http://localhost:5101" },
    "GET /api/tokens": [token],
    "GET /api/app/metadata": {
        appUrl: "http://local.altinn.cloud:8000/dibk/et-v4",
        metadata: { id: "dibk/et-v4", org: "dibk", mainFormDataType: "ET", dataTypes: [{ id: "ET", maxCount: 1, appLogic: { classRef: "x" } }] }
    },
    "GET /api/app/parties": [],
    "GET /api/instances/active": {
        ok: true,
        steps: [],
        failedAt: null,
        instanceOwnerPartyId: "510001",
        instances: [],
        completedListed: null
    }
};

/** An instance read, with one data element of its own so two answers can be told apart. */
function instanceRead(guid: string, dataType: string) {
    return {
        ok: true,
        steps: [],
        failedAt: null,
        instanceOwnerPartyId: "510001",
        instanceGuid: guid,
        instanceUrl: `http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/${guid}`,
        instance: {},
        dataElements: [{ id: `${guid}-data`, dataType, contentType: "application/xml", filename: null, size: 10, lastChanged: null }],
        process: { taskId: "Task_1", taskType: "data", ended: null, currentTask: "Task_1" }
    };
}

const emptyValidation = { ok: true, steps: [], failedAt: null, instanceGuid: "", dataGuid: null, issues: [], counts: {} };
const elementRead = { ok: true, steps: [], failedAt: null, contentType: "application/xml", encoding: "utf8", content: "<ettrinn />", size: 11 };

/** What the tool would have been left holding by a previous session. */
function seed(values: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(values)) {
        window.localStorage.setItem(`altinn-api-tools:${key}`, JSON.stringify(value));
    }
}

function storedElements(): DataElementInput[] {
    return JSON.parse(window.localStorage.getItem("altinn-api-tools:dataElements") ?? "[]") as DataElementInput[];
}

beforeEach(() => {
    window.localStorage.clear();
});

/**
 * The tool, running against `routes`, taken down again when the test ends however it ends.
 *
 * Registered rather than left to the end of the test body, because the token expiry ticks once a
 * second: a test that fails before it can unmount would otherwise leave that timer running, and
 * node waits for it rather than reporting the failure.
 */
async function mount(t: TestContext, routes: Routes) {
    const stub = stubFetch(routes);
    // Its own client, so the answers one test gave are not the answers the next one starts with.
    const client = makeQueryClient();
    const app = await render(
        <QueryClientProvider client={client}>
            <App />
        </QueryClientProvider>
    );
    t.after(async () => {
        await app.unmount();
        client.clear();
        stub.restore();
    });
    /*
     * Settled before it is handed over, so a test asserts against a tool that has booted rather
     * than one still asking. The first render only starts the queries; how many of them have
     * answered by the time it returns is a race, and one test passing on it is not a reason for
     * the next to.
     */
    await app.wait(20);
    return { app, stub };
}

/** The window the instance list lives in, opened. */
async function openInstances(app: Rendered): Promise<void> {
    await click(app, find(app, "#panel-instances button[aria-haspopup='dialog']"));
}

/**
 * The data elements offered in the Inspect column, which is what reading an instance fills in.
 *
 * Read from the select rather than from the whole page, because the run log keeps every request
 * that was made and is meant to: what an instance read said stays in the history after the tool
 * has been pointed somewhere else, and only the panels are supposed to follow the selection.
 */
function elementsListed(app: Rendered): string {
    return app.container.querySelector("#dataGuid")?.textContent ?? "";
}

describe("App", () => {
    it("comes up with the token the server is holding", async (t) => {
        const { app, stub } = await mount(t, boot);

        assert.match(app.container.textContent ?? "", /Sophie Salt/);
        assert.ok(stub.calls.includes("GET /api/tokens"));
    });

    /*
     * What the server has to say for itself does not change while the tool is open, and a request
     * nobody asked for would turn up in the run log as one they did. The query defaults say so, in
     * `queries.ts`; this is what holds them there.
     */
    it("asks the server about itself once, and not again", async (t) => {
        const { app, stub } = await mount(t, boot);

        // Past a second, so the token countdown has re-rendered everything at least once.
        await app.wait(1200);

        for (const call of ["GET /api/config", "GET /api/catalogue", "GET /api/examples", "GET /api/localtest/status"]) {
            assert.equal(stub.calls.filter((made) => made === call).length, 1, `${call} should have been asked exactly once`);
        }
    });

    /*
     * Deleting the token in use covers the whole of step 2 in one path: the mutation runs, it
     * invalidates the list rather than the panel telling App to refresh, and the token in use falls
     * back because it is derived from the list rather than stored beside it. The labels are ones
     * LocalTest's fallback pair does not use, since those are in the picker and would match anyway.
     */
    it("falls back to the token still there when the one in use is deleted", async (t) => {
        const alfa: PublicToken = { ...token, id: "t1", label: "Alfa Testperson" };
        const beta: PublicToken = { ...token, id: "t2", label: "Beta Testperson" };
        let deleted: string | null = null;

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/tokens": () => [alfa, beta].filter((held) => held.id !== deleted),
            "DELETE /api/tokens/t1": () => {
                deleted = "t1";
                return null;
            }
        });

        assert.match(app.container.textContent ?? "", /Alfa Testperson/, "the first token should be the one in use");

        await click(app, find(app, "button[aria-label='Delete token Alfa Testperson']"));
        // The invalidation refetches, which is another round trip after the delete answered.
        await app.wait(50);

        assert.equal(stub.calls.filter((made) => made === "GET /api/tokens").length, 2, "deleting should have asked for the list again");
        assert.doesNotMatch(app.container.textContent ?? "", /Alfa Testperson/, "the deleted token should be gone");
        assert.match(app.container.textContent ?? "", /Beta Testperson/, "and the tool should be using the one still there");
    });

    /*
     * The app name is typed a character at a time, and every intermediate value is an app that does
     * not exist. The query is keyed on the settled name rather than the typed one, so the cache is
     * never told about those at all and there is nothing to cancel or log afterwards.
     */
    it("asks the app once its name stops being typed, not once per character", async (t) => {
        const { app, stub } = await mount(t, boot);

        // Started from nothing rather than a restored target: a name already there when the tool
        // loads is settled from the first render, which is right, and would ask before any typing.
        await choose(app, find<HTMLSelectElement>(app, "#application"), "other");
        await type(app, find<HTMLInputElement>(app, "input[aria-label='Org']"), "dibk");

        for (const value of ["e", "et", "et-", "et-v", "et-v4"]) {
            await type(app, find<HTMLInputElement>(app, "input[aria-label='App']"), value);
            // Under the delay, so the name never settles part way through.
            await app.wait(60);
        }
        await app.wait(600);

        const asked = stub.calls.filter((made) => made === "GET /api/app/metadata");
        assert.equal(asked.length, 1, "the app should have been read once, for the name that settled");
        assert.equal(stub.url(stub.calls.indexOf("GET /api/app/metadata")).searchParams.get("app"), "et-v4");
    });

    /*
     * The probe is scheduled on a debounce and answers after a round trip, so the payload it closed
     * over is two moments old by the time it writes the app's content types into it. It used to
     * write that payload back out, taking whatever had been typed meanwhile with it.
     */
    it("keeps what was typed while the probe was in flight", async (t) => {
        seed({ org: "dibk", app: "et-v4", dataElements: [{ dataType: "ET", content: "the seeded payload" }] });

        let answer: (value: unknown) => void = () => {};
        const held = new Promise((resolve) => {
            answer = resolve;
        });

        const { app, stub } = await mount(t, { ...boot, "GET /api/app/metadata": () => held });

        // The probe waits for the app name to stop being typed before it asks.
        await app.wait(500);
        assert.ok(stub.calls.includes("GET /api/app/metadata"), "the probe should be out by now");

        await type(app, find<HTMLTextAreaElement>(app, "#content-0"), "typed while the probe was out");

        await app.act(async () => {
            answer({
                appUrl: "http://local.altinn.cloud:8000/dibk/et-v4",
                metadata: {
                    id: "dibk/et-v4",
                    org: "dibk",
                    mainFormDataType: "ET",
                    dataTypes: [{ id: "ET", maxCount: 1, allowedContentTypes: ["application/xml"], appLogic: { classRef: "x" } }]
                }
            });
            await held;
        });
        // The cache tells its observers on a scheduled flush, so the answer lands a task after the
        // promise it came from, not in the same turn.
        await app.wait(20);

        assert.equal(find<HTMLTextAreaElement>(app, "#content-0").value, "typed while the probe was out");
        assert.equal(storedElements()[0]?.content, "typed while the probe was out");
        // And the probe did write, so the test is not passing because nothing happened: the content
        // type the app declared is what it went in to fill, and that is what used to carry the
        // stale payload back with it.
        assert.equal(storedElements()[0]?.contentType, "application/xml");
    });

    /*
     * Asking storage for the finished instances is a different question, so it is a different key
     * rather than a parameter to the same read. Turning it back off is then the short list, which
     * the cache already holds: the answer has not changed and nothing asks for it again.
     */
    it("asks again for the completed instances, and not again when they are turned back off", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001" });
        const { app, stub } = await mount(t, boot);
        await app.wait(700);

        const listings = () => stub.calls.filter((made) => made === "GET /api/instances/active").length;
        assert.equal(listings(), 1, "the short list should have been asked for once");

        await openInstances(app);
        const box = () => find<HTMLInputElement>(app, "#panel-instances input[type='checkbox']");

        await click(app, box());
        await app.wait(50);
        assert.equal(listings(), 2, "turning the completed ones on is another question");
        const asked = stub.calls.lastIndexOf("GET /api/instances/active");
        assert.equal(stub.url(asked).searchParams.get("includeCompleted"), "true");

        await click(app, box());
        await app.wait(50);
        assert.equal(listings(), 2, "and turning them off is the list already in hand");
    });

    /*
     * Everything below the instance describes that instance, so pointing the tool at another one
     * has to drop all of it together. Stale is more misleading than absent.
     */
    it("drops what described the instance you have left", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "GammelType"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });

        // Reading the selected instance waits for the guid to settle, the way the probe does.
        await app.wait(700);
        assert.match(elementsListed(app), /GammelType/, "the first instance's data element should be listed");
        assert.ok(app.container.querySelector(".panel--process"), "and where it stands should be on screen");

        // Reached by its guid rather than by a row, which is the panel's own way to an instance the
        // active list leaves out. The window it lives in has to be opened first.
        await openInstances(app);
        await click(app, findByText(app, "#panel-instances button", "Other instance"));
        await type(app, find<HTMLInputElement>(app, "#typedInstanceGuid"), B);

        assert.doesNotMatch(elementsListed(app), /GammelType/, "the previous instance's data element should have gone");
        assert.equal(app.container.querySelector(".panel--process"), null, "and so should its process");
    });

    /*
     * An instance read is keyed on the instance, so going back to one already read is an answer
     * already held. The panels follow the key, which is also what empties them the moment the
     * selection moves rather than when the next answer happens to arrive.
     */
    it("does not read an instance twice when you come back to it", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) =>
                instanceRead(url.searchParams.get("instanceGuid") ?? "", `Type-${url.searchParams.get("instanceGuid")?.slice(0, 4)}`),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });

        await app.wait(700);
        const reads = () => stub.calls.filter((made) => made === "GET /api/instances").length;
        assert.equal(reads(), 1);
        assert.match(elementsListed(app), /Type-99d0/);

        // "Other instance" toggles the field rather than opening it, so this only asks for it when
        // it is not already there.
        const typed = async (guid: string) => {
            if (!app.container.querySelector("#typedInstanceGuid")) {
                await openInstances(app);
                await click(app, findByText(app, "#panel-instances button", "Other instance"));
            }
            await type(app, find<HTMLInputElement>(app, "#typedInstanceGuid"), guid);
            await app.wait(700);
        };

        await typed(B);
        assert.equal(reads(), 2, "another instance is another read");
        assert.match(elementsListed(app), /Type-1111/);

        await typed(A);
        assert.equal(reads(), 2, "and the first one is already in hand");
        assert.match(elementsListed(app), /Type-99d0/, "shown from the cache rather than read again");
    });

    /*
     * Nothing cancels a request, so a read can answer after the selection it was aimed at has moved.
     * The key it was aimed at is what lets the late one be dropped rather than written over the
     * newer answer.
     */
    it("drops a read that answers after the selection moved on", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        let answer: (value: unknown) => void = () => {};
        const held = new Promise((resolve) => {
            answer = resolve;
        });

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) => (url.searchParams.get("instanceGuid") === A ? held : instanceRead(B, "TypeFraB")),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });

        await app.wait(700);
        assert.ok(stub.calls.includes("GET /api/instances"), "the read of the first instance should be out");

        await openInstances(app);
        await click(app, findByText(app, "#panel-instances button", "Other instance"));
        await type(app, find<HTMLInputElement>(app, "#typedInstanceGuid"), B);
        await app.wait(700);

        // The instance that was left finally answers, naming a data type nothing else uses.
        await app.act(async () => {
            answer(instanceRead(A, "TypeFraA"));
            await held;
        });

        assert.match(elementsListed(app), /TypeFraB/, "the instance now selected should be the one on screen");
        assert.doesNotMatch(elementsListed(app), /TypeFraA/, "the late answer should have been dropped");
    });
});
