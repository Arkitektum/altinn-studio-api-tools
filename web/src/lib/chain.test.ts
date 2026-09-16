import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestChain } from "./chain";
import type { ChainInputs } from "./chain";

const nothing: ChainInputs = { user: null, application: null, party: null, instance: null, dataElement: null };

const values = (inputs: ChainInputs) => requestChain(inputs).map((step) => step.value);

describe("requestChain", () => {
    it("holds nothing on a cold start, except the instance", () => {
        assert.deepEqual(values(nothing), [null, null, null, "new", null]);
    });

    /*
     * The new instance row is a choice rather than a gap: posting with it selected creates one, so
     * there is always something selected once the list is showing.
     */
    it("reads the new instance row as a value of its own", () => {
        assert.equal(values({ ...nothing, party: "510001" })[3], "new");
        assert.equal(values({ ...nothing, instance: "99d0632c" })[3], "99d0632c");
    });

    it("shows what each link holds, in the order the tool works in", () => {
        const complete = { user: "Sophie Salt", application: "dibk/et-v4", party: "510001", instance: "99d0632c", dataElement: "ET" };
        assert.deepEqual(values(complete), ["Sophie Salt", "dibk/et-v4", "510001", "99d0632c", "ET"]);
    });

    /*
     * A value restored from a previous session is shown as it stands. It used to read as blocked
     * until the links before it were filled in, which was the strip explaining the order; the panel
     * that needs it says that now, so the strip says only what is there.
     */
    it("shows a restored value without qualifying it", () => {
        assert.equal(values({ ...nothing, party: "510001" })[2], "510001");
    });

    it("carries the panel id, so the strip can take you there", () => {
        assert.deepEqual(
            requestChain(nothing).map((step) => step.anchor),
            ["panel-test-user", "panel-target", "panel-target", "panel-instances", "panel-data-element"]
        );
    });
});
