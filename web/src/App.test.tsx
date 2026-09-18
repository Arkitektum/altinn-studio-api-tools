// First, because it is what puts a browser in front of everything below. See testDom.ts.
import { choose, click, find, findByText, render, stubFetch, type, type Rendered, type Routes } from "./testDom";
import assert from "node:assert/strict";
import { beforeEach, describe, it, type TestContext } from "node:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { makeQueryClient } from "./queries";
import { RunLogProvider } from "./runLog";
import { SessionProvider } from "./session";
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

/** No validation service, which is how most tests want it: the prevalidation is then switched off. */
const config = {
    appHost: "http://local.altinn.cloud:8000",
    localtestUrl: "http://localhost:5101",
    validationUrl: "",
    exampleDataDir: "/examples"
};

/** What every test has to have answered before the tool shows anything at all. */
const boot: Routes = {
    "GET /api/config": config,
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
            <SessionProvider>
                <RunLogProvider>
                    <App />
                </RunLogProvider>
            </SessionProvider>
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
/**
 * The panels that are on screen but cannot be used yet, by heading.
 *
 * Returned as strings rather than the elements themselves: a failed `assert` on a jsdom node tries
 * to print the node, and the object graph behind one is large enough to take the process out.
 */
function waitingPanels(app: Rendered): string[] {
    return [...app.container.querySelectorAll(".panel--waiting h2")].map((heading) => heading.textContent ?? "");
}

function elementsListed(app: Rendered): string {
    return app.container.querySelector("#dataGuid")?.textContent ?? "";
}

/** Which of the two the instances panel says a post goes to. A string, for the reason above. */
function postingTo(app: Rendered): string {
    return app.container.querySelector("#panel-instances .modes__choice[aria-pressed='true'] .modes__title")?.textContent ?? "";
}

/** And which instance, where that answer has one. Empty where the panel is showing none. */
function instancePicked(app: Rendered): string {
    return app.container.querySelector("#panel-instances .picked__name")?.textContent ?? "";
}

/** The classes on a panel's notice, which is how it says what it thinks of what it is reporting. */
function noticeTone(app: Rendered, panel: string): string {
    return app.container.querySelector(`${panel} .notice`)?.className ?? "";
}

/** The url the panel says the post will go to. */
function willCall(app: Rendered): string {
    return app.container.querySelector("#panel-instances .dump")?.textContent ?? "";
}

/** What the rail says one step is holding. A string, for the same reason `waitingPanels` is. */
function railValue(app: Rendered, label: string): string {
    const step = [...app.container.querySelectorAll(".rail__step")].find((row) => row.querySelector(".rail__label")?.textContent === label);
    return step?.querySelector(".rail__value")?.textContent ?? "";
}

describe("App", () => {
    it("comes up with the token the server is holding", async (t) => {
        const { app, stub } = await mount(t, boot);

        assert.match(app.container.textContent ?? "", /Sophie Salt/);
        assert.ok(stub.calls.includes("GET /api/tokens"));
    });

    /*
     * Every panel is on screen from the first render, and the ones you cannot use yet say what they
     * are waiting for. The order the tool works in is then visible on the page, which is what the
     * chain strip above the panels used to have to explain.
     */
    it("shows every panel from the start, waiting where it cannot be used yet", async (t) => {
        const { app } = await mount(t, boot);

        // A token and nothing else. The panel you pick an application in is ready; the ones below it
        // are on screen and waiting, which is what a first screen of one panel used to hide.
        // Prevalidation is not among them: this boot has no validation service, so there is no such
        // step to be waiting on.
        assert.deepEqual(waitingPanels(app), ["Instances", "Payload", "Post", "Data element", "Pdf", "Process"]);

        // And each names the first thing missing rather than its own nearest one: with no
        // application there is no point asking for an instance.
        assert.match(app.container.textContent ?? "", /InstancesNeeds an application\./);
        assert.match(app.container.textContent ?? "", /ProcessNeeds an application\./);
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
     * Creating an instance and adding to one are two answers to the same question, and the panel
     * used to carry the difference between them in nothing but the words in a row: "New instance"
     * against a guid, both drawn the way the window behind it draws its list. Which one is in force
     * is now the control, so it can be read and changed without opening anything.
     */
    it("says whether a post creates an instance or adds to one, and changes which without the window", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        assert.match(postingTo(app), /^Existing instance/, "a seeded guid means the post adds to that one");
        assert.match(instancePicked(app), new RegExp(A.slice(0, 8)), "and the panel says which, without the window");
        // What the listing holds, which is none of them: an instance reached by its guid is a row in
        // the window but is not one the listing offered, and it is already the one in force.
        assert.equal(app.container.querySelector("#panel-instances .modes__count")?.textContent, "0");
        assert.match(willCall(app), new RegExp(`/instances/510001/${A}/data`));

        // Back to creating one, from the panel rather than from the window.
        await click(app, findByText(app, "#panel-instances .modes__choice", "New instance"));
        await app.wait(20);

        assert.equal(postingTo(app), "New instance");
        assert.equal(instancePicked(app), "", "nothing to name once the post is the thing that creates it");
        assert.match(willCall(app), /\/instances {2}\(multipart/);
    });

    /*
     * The window is now only ever about which existing instance, so picking one out of it is the
     * whole of what it does, and nothing was covering that at all: every other test here reaches an
     * instance by typing its guid.
     */
    it("takes the instance picked in the window as the one to add to", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001" });

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances/active": {
                ok: true,
                steps: [],
                failedAt: null,
                instanceOwnerPartyId: "510001",
                instances: [
                    { id: `510001/${A}`, instanceOwnerPartyId: "510001", instanceGuid: A, lastChanged: null, lastChangedBy: null, state: "active" }
                ],
                completedListed: null
            },
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        // Nothing chosen, and the panel says how many there are to choose from before you open it.
        assert.equal(postingTo(app), "New instance");
        assert.match(app.container.querySelector("#panel-instances .modes__count")?.textContent ?? "", /^1$/);

        await openInstances(app);
        await click(app, findByText(app, "#panel-instances .picklist__item", A.slice(0, 8)));
        await app.wait(700);

        assert.match(postingTo(app), /^Existing instance/, "picking one is how you get to that answer");
        assert.match(instancePicked(app), new RegExp(A.slice(0, 8)));
        assert.equal(app.container.querySelector("#panel-instances .picklist") === null, true, "picking closes the window");
        assert.ok(stub.calls.includes("GET /api/instances"), "and the tool reads what it is now pointed at");
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
        assert.equal(waitingPanels(app).includes("Process"), false, "and where it stands should be on screen");
        // The rail ends on the same answer, which is where the instance has got to.
        assert.equal(railValue(app, "Process"), "Task_1");

        // Reached by its guid rather than by a row, which is the panel's own way to an instance the
        // active list leaves out. The window it lives in has to be opened first.
        await openInstances(app);
        await click(app, findByText(app, "#panel-instances button", "Reach one by guid"));
        await type(app, find<HTMLInputElement>(app, "#typedInstanceGuid"), B);

        assert.doesNotMatch(elementsListed(app), /GammelType/, "the previous instance's data element should have gone");
        // Not gone: every panel stays on screen and says what it is waiting for. See lib/readiness.ts.
        assert.equal(waitingPanels(app).includes("Process"), true, "and its process should be back to waiting");
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

        // "Reach one by guid" toggles the field rather than opening it, so this only asks for it when
        // it is not already there.
        const typed = async (guid: string) => {
            if (!app.container.querySelector("#typedInstanceGuid")) {
                await openInstances(app);
                await click(app, findByText(app, "#panel-instances button", "Reach one by guid"));
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
     * Four panels print the url they would call, and all four read the target from one context
     * rather than taking five props each to build the same string. This is what says the context is
     * actually reaching them, which a type error could not: a panel outside the provider throws.
     */
    it("prints the url each panel would call, from the target it is pointed at", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": () => instanceRead(A, "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        const shown = app.container.textContent ?? "";
        const instance = `http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/${A}`;
        assert.ok(shown.includes(`${instance}/pdf/preview`), "the pdf panel's url");
        assert.ok(shown.includes(`${instance}/process/next`), "the process panel's url");
        assert.ok(shown.includes(`${instance}/data/${A}-data`), "the data element panel's url");
    });

    /*
     * Posting points the tool at the instance it made, lists the party again because the listing is
     * now out of date, and puts what its follow-up read into the cache under that instance. The last
     * of those is why the instance is not read a second time when the selection catches up.
     */
    it("points at the instance it posted, without reading it twice", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });

        const { app, stub } = await mount(t, {
            ...boot,
            "POST /api/runs": {
                ok: true,
                mode: "multipart",
                steps: [],
                instanceOwnerPartyId: "510001",
                instanceGuid: B,
                instanceUrl: `http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/${B}`,
                instance: {},
                failedAt: null
            },
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "TypeFraPost"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });

        await app.wait(700);
        const listings = stub.calls.filter((made) => made === "GET /api/instances/active").length;

        await click(app, find(app, "button.btn--fire"));
        // Past the selection delay, so the instance query has had its chance to ask as well.
        await app.wait(900);

        assert.ok(stub.calls.includes("POST /api/runs"), "the post should have gone out");
        assert.equal(stub.calls.filter((made) => made === "GET /api/instances").length, 1, "the follow-up read, and only that");
        assert.match(elementsListed(app), /TypeFraPost/, "the tool should be pointed at what it posted");
        // The rail counts what is on the instance, which is the only thing that says a post landed.
        assert.equal(railValue(app, "Post"), "1 stored");
        assert.ok(
            stub.calls.filter((made) => made === "GET /api/instances/active").length > listings,
            "and the listing should have been asked again, being out of date"
        );
    });

    /*
     * The rail says what the payload holds and what the service made of it, and the payload panel
     * lists the documents from the same report. That is why the report is in the cache: it was the
     * hook's own state, and a second caller got its own empty copy, so the rail would have gone on
     * saying "not run" however many times the button had been pressed. Only a test with both on
     * screen can see that, which is why this one is here rather than beside `requestChain`.
     */
    it("says on the rail what the prevalidation answered", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/config": { ...config, validationUrl: "http://localhost:6000/validate" },
            "POST /api/validation-report": {
                ok: true,
                steps: [],
                failedAt: null,
                report: {
                    soknadtype: "ET",
                    messages: [
                        {
                            rule: "Situasjonsplan",
                            reference: "Ettrinn.Vedlegg.Situasjonsplan",
                            message: "Situasjonsplan mangler",
                            messagetype: "ERROR"
                        }
                    ]
                }
            }
        });
        await app.wait(700);

        assert.equal(railValue(app, "Payload"), "1 element", "the payload has a type and something in it");
        assert.equal(railValue(app, "Prevalidation"), "not run");

        await click(app, findByText(app, "#panel-prevalidation button", "Prevalidate"));
        await app.wait(50);

        assert.equal(railValue(app, "Prevalidation"), "1 document missing");
        // And the panel read the same report, rather than each holding one of its own.
        assert.match(app.container.textContent ?? "", /Situasjonsplan/);
    });

    /*
     * The rail and the panel are two views of one report, and they used to be readable as
     * disagreeing. The panel coloured its notice by whether a required document was missing, which
     * is a narrower question than the one the notice looks like it is answering, so a report with an
     * error inside the form and four documents it only recommends was green there and red on the
     * rail. The counts were never wrong: 1 error and 7 warnings is the same eight findings as four
     * recommendations and four rules about the form's own content.
     */
    it("colours the prevalidation notice by the whole report, the way the rail is", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });

        /** A rule about a document, which is what `Vedlegg` in the reference path makes it. */
        const document = (name: string) => ({
            rule: name,
            reference: `Ettrinn.Vedlegg.${name}`,
            message: `${name} mangler`,
            messagetype: "WARNING"
        });
        /** And one about the form's own content, which names no attachment and so no payload element. */
        const content = (name: string, messagetype: string) => ({
            rule: name,
            reference: `Ettrinn.Eiendom.${name}`,
            message: `${name} er ikke fylt ut`,
            messagetype
        });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/config": { ...config, validationUrl: "http://localhost:6000/validate" },
            "POST /api/validation-report": {
                ok: true,
                steps: [],
                failedAt: null,
                report: {
                    soknadtype: "ET",
                    messages: [
                        document("TegningNyPlan"),
                        document("TegningNyFasade"),
                        document("SamtykkeArbeidstilsynet"),
                        document("Avkjoerselsplan"),
                        content("Adresse", "ERROR"),
                        content("Gnr", "WARNING"),
                        content("Bnr", "WARNING"),
                        content("Kommunenavn", "WARNING")
                    ]
                }
            }
        });
        await app.wait(700);

        await click(app, findByText(app, "#panel-prevalidation button", "Prevalidate"));
        await app.wait(50);

        // No document is required and missing, so nothing is outstanding and the panel used to be
        // green on the strength of that alone.
        assert.equal(railValue(app, "Prevalidation"), "1 error, 7 warnings");
        assert.equal(noticeTone(app, "#panel-prevalidation"), "notice notice--bad");

        const notice = app.container.querySelector("#panel-prevalidation .notice")?.textContent ?? "";
        assert.match(notice, /1 error, 7 warnings/, "the panel leads with what the rail says");
        assert.match(notice, /asks for no document this ET submission does not have/, "which is still true, and still said");
        assert.match(notice, /recommends TegningNyPlan, TegningNyFasade, SamtykkeArbeidstilsynet and Avkjoerselsplan/);

        // The error is read out rather than counted, which is the whole point of it being an error:
        // nothing here can be added from this panel, and it would still refuse the submit.
        assert.match(notice, /one error about the form’s own content/);
        assert.match(notice, /Adresse er ikke fylt ut/, "the rule's own sentence");
        assert.match(notice, /Ettrinn\.Eiendom\.Adresse/, "and where in the form it is about");
        // The warnings stay a count, since they are the long half of a report the log has in full.
        assert.match(notice, /3 warnings about the form’s own content/);
        assert.doesNotMatch(notice, /Gnr er ikke fylt ut/, "a warning about the form is not read out");
    });

    /*
     * A render is the most expensive read the tool makes: the app lays the whole form out and what
     * comes back is the pdf as base64. Pressing the button twice without having changed anything in
     * between used to do all of that twice for the same document, because closing the window threw
     * the pdf away. It is kept now, with a fingerprint of what it was rendered from.
     */
    it("shows the pdf it already has rather than rendering it again", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances": () => instanceRead(A, "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation,
            "GET /api/instances/pdf-preview": {
                ok: true,
                steps: [],
                failedAt: null,
                contentType: "application/pdf",
                content: btoa("%PDF-1.4"),
                size: 8
            }
        });
        await app.wait(700);

        const renders = () => stub.calls.filter((made) => made === "GET /api/instances/pdf-preview").length;
        const pdfButton = () => find(app, "#panel-pdf button");

        assert.equal(pdfButton().textContent, "Render pdf");
        await click(app, pdfButton());
        await app.wait(50);
        assert.equal(renders(), 1, "the first press should have asked the app");
        assert.ok(app.container.querySelector("dialog"), "and opened the window");

        // Closing puts the pdf away rather than throwing it out.
        await click(app, findByText(app, "dialog button", "Close"));
        assert.equal(app.container.querySelector("dialog"), null, "the window should have closed");
        assert.equal(pdfButton().textContent, "Show pdf", "and the button should offer the one in hand");
        // The rail reads the same cache decision the button does, from the one place it is made.
        assert.equal(railValue(app, "Pdf"), "rendered");

        await click(app, pdfButton());
        await app.wait(50);
        assert.equal(renders(), 1, "the pdf in hand should be shown rather than asked for again");
        assert.ok(app.container.querySelector("dialog"), "and the window should be open on it");
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
        await click(app, findByText(app, "#panel-instances button", "Reach one by guid"));
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
