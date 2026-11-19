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
    // An app with no pdf service tasks, so the panel offers the whole instance and nothing else.
    "GET /api/instances/pdf-targets": { ok: true, steps: [], failedAt: null, pdfTasks: [], subformPdfTasks: [] },
    "GET /api/instances/active": {
        ok: true,
        steps: [],
        failedAt: null,
        instanceOwnerPartyId: "510001",
        instances: [],
        completedListed: null
    }
};

/** The one main form example the catalogue app below has. */
const etExample = { name: "Maks.xml", label: "Maks", sizeBytes: 5, contentType: "application/xml", encoding: "utf8" };

/** One app in the catalogue, whose example is only offered once that app is the one asked about. */
const catalogueRoutes: Routes = {
    ...boot,
    "GET /api/catalogue": [{ org: "dibk", app: "et-v4", dataType: "ET", subForms: [] }],
    "GET /api/examples": (url: URL) => ({
        dir: "/examples",
        groups: url.searchParams.get("app") === "et-v4" ? [{ kind: "form", key: "ET", files: [etExample] }] : []
    }),
    "GET /api/examples/file": { ...etExample, content: "<ET/>" }
};

/** An instance read, with one data element of its own so two answers can be told apart. */
function instanceRead(guid: string, dataType: string) {
    return {
        ok: true,
        steps: [],
        failedAt: null,
        instanceOwnerPartyId: "510001",
        instanceGuid: guid,
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

/**
 * The tone class on a panel's notice, which is how it says what it thinks of what it is reporting.
 * Only the tone, so a spacing class added to the notice does not read as a change of mind.
 */
function noticeTone(app: Rendered, panel: string): string {
    const notice = app.container.querySelector(`${panel} .notice`);
    return [...(notice?.classList ?? [])].find((name) => name.startsWith("notice--")) ?? "";
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
     * One filled button per panel. Get token is it until the active token is for the user in the picker, and from then on
     * Renew is when that token has expired.
     */
    it("accents Get token only while the picked user has no token", async (t) => {
        const { app } = await mount(t, boot);
        const getToken = () => findByText(app, "#panel-test-user button", "Get token");
        const renew = () => findByText(app, "#panel-test-user button", "Renew");

        // The fallback list starts on 1001, which the active token was minted for.
        assert.equal(find<HTMLSelectElement>(app, "#userId").value, "1001");
        assert.ok(getToken().classList.contains("btn--post"), "a token for this user is already there");
        assert.ok(!renew().classList.contains("btn--primary"), "and it has not expired");

        await choose(app, find<HTMLSelectElement>(app, "#userId"), "1337");
        assert.ok(getToken().classList.contains("btn--primary"), "another user has no token yet");
    });

    it("leaves the accent to Renew when the picked user's token has expired", async (t) => {
        const expired = { ...token, expiresAt: new Date(Date.now() - 60_000).toISOString() };
        const { app } = await mount(t, { ...boot, "GET /api/tokens": [expired] });

        assert.ok(findByText(app, "#panel-test-user button", "Renew").classList.contains("btn--primary"));
        assert.ok(findByText(app, "#panel-test-user button", "Get token").classList.contains("btn--post"));
    });

    /*
     * Every panel is on screen from the first render, and the ones you cannot use yet say what they
     * are waiting for. The order the tool works in is then visible on the page.
     */
    it("shows every panel from the start, waiting where it cannot be used yet", async (t) => {
        const { app } = await mount(t, boot);

        // A token and nothing else. The panel you pick an application in is ready; the ones below it
        // are on screen and waiting.
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
     * A second LocalTest token for the same user has the same claims, so Get token replaces the first rather than adding a
     * row that only differs by the time. Another user's token and a pasted one for the same user are left alone.
     */
    it("replaces the picked user's older LocalTest token on Get token", async (t) => {
        const other: PublicToken = { ...token, id: "t2", label: "Beta Testperson", userId: "1337" };
        const pasted: PublicToken = { ...token, id: "t3", kind: "raw", label: "Pasted" };
        const fresh: PublicToken = { ...token, id: "t4" };
        let held = [token, other, pasted];

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/tokens": () => held,
            "POST /api/tokens/test-user": () => {
                held = [...held, fresh];
                return fresh;
            },
            "DELETE /api/tokens/t1": () => {
                held = held.filter((stored) => stored.id !== "t1");
                return null;
            }
        });

        await click(app, findByText(app, "#panel-test-user button", "Get token"));
        await app.wait(50);

        const deletes = stub.calls.filter((made) => made.startsWith("DELETE"));
        assert.deepEqual(deletes, ["DELETE /api/tokens/t1"], "only the older LocalTest token for 1001 goes");
        const rows = [...app.container.querySelectorAll("#panel-test-user .picklist__item")].map((row) => row.textContent ?? "");
        assert.equal(rows.length, 3);
        assert.match(rows.join("\n"), /Beta Testperson \(1337\) · /, "a row names its user id");
    });

    it("shows the error of the token action that ran last, not an older one of another kind", async (t) => {
        // Two tokens, since the list with its delete buttons only shows once there is more than one.
        const { app } = await mount(t, {
            ...boot,
            "GET /api/tokens": [token, { ...token, id: "t2", label: "Beta Testperson" }],
            "POST /api/tokens/test-user": () => {
                throw new Error("renew refused");
            },
            "DELETE /api/tokens/t1": () => {
                throw new Error("delete refused");
            }
        });
        const notice = () => app.container.querySelector("#panel-test-user .notice--bad")?.textContent ?? "";

        await click(app, findByText(app, "#panel-test-user button", "Renew"));
        await app.wait(50);
        assert.match(notice(), /renew refused/);

        await click(app, find(app, "button[aria-label='Delete token Sophie Salt']"));
        await app.wait(50);
        assert.match(notice(), /delete refused/);
        assert.doesNotMatch(notice(), /renew refused/);
    });

    /*
     * The app name is typed a character at a time, and every intermediate value is an app that does
     * not exist. The query is keyed on the settled name rather than the typed one, so the cache is
     * never told about those at all and there is nothing to cancel or log afterwards.
     */
    /*
     * Picking an app points the first element at its form at once, but that app's examples are
     * asked for only once the target has settled. The picker is up before they arrive, so loading
     * the first example on mount alone left the element empty.
     */
    it("loads the first example of an app picked from the catalogue once its examples arrive", async (t) => {
        const { app, stub } = await mount(t, catalogueRoutes);

        await choose(app, find<HTMLSelectElement>(app, "#application"), "dibk/et-v4");
        await app.wait(800);

        assert.ok(stub.calls.includes("GET /api/examples/file"), "the example should have been loaded");
        assert.equal(find<HTMLTextAreaElement>(app, "textarea").value, "<ET/>");
    });

    it("does not load over what was typed while the examples were on their way", async (t) => {
        const { app, stub } = await mount(t, catalogueRoutes);

        await choose(app, find<HTMLSelectElement>(app, "#application"), "dibk/et-v4");
        await type(app, find<HTMLTextAreaElement>(app, "textarea"), "typed by hand");
        await app.wait(800);

        assert.equal(stub.calls.includes("GET /api/examples/file"), false);
        assert.equal(find<HTMLTextAreaElement>(app, "textarea").value, "typed by hand");
    });

    it("does not load the example again when the field it loaded into is cleared", async (t) => {
        const { app, stub } = await mount(t, catalogueRoutes);

        await choose(app, find<HTMLSelectElement>(app, "#application"), "dibk/et-v4");
        await app.wait(800);
        await type(app, find<HTMLTextAreaElement>(app, "textarea"), "");
        await app.wait(100);

        assert.equal(stub.calls.filter((made) => made === "GET /api/examples/file").length, 1);
        assert.equal(find<HTMLTextAreaElement>(app, "textarea").value, "");
    });

    /*
     * A testmotor failure is shown on the picker whose data type it cost, not on every picker with
     * nothing to offer, which would include an attachment whose content type simply has no dummy.
     */
    describe("a testmotor failure on the example pickers", () => {
        const failingRoutes: Routes = {
            ...boot,
            "GET /api/app/metadata": {
                appUrl: "http://local.altinn.cloud:8000/dibk/et-v4",
                metadata: {
                    id: "dibk/et-v4",
                    org: "dibk",
                    mainFormDataType: "ET",
                    dataTypes: [
                        { id: "ET", maxCount: 1, allowedContentTypes: ["application/xml"], appLogic: { classRef: "x" } },
                        { id: "Tegning", allowedContentTypes: ["image/tiff"] }
                    ]
                }
            },
            "GET /api/examples": {
                dir: "/examples",
                groups: [],
                remote: {
                    url: "https://testmotor.example",
                    app: "et-v4",
                    error: "the ET download failed",
                    errors: { ET: "the ET download failed" }
                }
            }
        };

        it("is not shown on a picker whose data type had nothing fail", async (t) => {
            seed({ org: "dibk", app: "et-v4", dataElements: [{ dataType: "Tegning", content: "" }] });
            const { app } = await mount(t, failingRoutes);
            await app.wait(500);

            assert.equal(app.container.textContent?.includes("could not be read"), false);
            assert.ok(app.container.textContent?.includes("No example data for Tegning"));
        });

        it("is shown on the picker whose data type it cost", async (t) => {
            seed({ org: "dibk", app: "et-v4", dataElements: [{ dataType: "ET", content: "" }] });
            const { app } = await mount(t, failingRoutes);
            await app.wait(500);

            assert.ok(app.container.textContent?.includes("No example data for ET: the testmotor could not be read."));

            // The reason waits behind More, with the url in front since this one does not name it.
            const detail = find(app, ".notice--bad .notice__detail");
            assert.equal(detail.textContent, "https://testmotor.example: the ET download failed");
            assert.equal(detail.hasAttribute("hidden"), true);
            await click(app, findByText(app, ".notice--bad button", "More"));
            assert.equal(detail.hasAttribute("hidden"), false);
        });
    });

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
        // type the app declared is what it went in to fill, and the write that could carry a stale
        // payload back with it.
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
     * Creating an instance and adding to one are two answers to the same question, and which one is
     * in force is a control of its own, so it can be read and changed without opening anything.
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
        assert.ok(willCall(app).includes(`/instances/510001/${A.slice(0, 8)}…/data`));

        // Back to creating one, from the panel rather than from the window.
        await click(app, findByText(app, "#panel-instances .modes__choice", "New instance"));
        await app.wait(20);

        assert.equal(postingTo(app), "New instance");
        assert.equal(instancePicked(app), "", "nothing to name once the post is the thing that creates it");
        assert.match(willCall(app), /\/instances {2}\(multipart/);
    });

    it("says so when the browser will not store a payload, and lists nothing it did not keep", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });
        const setItem = window.Storage.prototype.setItem;
        window.Storage.prototype.setItem = function (key: string, value: string) {
            if (key === "altinn-api-tools:savedPayloads") throw new window.DOMException("The quota has been exceeded.", "QuotaExceededError");
            setItem.call(this, key, value);
        };
        t.after(() => {
            window.Storage.prototype.setItem = setItem;
        });

        const { app } = await mount(t, boot);
        await app.wait(700);

        await click(app, findByText(app, "#panel-payload button", "Save"));
        await type(app, find<HTMLInputElement>(app, "dialog input[aria-label='Name for the saved payload']"), "Too big");
        await click(app, find(app, "dialog button[type='submit']"));
        await app.wait(20);

        assert.match(app.container.querySelector("#panel-payload .notice--warn")?.textContent ?? "", /would not store that payload/);
        assert.equal(findByText(app, "#panel-payload button", "Open").textContent, "Open", "nothing saved, so nothing to open");
    });

    it("drops the instance when the target moves to another app", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);
        assert.match(postingTo(app), /^Existing instance/, "the seeded instance is the one a post would add to");

        await choose(app, find<HTMLSelectElement>(app, "#application"), "other");
        await type(app, find<HTMLInputElement>(app, "#panel-target input[aria-label='App']"), "et-v5");
        await app.wait(20);

        assert.equal(postingTo(app), "New instance", "an instance of et-v4 is not one a post to et-v5 can add to");
        assert.equal(instancePicked(app), "");
    });

    it("keeps the instance when what is typed still names the same app", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": (url) => instanceRead(url.searchParams.get("instanceGuid") ?? "", "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        // The fields trim what is typed, so this hands the same app back to the tool.
        await choose(app, find<HTMLSelectElement>(app, "#application"), "other");
        await type(app, find<HTMLInputElement>(app, "#panel-target input[aria-label='App']"), "et-v4 ");
        await app.wait(20);

        assert.match(postingTo(app), /^Existing instance/);
        assert.match(instancePicked(app), new RegExp(A.slice(0, 8)));
    });

    /*
     * The window is only ever about which existing instance, so picking one out of it is the whole
     * of what it does. Every other test here reaches an instance by typing its guid.
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

        // Short on screen, without the host and with the guid cut, and whole on hover.
        const shown = app.container.textContent ?? "";
        const hovered = [...app.container.querySelectorAll("[title]")].map((element) => element.getAttribute("title"));
        const instance = `http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/${A}`;
        const short = `/dibk/et-v4/instances/510001/${A.slice(0, 8)}…`;
        for (const [path, what] of [
            ["/pdf/preview?language=nb", "the pdf panel's url"],
            ["/process/next?lang=nb", "the process panel's url"],
            [`/data/${A}-data`, "the data element panel's url"]
        ] as const) {
            assert.ok(hovered.includes(`${instance}${path}`), `${what}, whole on hover`);
            assert.ok(shown.includes(`${short}${path.replace(A, `${A.slice(0, 8)}…`)}`), `${what}, short on screen`);
        }

        // The picked data element's guid is on the select's hover, not on a line of its own under it.
        assert.equal(find(app, "#dataGuid").getAttribute("title"), `${A}-data`);
        const hints = [...app.container.querySelectorAll("#panel-data-element .field__hint")].map((hint) => hint.textContent);
        assert.ok(!hints.includes(`${A}-data`), "no hint line holding the guid alone");
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
        assert.equal(
            app.container.querySelector("#panel-payload .panel__head .badge")?.textContent,
            "1 element",
            "and the panel counts it the same way"
        );
        assert.equal(railValue(app, "Prevalidation"), "not run");

        await click(app, findByText(app, "#panel-prevalidation button", "Prevalidate"));
        await app.wait(50);

        assert.equal(railValue(app, "Prevalidation"), "1 document missing");
        // And the panel read the same report, rather than each holding one of its own.
        assert.match(app.container.textContent ?? "", /Situasjonsplan/);
    });

    /*
     * One language for every request that takes one, with a picker in each panel that sends one.
     * Changing it in one panel changes it in all of them, and each request carries it under the
     * name its server route reads: prevalidation, process/next and a run that advances. A run that
     * does not advance has no process/next for it to go to, so it sends none.
     */
    it("asks in the language picked in any panel, prevalidation, process/next and an advancing run alike", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A, dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });
        const sent: Record<string, unknown[]> = { report: [], next: [], run: [] };

        const { app } = await mount(t, {
            ...boot,
            "GET /api/config": { ...config, validationUrl: "http://localhost:6000/validate" },
            "GET /api/instances": () => instanceRead(A, "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation,
            "POST /api/validation-report": (_url, body) => {
                sent.report!.push(body);
                return { ok: true, steps: [], failedAt: null, report: { soknadtype: "ET", messages: [] } };
            },
            "PUT /api/instances/process/next": (_url, body) => {
                sent.next!.push(body);
                return {
                    ok: false,
                    steps: [],
                    failedAt: "Could not advance the process.",
                    instanceOwnerPartyId: "510001",
                    instanceGuid: A,
                    process: null
                };
            },
            "POST /api/runs": (_url, body) => {
                sent.run!.push(body);
                return { ok: true, mode: "existing", steps: [], instanceOwnerPartyId: "510001", instanceGuid: A, instance: {}, failedAt: null };
            }
        });
        await app.wait(700);

        const pickers = ["#pdfLanguage", "#prevalidationLanguage", "#processLanguage", "#postLanguage"];
        const picked = () => pickers.map((id) => (find(app, id) as HTMLSelectElement).value);
        assert.deepEqual(picked(), ["nb", "nb", "nb", "nb"]);

        await choose(app, find(app, "#prevalidationLanguage") as HTMLSelectElement, "nn");
        assert.deepEqual(picked(), ["nn", "nn", "nn", "nn"], "one choice, shown by every picker");
        assert.match(find(app, "#panel-prevalidation").textContent ?? "", /validate\?spraak=nn/, "the prevalidation url says what is sent");
        assert.match(find(app, "#panel-process").textContent ?? "", /process\/next\?lang=nn/, "and so does the process panel's");

        await click(app, findByText(app, "#panel-prevalidation button", "Prevalidate"));
        await app.wait(50);
        assert.equal((sent.report![0] as { language?: string }).language, "nn");

        await click(app, find(app, "#panel-process .btn--put"));
        await app.wait(50);
        assert.equal((sent.next![0] as { language?: string }).language, "nn");

        // Not advancing: the picker is there but off, and the run carries no language.
        assert.equal((find(app, "#postLanguage") as HTMLSelectElement).disabled, true);
        await click(app, findByText(app, "#panel-post button", "Add data"));
        await app.wait(900);
        assert.equal("language" in (sent.run![0] as object), false);

        await click(app, find(app, "#panel-post input[type=checkbox]"));
        assert.equal((find(app, "#postLanguage") as HTMLSelectElement).disabled, false);
        assert.match(find(app, "#panel-post").textContent ?? "", /process\/next\?lang=nn/, "the post panel's note says what is sent");
        await choose(app, find(app, "#postLanguage") as HTMLSelectElement, "en");
        assert.deepEqual(picked(), ["en", "en", "en", "en"]);
        await click(app, findByText(app, "#panel-post button", "Add data"));
        await app.wait(900);
        assert.equal((sent.run![1] as { language?: string; advanceProcess?: boolean }).language, "en");
    });

    /*
     * A run that some forms were refused in replaces the previous report with what it was told,
     * marked as partial, since the previous one described a payload that has since changed. Only a
     * run told nothing at all leaves the earlier report up, marked as such.
     */
    it("shows a partial report in place of the previous one, and keeps the previous one only when nothing answered", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });
        const finding = (rule: string) => ({ rule, reference: `Ettrinn.Vedlegg.${rule}`, message: `${rule} mangler`, messagetype: "ERROR" });
        const answers = [
            { ok: true, steps: [], failedAt: null, refused: [], report: { soknadtype: "ET", messages: [finding("Situasjonsplan")] } },
            {
                ok: false,
                steps: [],
                failedAt: "The validation service would not answer about GjennomfoeringsplanDataV7.",
                refused: ["GjennomfoeringsplanDataV7"],
                report: { soknadtype: "ET", messages: [finding("Tegning")] }
            },
            { ok: false, steps: [], failedAt: "The validation service would not answer about ET.", refused: ["ET"], report: null }
        ];
        let call = 0;
        const { app } = await mount(t, {
            ...boot,
            "GET /api/config": { ...config, validationUrl: "http://localhost:6000/validate" },
            "POST /api/validation-report": () => answers[call++]
        });
        await app.wait(700);
        const prevalidate = async () => {
            await click(app, findByText(app, "#panel-prevalidation button", "Prevalidate"));
            await app.wait(50);
        };
        const panel = () => app.container.querySelector("#panel-prevalidation")?.textContent ?? "";

        await prevalidate();
        assert.match(panel(), /Situasjonsplan/);

        await prevalidate();
        assert.match(panel(), /Partial report\. The service would not answer about GjennomfoeringsplanDataV7/);
        assert.match(panel(), /Tegning/, "the partial report should replace the previous one");
        assert.doesNotMatch(panel(), /Situasjonsplan/);
        assert.equal(railValue(app, "Prevalidation"), "1 document missing, partial");

        await prevalidate();
        assert.match(panel(), /This is from an earlier run\./);
        assert.match(panel(), /Tegning/, "with nothing answered, the earlier report stays up");
        assert.equal(railValue(app, "Prevalidation"), "last run got no answer");
    });

    /*
     * The rail and the panel are two views of one report, and must not read as disagreeing. Whether
     * a required document is missing is a narrower question than the one the notice looks like it
     * is answering: a report with an error inside the form and four documents it only recommends
     * has nothing required missing, and is still red. 1 error and 7 warnings is the same eight
     * findings as four recommendations and four rules about the form's own content.
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

        // No document is required and missing, so nothing is outstanding, and that alone must not
        // make the panel green.
        assert.equal(railValue(app, "Prevalidation"), "1 error, 7 warnings");
        assert.equal(noticeTone(app, "#panel-prevalidation"), "notice--bad");

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
     * The two comparison filters keep their titles on screen and their reasons behind More. Opening a reason must not
     * tick the box, which is why the toggle sits beside the label rather than inside it.
     */
    it("keeps the comparison filters' reasons behind More, without ticking the box", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });
        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": () => instanceRead(A, "ET"),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        const option = () => findByText(app, "#panel-data-element .check--option", "Hide altinnRowId");
        const box = () => option().querySelector<HTMLInputElement>("input[type='checkbox']");
        const note = () => option().querySelector(".check__note");
        assert.equal(box()?.checked, true, "on by default");
        assert.equal(note()?.hasAttribute("hidden"), true, "the reason waits behind More");

        await click(app, findByText(app, "#panel-data-element .check--option button", "More"));
        assert.equal(note()?.hasAttribute("hidden"), false);
        assert.equal(box()?.checked, true, "and opening it left the box alone");

        await click(app, find(app, "#panel-data-element .check--option label"));
        assert.equal(box()?.checked, false, "the title still ticks it");
    });

    /*
     * An open element says how much it holds once, under the editor, and what its data type is once, in the select. The
     * bar under it only carries those while it is collapsed, or empty, which is a warning either way.
     */
    it("says the size and the data type of a payload element once", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", dataElements: [{ dataType: "ET", content: "<ettrinn />" }] });
        const { app } = await mount(t, boot);
        await app.wait(700);

        const element = () => find(app, "#panel-payload .element");
        assert.equal(element().querySelector(".element__summary"), null, "open, the bar leaves the size to the note");
        assert.match(element().textContent ?? "", /11 characters/, "which says it");
        assert.equal(element().querySelector(".element__meta")?.textContent, "x", "the model class alone under it");
        assert.match(find<HTMLSelectElement>(app, `#panel-payload select`).textContent ?? "", /form data · max 1/, "the select says the rest");

        await click(app, find(app, "#panel-payload .element__toggle"));
        assert.equal(element().querySelector(".element__summary")?.textContent, "11 characters", "collapsed, the bar says it");
    });

    /*
     * Moving the process on is where the app adds and writes data elements, and the panel that reads
     * them is above Process. So after a move the Process panel says what it did, the rail reopens
     * Data element, and the button takes you back up to the first element the move touched.
     */
    it("leads back to the data elements after a process move, until you have looked", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });
        const before = instanceRead(A, "ET");
        let moved = false;
        const after = {
            ...before,
            dataElements: [
                { ...before.dataElements[0]!, lastChanged: "2026-11-19T10:00:00Z" },
                { id: "pdf-1", dataType: "ref-data-as-pdf", contentType: "application/pdf", filename: "Skjema.pdf", size: 2048, lastChanged: null }
            ],
            process: { taskId: "Task_2", taskType: "signing", ended: null, currentTask: "Task_2" }
        };

        // jsdom lays nothing out, so it has no scrolling either. Where the button scrolls to is the click's to check, not this.
        const proto = window.HTMLElement.prototype as { scrollIntoView?: () => void };
        const scrolled: string[] = [];
        const had = proto.scrollIntoView;
        proto.scrollIntoView = function (this: HTMLElement) {
            scrolled.push(this.id);
        };
        t.after(() => {
            proto.scrollIntoView = had;
        });

        const { app } = await mount(t, {
            ...boot,
            "GET /api/instances": () => (moved ? after : before),
            "PUT /api/instances/process/next": () => {
                moved = true;
                return { ok: true, steps: [], failedAt: null, instanceOwnerPartyId: "510001", instanceGuid: A, process: after.process };
            },
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation
        });
        await app.wait(700);

        const railState = () =>
            [...app.container.querySelectorAll(".rail__step")]
                .find((row) => row.querySelector(".rail__label")?.textContent === "Data element")
                ?.className.match(/rail__step--(\w+)/)?.[1];
        assert.equal(railState(), "done", "a read instance with an element selected is settled");
        assert.equal(app.container.querySelector("#panel-process .notice"), null, "and there is nothing to follow up before a move");

        await click(app, find(app, "#panel-process .btn--put"));
        await app.wait(100);

        const followUp = find(app, "#panel-process .notice");
        assert.match(followUp.textContent ?? "", /Moved from Task_1 to Task_2/);
        assert.match(followUp.textContent ?? "", /2 data elements, 1 new, 1 changed: ref-data-as-pdf \(Skjema\.pdf\), ET/);
        assert.equal(railValue(app, "Data element"), "1 new, 1 changed to check");
        assert.equal(railState(), "next", "the rail should send you back up");
        assert.match(elementsListed(app), /new · ref-data-as-pdf/, "and the list should say which ones");
        assert.match(elementsListed(app), /changed · ET/);

        await click(app, findByText(app, "#panel-process button", "Check data elements"));
        assert.equal(find<HTMLSelectElement>(app, "#dataGuid").value, "pdf-1", "the first new element should be picked");
        assert.deepEqual(scrolled, ["panel-data-element"]);
        assert.equal(railState(), "done", "and having looked settles the rail again");
        assert.equal(railValue(app, "Data element"), "ref-data-as-pdf");
    });

    /*
     * A pdf data element opens in the browser's viewer rather than as a line saying it is a file, and is known by its
     * first bytes as well as its content type, since an attachment can be stored as octet-stream. Anything else that
     * is not text still says so.
     */
    describe("Show content on a data element", () => {
        const routesFor = (contentType: string, content: string): Routes => ({
            ...boot,
            "GET /api/instances": () => ({
                ...instanceRead(A, "ET"),
                dataElements: [{ id: `${A}-data`, dataType: "Vedlegg", contentType, filename: "plan.pdf", size: 9, lastChanged: null }]
            }),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": { ...elementRead, contentType, encoding: "base64", content, size: 9 },
            "GET /api/instances/data-element/validate": emptyValidation
        });

        async function open(t: TestContext, routes: Routes): Promise<Rendered> {
            seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });
            const { app } = await mount(t, routes);
            await app.wait(700);
            await choose(app, find<HTMLSelectElement>(app, "#dataGuid"), `${A}-data`);
            await app.wait(50);
            await click(app, findByText(app, "#panel-data-element button", "Show content"));
            return app;
        }

        it("shows a pdf in the viewer, at 100%, in the wide window", async (t) => {
            const app = await open(t, routesFor("application/pdf", btoa("%PDF-1.7\n")));

            assert.match(find(app, "dialog iframe").getAttribute("src") ?? "", /^blob:.*#zoom=100$/);
            assert.ok(find(app, "dialog").classList.contains("modal--pdf"));
            assert.ok(findByText(app, "dialog a", "Open in new tab"));

            // And the url goes with the window, rather than holding the file in memory until the tab closes.
            const url = findByText(app, "dialog a", "Open in new tab").getAttribute("href");
            const revoked = t.mock.method(URL, "revokeObjectURL");
            await click(app, findByText(app, "dialog button", "Close"));
            assert.deepEqual(
                revoked.mock.calls.map((call) => call.arguments[0]),
                [url]
            );
        });

        it("knows a pdf stored as octet-stream by its first bytes", async (t) => {
            const app = await open(t, routesFor("application/octet-stream", btoa("%PDF-1.7\n")));
            assert.ok(app.container.querySelector("dialog iframe"));
        });

        it("still only offers the download for a file that is not a pdf", async (t) => {
            const app = await open(t, routesFor("image/png", btoa("\x89PNG\r\n\x1a\n")));

            assert.equal(app.container.querySelector("dialog iframe"), null);
            assert.equal(find(app, "dialog").classList.contains("modal--pdf"), false);
            assert.match(find(app, "dialog").textContent ?? "", /which is a file rather than text/);
        });
    });

    /*
     * A render is the most expensive read the tool makes: the app lays the whole form out and what
     * comes back is the pdf as base64. Pressing the button twice without having changed anything in
     * between must not do all of that twice, so the pdf is kept after the window closes, with a
     * fingerprint of what it was rendered from.
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
        // Past the hint's More, which sits above the button in the panel.
        const pdfButton = () => find(app, "#panel-pdf button:not(.explained__toggle)");

        assert.equal(pdfButton().textContent, "Render pdf");
        await click(app, pdfButton());
        await app.wait(50);
        assert.equal(renders(), 1, "the first press should have asked the app");
        assert.ok(app.container.querySelector("dialog"), "and opened the window");
        // At 100%, so an A4 page is not opened a few percent short of its size.
        assert.match(find(app, "dialog iframe").getAttribute("src") ?? "", /^blob:.*#zoom=100$/);
        // In the wider window, so the page fits at that size without a sideways scrollbar.
        assert.ok(find(app, "dialog").classList.contains("modal--pdf"));

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
     * Besides the whole instance, the app can render the main form alone and each subform element on
     * its own. Which of those it has is asked of the app, and each is a target of its own in the
     * cache: holding the main form says nothing about the whole instance, or about the main form in
     * another language.
     */
    it("renders the main form or one subform on its own, in the language picked", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });
        const withSubforms = instanceRead(A, "ET");
        withSubforms.dataElements.push(
            { id: "plan-1", dataType: "Plan", contentType: "application/xml", filename: null, size: 10, lastChanged: null },
            { id: "plan-2", dataType: "Plan", contentType: "application/xml", filename: null, size: 10, lastChanged: null }
        );

        let moved = false;
        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances": () => (moved ? { ...withSubforms, process: { ...withSubforms.process, currentTask: "Task_2" } } : withSubforms),
            "PUT /api/instances/process/next": () => ({
                ok: true,
                steps: [],
                failedAt: null,
                instanceOwnerPartyId: "510001",
                instanceGuid: A,
                process: { currentTask: "Task_2", taskType: "data", started: null, ended: null, endEvent: null }
            }),
            "GET /api/instances/validate": emptyValidation,
            "GET /api/instances/data-element": elementRead,
            "GET /api/instances/data-element/validate": emptyValidation,
            "GET /api/instances/pdf-targets": {
                ok: true,
                steps: [],
                failedAt: null,
                pdfTasks: ["PdfForm"],
                subformPdfTasks: [{ taskId: "PdfSubform", dataType: "Plan" }]
            },
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

        const buttons = () => [...app.container.querySelectorAll("#panel-pdf .row button")];
        const labels = () => buttons().map((button) => button.textContent);
        const renders = () => stub.calls.flatMap((made, index) => (made === "GET /api/instances/pdf-preview" ? [stub.url(index).searchParams] : []));

        assert.deepEqual(labels(), ["Whole instance", "Main form", "Plan 1", "Plan 2"]);
        assert.equal(stub.calls.filter((made) => made === "GET /api/instances/pdf-targets").length, 1, "the app should be asked once");

        await click(app, findByText(app, "#panel-pdf button", "Plan 2"));
        await app.wait(50);
        assert.equal(renders().length, 1);
        assert.equal(renders()[0]?.get("taskId"), "PdfSubform");
        assert.equal(renders()[0]?.get("dataElementId"), "plan-2");
        assert.equal(renders()[0]?.get("language"), "nb");
        await click(app, findByText(app, "dialog button", "Close"));

        // The held one is grey, and only that one: the others would still ask.
        const grey = buttons().filter((button) => button.classList.contains("btn--ghost"));
        assert.deepEqual(
            grey.map((button) => button.textContent),
            ["Plan 2"]
        );
        assert.ok(labels().includes("Render again"));

        // Another language is another document, so nothing on offer is the one in hand any more.
        await choose(app, find(app, "#pdfLanguage") as HTMLSelectElement, "nn");
        assert.equal(
            buttons().some((button) => button.textContent === "Plan 2" && button.classList.contains("btn--ghost")),
            false
        );
        assert.ok(labels().includes("Show the last one"));

        await click(app, findByText(app, "#panel-pdf button", "Main form"));
        await app.wait(50);
        assert.equal(renders().length, 2);
        assert.equal(renders()[1]?.get("taskId"), "PdfForm");
        assert.equal(renders()[1]?.has("dataElementId"), false);
        assert.equal(renders()[1]?.get("language"), "nn");
        await click(app, findByText(app, "dialog button", "Close"));
        assert.equal(
            findByText(app, "#panel-pdf button", "Main form").classList.contains("btn--ghost"),
            true,
            "held in the language it was asked in"
        );

        // Moving the instance on makes the one in hand a picture of what it was.
        moved = true;
        await click(app, find(app, "#panel-process .btn--put"));
        await app.wait(50);
        assert.equal(findByText(app, "#panel-pdf button", "Main form").classList.contains("btn--ghost"), false);
        assert.ok(labels().includes("Show the last one"));
        assert.equal(labels().includes("Render again"), false);
    });

    /* Asked through an instance the app knows, so a refused read is not followed by a second refusal. */
    it("does not ask for the pdf tasks through an instance the app would not read", async (t) => {
        seed({ org: "dibk", app: "et-v4", partyId: "510001", instanceGuid: A });

        const { app, stub } = await mount(t, {
            ...boot,
            "GET /api/instances": () => ({
                ...instanceRead(A, "ET"),
                ok: false,
                failedAt: "Could not read the instance.",
                dataElements: [],
                process: null
            }),
            "GET /api/instances/validate": emptyValidation
        });
        await app.wait(700);

        assert.ok(stub.calls.includes("GET /api/instances"), "the read should have gone out");
        assert.equal(stub.calls.includes("GET /api/instances/pdf-targets"), false);
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
