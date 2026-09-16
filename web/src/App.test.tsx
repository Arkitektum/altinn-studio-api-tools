// First, because it is what puts a browser in front of everything below. See testDom.ts.
import { click, find, findByText, render, stubFetch, type, type Rendered, type Routes } from "./testDom";
import assert from "node:assert/strict";
import { beforeEach, describe, it, type TestContext } from "node:test";
import { App } from "./App";
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
    const app = await render(<App />);
    t.after(async () => {
        await app.unmount();
        stub.restore();
    });
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

        assert.equal(find<HTMLTextAreaElement>(app, "#content-0").value, "typed while the probe was out");
        assert.equal(storedElements()[0]?.content, "typed while the probe was out");
        // And the probe did write, so the test is not passing because nothing happened: the content
        // type the app declared is what it went in to fill, and that is what used to carry the
        // stale payload back with it.
        assert.equal(storedElements()[0]?.contentType, "application/xml");
    });

    /*
     * Everything below the instance describes that instance, so pointing the tool at another one
     * has to drop all of it together. Stale is more misleading than absent.
     */
    it("drops what described the instance you have left", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app, stub } = await mount(t, {
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
