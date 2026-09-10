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

const nothingAttempted = { probe: null, list: null, read: null, element: null, compare: null };

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
        probe: runs.probe?.key ?? null,
        list: runs.list?.key ?? null,
        read: runs.read?.key ?? null,
        element: runs.element?.key ?? null,
        compare: runs.compare?.key ?? null
    };
}

describe("pendingAutoRuns", () => {
    it("asks for nothing without a usable token", () => {
        const none = pendingAutoRuns({ ...ready, hasToken: false });
        assert.deepEqual(none, { probe: null, list: null, read: null, element: null, compare: null });
    });

    it("waits for each field the read depends on", () => {
        const noApp = pendingAutoRuns({ ...ready, selection: { ...selected, app: "" } });
        assert.equal(noApp.probe, null);
        assert.equal(noApp.list, null);
        assert.equal(noApp.read, null);
        assert.equal(noApp.element, null);

        const noParty = pendingAutoRuns({ ...ready, selection: { ...selected, party: "" } });
        assert.ok(noParty.probe);
        assert.equal(noParty.list, null);
        assert.equal(noParty.read, null);

        const noInstance = pendingAutoRuns({ ...ready, selection: { ...selected, instanceGuid: "" } });
        assert.ok(noInstance.probe);
        assert.ok(noInstance.list);
        assert.equal(noInstance.read, null);
        assert.equal(noInstance.element, null);

        const noElement = pendingAutoRuns({ ...ready, selection: { ...selected, dataGuid: "" } });
        assert.ok(noElement.read);
        assert.equal(noElement.element, null);
        assert.equal(noElement.compare, null);
    });

    it("aims each run at its own scope", () => {
        const keys = selectionKeys(selected);
        const runs = pendingAutoRuns(ready);
        assert.equal(runs.probe?.key, keys.target);
        assert.equal(runs.list?.key, keys.party);
        assert.equal(runs.read?.key, keys.instance);
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
            probe: null,
            list: null,
            read: null,
            element: null,
            compare: null
        });
    });

    it("only reopens the scopes the move touched", () => {
        const attempted = keysOf(ready);

        // Another instance of the same party: the read and everything under it are due again.
        const elsewhere = { ...selected, instanceGuid: "another" };
        const afterInstance = pendingAutoRuns({ ...ready, selection: elsewhere, attempted });
        assert.equal(afterInstance.probe, null);
        assert.equal(afterInstance.list, null);
        assert.ok(afterInstance.read);
        assert.ok(afterInstance.element);

        // Another data element: the instance read stands, the element is read again.
        const other = { ...selected, dataGuid: "another" };
        const afterElement = pendingAutoRuns({ ...ready, selection: other, attempted });
        assert.equal(afterElement.read, null);
        assert.ok(afterElement.element);
        assert.ok(afterElement.compare);
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
        assert.equal(edited.read, null);
    });

    it("does not compare against xml that will not parse, or against nothing at all", () => {
        // Null is both "no payload element of this type" and "what is there is half typed".
        assert.equal(pendingAutoRuns({ ...ready, comparable: null }).compare, null);
        assert.ok(pendingAutoRuns({ ...ready, comparable: null }).element);
    });

    it("asks everything again for another token, since the answers were that token's", () => {
        const attempted = keysOf(ready);
        const runs = pendingAutoRuns({ ...ready, selection: { ...selected, tokenId: "0000" }, attempted });
        assert.ok(runs.probe);
        assert.ok(runs.list);
        assert.ok(runs.read);
        assert.ok(runs.element);
        assert.ok(runs.compare);
    });
});
