import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestChain } from "./chain";
import type { ChainInputs } from "./chain";

const nothing: ChainInputs = { user: null, application: null, party: null, instance: null, dataElement: null };

const states = (inputs: ChainInputs) => requestChain(inputs).map((step) => step.state);
const values = (inputs: ChainInputs) => requestChain(inputs).map((step) => step.value);

describe("requestChain", () => {
    it("points at the token on a cold start, and everything after it is out of reach", () => {
        assert.deepEqual(states(nothing), ["next", "waiting", "waiting", "waiting", "waiting"]);
    });

    it("moves the next step along as each one is filled in", () => {
        assert.deepEqual(states({ ...nothing, user: "Sophie Salt" }), ["done", "next", "waiting", "waiting", "waiting"]);
        assert.deepEqual(states({ ...nothing, user: "Sophie Salt", application: "dibk/et-v4" }), ["done", "done", "next", "waiting", "waiting"]);
    });

    /*
     * The new instance row is a choice rather than a gap: posting with it selected creates one, so
     * there is always something selected once the list is showing.
     */
    it("settles the instance step once there is a party", () => {
        const withParty = { ...nothing, user: "Sophie Salt", application: "dibk/et-v4", party: "510001" };
        assert.deepEqual(states(withParty), ["done", "done", "done", "done", "waiting"]);
        assert.equal(values(withParty)[3], "new");
    });

    it("invites a data element only once a real instance is selected", () => {
        const onInstance = { user: "Sophie Salt", application: "dibk/et-v4", party: "510001", instance: "99d0632c", dataElement: null };
        assert.deepEqual(states(onInstance), ["done", "done", "done", "done", "next"]);
        assert.deepEqual(states({ ...onInstance, dataElement: "ET" }), ["done", "done", "done", "done", "done"]);
    });

    it("shows what each step holds, in the order the tool works in", () => {
        const complete = { user: "Sophie Salt", application: "dibk/et-v4", party: "510001", instance: "99d0632c", dataElement: "ET" };
        assert.deepEqual(values(complete), ["Sophie Salt", "dibk/et-v4", "510001", "99d0632c", "ET"]);
    });

    /*
     * A party from a previous session with no token yet. The value is there and worth showing, and
     * it is still out of reach: a party you have no token to act as is not somewhere you can go.
     */
    it("shows a restored value while still calling it out of reach", () => {
        const restored = { ...nothing, party: "510001" };
        assert.equal(values(restored)[2], "510001");
        assert.equal(states(restored)[2], "waiting");
    });

    it("carries the panel id, so the rail can take you there", () => {
        assert.deepEqual(
            requestChain(nothing).map((step) => step.anchor),
            ["panel-test-user", "panel-target", "panel-target", "panel-instances", "panel-data-element"]
        );
    });
});
