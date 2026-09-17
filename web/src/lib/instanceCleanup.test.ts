import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { softDeletedOf } from "./instanceCleanup";
import type { InstanceState, InstanceSummary } from "../types";

const instance = (guid: string, state: InstanceState): InstanceSummary => ({
    id: `510001/${guid}`,
    instanceOwnerPartyId: "510001",
    instanceGuid: guid,
    lastChanged: null,
    lastChangedBy: null,
    state
});

describe("softDeletedOf", () => {
    /*
     * The whole point of the function. A completed instance is a test run somebody finished and
     * may want to look at; widening this to "not active" would sweep those away with the litter,
     * and nothing else in the tool would notice.
     */
    it("takes the soft deleted ones and leaves everything else", () => {
        const all = [instance("a", "active"), instance("b", "deleted"), instance("c", "completed"), instance("d", "deleted")];

        assert.deepEqual(
            softDeletedOf(all).map((each) => each.instanceGuid),
            ["b", "d"]
        );
    });

    it("takes none of a list with none", () => {
        assert.deepEqual(softDeletedOf([instance("a", "active"), instance("c", "completed")]), []);
    });

    it("takes none of an empty list", () => {
        assert.deepEqual(softDeletedOf([]), []);
    });

    it("keeps the order it was given, so the count and the list agree", () => {
        const all = [instance("z", "deleted"), instance("a", "deleted")];
        assert.deepEqual(
            softDeletedOf(all).map((each) => each.instanceGuid),
            ["z", "a"]
        );
    });
});
