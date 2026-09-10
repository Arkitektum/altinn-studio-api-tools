import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestChain } from "./chain";
import type { ChainInputs } from "./chain";

const nothing: ChainInputs = { user: null, application: null, party: null, instance: null, dataElement: null };

const states = (inputs: ChainInputs) => requestChain(inputs).map((step) => step.state);
const values = (inputs: ChainInputs) => requestChain(inputs).map((step) => step.value);

describe("requestChain", () => {
    it("points at the token on a cold start, and everything after it waits", () => {
        assert.deepEqual(states(nothing), ["next", "waiting", "waiting", "waiting", "waiting"]);
    });

    it("moves the next link along as each one is filled in", () => {
        assert.deepEqual(states({ ...nothing, user: "Sophie Salt" }), ["done", "next", "waiting", "waiting", "waiting"]);
        assert.deepEqual(states({ ...nothing, user: "Sophie Salt", application: "dibk/et-v4" }), ["done", "done", "next", "waiting", "waiting"]);
    });

    it("settles the instance link once there is a party, since something is always selected", () => {
        // The new instance row is a choice, not a gap: posting creates one.
        const withParty = { ...nothing, user: "Sophie Salt", application: "dibk/et-v4", party: "510001" };
        assert.deepEqual(states(withParty), ["done", "done", "done", "done", "waiting"]);
        assert.deepEqual(values(withParty)[3], "new");
    });

    it("invites a data element only once a real instance is selected", () => {
        const onInstance = { user: "Sophie Salt", application: "dibk/et-v4", party: "510001", instance: "99d0632c", dataElement: null };
        assert.deepEqual(states(onInstance), ["done", "done", "done", "done", "next"]);
        assert.deepEqual(values(onInstance)[3], "99d0632c");

        const complete = { ...onInstance, dataElement: "ET" };
        assert.deepEqual(states(complete), ["done", "done", "done", "done", "done"]);
    });

    it("names where each link is set, so the strip can say where to go", () => {
        assert.deepEqual(
            requestChain(nothing).map((step) => step.where),
            ["Test user", "Target", "Target", "Instances", "Data element"]
        );
    });

    it("carries the panel id, so the strip can take you there", () => {
        assert.deepEqual(
            requestChain(nothing).map((step) => step.anchor),
            ["panel-test-user", "panel-target", "panel-target", "panel-instances", "panel-data-element"]
        );
    });

    it("marks every link as you scroll, since all of their panels are in the one column", () => {
        assert.deepEqual(
            requestChain(nothing).map((step) => step.spy),
            [true, true, true, true, true]
        );
    });

    it("shows a restored value while still calling it blocked", () => {
        // A party from a previous session with no token yet. The value is there and is worth
        // showing, but nothing downstream of it can be used, and the panels are absent to match.
        const restored = { ...nothing, party: "510001" };
        assert.deepEqual(states(restored), ["next", "waiting", "waiting", "waiting", "waiting"]);
        assert.equal(values(restored)[2], "510001");
    });
});
