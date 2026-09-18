import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestChain, verdictOf } from "./chain";
import type { ChainInputs, PrevalidationSummary } from "./chain";

const nothing: ChainInputs = {
    user: null,
    application: null,
    party: null,
    instance: null,
    dataElement: null,
    payload: { elements: 1, ready: false },
    prevalidation: { run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 },
    post: { stored: 0 },
    pdf: "none",
    process: null
};

const onApp = { ...nothing, user: "Sophie Salt", application: "dibk/et-v4" };
const step = (inputs: ChainInputs, label: string) => requestChain(inputs).find((each) => each.label === label);
const labels = (inputs: ChainInputs) => requestChain(inputs).map((each) => each.label);

describe("requestChain", () => {
    it("runs in the order the panels do, so a row and the column agree", () => {
        assert.deepEqual(labels(nothing), [
            "Test user",
            "Application",
            "Party",
            "Instance",
            "Payload",
            "Prevalidation",
            "Post",
            "Data element",
            "Pdf",
            "Process"
        ]);
    });

    it("points at the token on a cold start, and everything else waits on it", () => {
        const states = requestChain(nothing).map((each) => each.state);
        assert.deepEqual(states, ["next", ...Array<string>(9).fill("waiting")]);
    });

    /*
     * The steps are not one line. A payload can be written before a party is chosen, so more than
     * one is open at once and the rail says so rather than picking one to call next.
     */
    it("opens the payload as soon as there is an application, party or no party", () => {
        assert.equal(step(onApp, "Party")?.state, "next");
        assert.equal(step(onApp, "Payload")?.state, "next");
    });

    it("counts the payload, and says when it could not be posted as it stands", () => {
        assert.equal(step(onApp, "Payload")?.value, "1 element, incomplete");
        assert.equal(step({ ...onApp, payload: { elements: 2, ready: true } }, "Payload")?.value, "2 elements");
    });

    it("waits to prevalidate until there is something that could be sent", () => {
        assert.equal(step(onApp, "Prevalidation")?.state, "waiting");
        assert.equal(step({ ...onApp, payload: { elements: 1, ready: true } }, "Prevalidation")?.state, "next");
    });

    it("says what the service last answered", () => {
        const ready = { ...onApp, payload: { elements: 1, ready: true } };
        const said = (prevalidation: PrevalidationSummary) => step({ ...ready, prevalidation }, "Prevalidation")?.value;

        assert.equal(said({ run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 }), "not run");
        assert.equal(said({ run: true, stale: false, outstanding: 2, errors: 2, warnings: 0 }), "2 documents missing");
        assert.equal(said({ run: true, stale: false, outstanding: 1, errors: 1, warnings: 0 }), "1 document missing");
        assert.equal(said({ run: true, stale: true, outstanding: 0, errors: 0, warnings: 0 }), "payload has changed");

        const clean = { ...ready, prevalidation: { run: true, stale: false, outstanding: 0, errors: 0, warnings: 0 } };
        assert.equal(step(clean, "Prevalidation")?.value, "nothing missing");
        assert.equal(step(clean, "Prevalidation")?.state, "done");
    });

    /*
     * The errors that are not one of the missing documents are counted separately, so nothing is
     * said twice. Four errors of which three are documents is "3 documents missing, 1 error".
     */
    it("counts what the report found beyond the documents, without counting a document twice", () => {
        const ready = { ...onApp, payload: { elements: 1, ready: true } };
        const said = (prevalidation: PrevalidationSummary) => step({ ...ready, prevalidation }, "Prevalidation")?.value;

        assert.equal(said({ run: true, stale: false, outstanding: 3, errors: 4, warnings: 0 }), "3 documents missing, 1 error");
        assert.equal(said({ run: true, stale: false, outstanding: 0, errors: 2, warnings: 3 }), "2 errors, 3 warnings");
        assert.equal(said({ run: true, stale: false, outstanding: 0, errors: 0, warnings: 1 }), "1 warning");
        assert.equal(said({ run: true, stale: false, outstanding: 1, errors: 1, warnings: 2 }), "1 document missing, 2 warnings");
    });

    /*
     * The one step whose job is to find things wrong, so it is the one that says so in colour. A
     * row in either state is still reachable, and so is still a link to the panel that would fix it.
     */
    it("colours the prevalidation by what it found, worst first", () => {
        const ready = { ...onApp, payload: { elements: 1, ready: true } };
        const stateOf = (prevalidation: PrevalidationSummary) => step({ ...ready, prevalidation }, "Prevalidation")?.state;

        assert.equal(stateOf({ run: true, stale: false, outstanding: 2, errors: 2, warnings: 0 }), "error");
        assert.equal(stateOf({ run: true, stale: false, outstanding: 0, errors: 1, warnings: 4 }), "error");
        assert.equal(stateOf({ run: true, stale: false, outstanding: 0, errors: 0, warnings: 1 }), "warning");
        assert.equal(stateOf({ run: true, stale: false, outstanding: 0, errors: 0, warnings: 0 }), "done");
    });

    /*
     * Not run is a step still ahead of you, and an answer the payload has moved on from describes
     * something else. Neither is a finding, so neither is coloured as one.
     */
    it("does not colour an answer it has not got, or one that is out of date", () => {
        const ready = { ...onApp, payload: { elements: 1, ready: true } };
        const stateOf = (prevalidation: PrevalidationSummary) => step({ ...ready, prevalidation }, "Prevalidation")?.state;

        assert.equal(stateOf({ run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 }), "next");
        assert.equal(stateOf({ run: true, stale: true, outstanding: 3, errors: 3, warnings: 2 }), "next");
    });

    /* Out of reach outranks everything: a step you cannot get to yet has found nothing. */
    it("stays waiting while the payload is not ready, whatever the last answer was", () => {
        const notReady = { ...onApp, prevalidation: { run: true, stale: false, outstanding: 3, errors: 3, warnings: 0 } };
        assert.equal(step(notReady, "Prevalidation")?.state, "waiting");
    });

    /* Switched off is not a step you failed to do, so it is left out rather than shown as waiting. */
    it("leaves the prevalidation out when the service is switched off", () => {
        assert.equal(labels({ ...onApp, prevalidation: null }).includes("Prevalidation"), false);
    });

    /*
     * The new instance row is a choice rather than a gap: posting with it selected creates one, so
     * the step is settled once there is a party to list for.
     */
    it("settles the instance step once there is a party", () => {
        const withParty = { ...onApp, party: "510001" };
        assert.equal(step(withParty, "Instance")?.state, "done");
        assert.equal(step(withParty, "Instance")?.value, "new");
        // And the data element still waits, since a new instance has nothing on it to read.
        assert.equal(step(withParty, "Data element")?.state, "waiting");
    });

    it("opens the data element only once a real instance is selected", () => {
        const onInstance = { ...onApp, party: "510001", instance: "99d0632c" };
        assert.equal(step(onInstance, "Data element")?.state, "next");
        assert.equal(step({ ...onInstance, dataElement: "ET" }, "Data element")?.state, "done");
    });

    /*
     * The send needs a party as well as something to send, which the payload does not: a payload can
     * be written against an application alone, but a post is made for someone.
     */
    it("waits to post until there is a party and a payload worth sending", () => {
        const ready = { ...onApp, payload: { elements: 1, ready: true } };
        assert.equal(step(ready, "Post")?.state, "waiting", "there is no party yet");
        assert.equal(step({ ...onApp, party: "510001" }, "Post")?.state, "waiting", "and the payload is incomplete");
        assert.equal(step({ ...ready, party: "510001" }, "Post")?.state, "next");
    });

    /*
     * What is stored rather than whether a post was made. An instance picked from the list was
     * posted to by someone, and one you posted to yourself is the same instance from here on.
     */
    it("counts what is on the instance rather than what was sent", () => {
        const posting = { ...onApp, party: "510001", payload: { elements: 1, ready: true } };
        assert.equal(step(posting, "Post")?.value, "nothing stored");
        assert.equal(step({ ...posting, post: { stored: 3 } }, "Post")?.value, "3 stored");
        assert.equal(step({ ...posting, post: { stored: 3 } }, "Post")?.state, "done");
    });

    /*
     * A render describes an instance, so it needs a real one, and a pdf that no longer describes it
     * is back to something you can act on rather than something settled.
     */
    it("says whether there is a pdf and whether it is still the right one", () => {
        const onInstance = { ...onApp, party: "510001", instance: "99d0632c" };
        assert.equal(step(onApp, "Pdf")?.state, "waiting", "there is no instance to render");
        assert.equal(step(onInstance, "Pdf")?.value, "not rendered");
        assert.equal(step(onInstance, "Pdf")?.state, "next");

        assert.equal(step({ ...onInstance, pdf: "current" }, "Pdf")?.value, "rendered");
        assert.equal(step({ ...onInstance, pdf: "current" }, "Pdf")?.state, "done");
        assert.equal(step({ ...onInstance, pdf: "stale" }, "Pdf")?.value, "out of date");
        assert.equal(step({ ...onInstance, pdf: "stale" }, "Pdf")?.state, "next");
    });

    /*
     * The end of the chain. Nothing follows a submission that has been signed and sent, which is the
     * one step whose done is not the start of the next one.
     */
    it("ends on where the instance stands, once a read has said", () => {
        const onInstance = { ...onApp, party: "510001", instance: "99d0632c" };
        assert.equal(step(onInstance, "Process")?.value, null, "the instance has not been read yet");
        assert.equal(step(onInstance, "Process")?.state, "next");

        const inTask = { ...onInstance, process: { at: "Task_1", ended: false } };
        assert.equal(step(inTask, "Process")?.value, "Task_1");
        assert.equal(step(inTask, "Process")?.state, "next");

        const done = { ...onInstance, process: { at: "ended", ended: true } };
        assert.equal(step(done, "Process")?.state, "done");
    });

    /* Three steps in a row that used to be one panel, so each has to lead somewhere of its own. */
    it("carries the panel each row scrolls to", () => {
        assert.deepEqual(
            requestChain(nothing).map((each) => each.anchor),
            [
                "panel-test-user",
                "panel-target",
                "panel-target",
                "panel-instances",
                "panel-payload",
                "panel-prevalidation",
                "panel-post",
                "panel-data-element",
                "panel-pdf",
                "panel-process"
            ]
        );
    });
});

/*
 * The rail row and the prevalidation panel's notice are coloured by this one function, which is the
 * whole reason it exists. They used to decide separately, and the panel asked only whether a
 * required document was missing, so a report with an error inside the form and four documents it
 * recommends was a green notice under a red rail row.
 */
describe("verdictOf", () => {
    it("takes the worst of everything the report found, not only the documents", () => {
        assert.equal(verdictOf({ run: true, stale: false, outstanding: 0, errors: 1, warnings: 7 }), "error");
        assert.equal(verdictOf({ run: true, stale: false, outstanding: 2, errors: 2, warnings: 0 }), "error");
        assert.equal(verdictOf({ run: true, stale: false, outstanding: 0, errors: 0, warnings: 4 }), "warning");
        assert.equal(verdictOf({ run: true, stale: false, outstanding: 0, errors: 0, warnings: 0 }), "clean");
    });

    it("has no verdict on a report it has not got, or one the payload has moved on from", () => {
        assert.equal(verdictOf({ run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 }), null);
        assert.equal(verdictOf({ run: true, stale: true, outstanding: 0, errors: 3, warnings: 2 }), null);
    });
});
