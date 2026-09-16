import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pendingAutoRuns } from "./autoRuns";
import { selectionKeys } from "./selectionKeys";
import type { AutoRunInputs } from "./autoRuns";
import type { Selection } from "./selectionKeys";

const selected: Selection = {
    tokenId: "b3f1",
    org: "dibk",
    app: "et-v4",
    party: "510001",
    instanceGuid: "99d0632c-1111-2222-3333-444455556666",
    dataGuid: "0f1e2d3c-aaaa-bbbb-cccc-ddddeeeeffff"
};

const nothingAttempted = { element: null, compare: null };

const ready: AutoRunInputs = {
    hasToken: true,
    selection: selected,
    elementChangedAt: "2026-09-10T09:00:00Z",
    comparable: "<ettrinn />",
    attempted: nothingAttempted
};

/** What the run of a given scope was aimed at, for feeding back in as attempted. */
function keysOf(inputs: AutoRunInputs) {
    const runs = pendingAutoRuns(inputs);
    return {
        element: runs.element?.key ?? null,
        compare: runs.compare?.key ?? null
    };
}

describe("pendingAutoRuns", () => {
    it("asks for nothing without a usable token", () => {
        const none = pendingAutoRuns({ ...ready, hasToken: false });
        assert.deepEqual(none, { element: null, compare: null });
    });

    it("waits for each field the read depends on", () => {
        for (const missing of [{ app: "" }, { party: "" }, { instanceGuid: "" }, { dataGuid: "" }]) {
            const runs = pendingAutoRuns({ ...ready, selection: { ...selected, ...missing } });
            assert.equal(runs.element, null, `element with ${JSON.stringify(missing)}`);
            assert.equal(runs.compare, null, `compare with ${JSON.stringify(missing)}`);
        }
    });

    it("aims each run at its own scope", () => {
        const keys = selectionKeys(selected);
        const runs = pendingAutoRuns(ready);
        // The element's key carries what is stored under it, not only which element it is.
        assert.ok(runs.element);
        assert.ok(runs.element.key.startsWith(keys.dataElement));
        assert.ok(runs.compare?.key.startsWith(runs.element.key));
    });

    it("lets a typed field settle before asking, and an edited document settle longer", () => {
        const runs = pendingAutoRuns(ready);
        assert.ok((runs.element?.delayMs ?? 0) > 0);
        assert.ok((runs.compare?.delayMs ?? 0) > (runs.element?.delayMs ?? 0));
    });

    it("asks once per selection, however the answer turned out", () => {
        const attempted = keysOf(ready);
        assert.deepEqual(pendingAutoRuns({ ...ready, attempted }), {
            element: null,
            compare: null
        });
    });

    it("reopens both when the selection above them moves", () => {
        const attempted = keysOf(ready);

        // Another instance of the same party, and another element of the same instance. Either is a
        // different element to read and a different stored document to compare against.
        for (const elsewhere of [{ instanceGuid: "another" }, { dataGuid: "another" }]) {
            const runs = pendingAutoRuns({ ...ready, selection: { ...selected, ...elsewhere }, attempted });
            assert.ok(runs.element, JSON.stringify(elsewhere));
            assert.ok(runs.compare, JSON.stringify(elsewhere));
        }
    });

    it("reads the element again once a post has rewritten it under the same guid", () => {
        const attempted = keysOf(ready);
        const posted = pendingAutoRuns({ ...ready, elementChangedAt: "2026-09-10T09:05:00Z", attempted });
        assert.ok(posted.element);
        // The stored side of the comparison moved with it.
        assert.ok(posted.compare);
    });

    it("compares again when the payload is edited, and nothing else does", () => {
        const attempted = keysOf(ready);
        const edited = pendingAutoRuns({ ...ready, comparable: "<ettrinn><nytt /></ettrinn>", attempted });
        assert.ok(edited.compare);
        assert.equal(edited.element, null);
    });

    it("does not compare against nothing at all", () => {
        // No payload element of the selected data type, or one with nothing in it yet.
        assert.equal(pendingAutoRuns({ ...ready, comparable: null }).compare, null);
        assert.ok(pendingAutoRuns({ ...ready, comparable: null }).element);
    });

    it("asks everything again for another token, since the answers were that token's", () => {
        const attempted = keysOf(ready);
        const runs = pendingAutoRuns({ ...ready, selection: { ...selected, tokenId: "0000" }, attempted });
        assert.ok(runs.element);
        assert.ok(runs.compare);
    });
});
