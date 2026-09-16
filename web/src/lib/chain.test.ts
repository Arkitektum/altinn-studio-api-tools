import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestChain } from "./chain";
import type { ChainInputs } from "./chain";

const nothing: ChainInputs = {
    user: null,
    application: null,
    party: null,
    instance: null,
    dataElement: null,
    payload: { elements: 1, ready: false },
    prevalidation: { run: false, stale: false, outstanding: 0 },
    post: { stored: 0 }
};

const onApp = { ...nothing, user: "Sophie Salt", application: "dibk/et-v4" };
const step = (inputs: ChainInputs, label: string) => requestChain(inputs).find((each) => each.label === label);
const labels = (inputs: ChainInputs) => requestChain(inputs).map((each) => each.label);

describe("requestChain", () => {
    it("runs in the order the panels do, so a row and the column agree", () => {
        assert.deepEqual(labels(nothing), ["Test user", "Application", "Party", "Instance", "Payload", "Prevalidation", "Post", "Data element"]);
    });

    it("points at the token on a cold start, and everything else waits on it", () => {
        const states = requestChain(nothing).map((each) => each.state);
        assert.deepEqual(states, ["next", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]);
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
        assert.equal(step(ready, "Prevalidation")?.value, "not run");
        assert.equal(step({ ...ready, prevalidation: { run: true, stale: false, outstanding: 2 } }, "Prevalidation")?.value, "2 documents missing");
        assert.equal(step({ ...ready, prevalidation: { run: true, stale: true, outstanding: 0 } }, "Prevalidation")?.value, "payload has changed");

        const clean = { ...ready, prevalidation: { run: true, stale: false, outstanding: 0 } };
        assert.equal(step(clean, "Prevalidation")?.value, "nothing missing");
        assert.equal(step(clean, "Prevalidation")?.state, "done");
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
                "panel-data-element"
            ]
        );
    });
});
