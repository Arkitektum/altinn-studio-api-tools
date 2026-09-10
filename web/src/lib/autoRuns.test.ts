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
    dataGuid: ""
};

const nothingAttempted = { probe: null, list: null, read: null };

const ready: AutoRunInputs = { hasToken: true, selection: selected, attempted: nothingAttempted };

describe("pendingAutoRuns", () => {
    it("asks for nothing without a usable token", () => {
        const none = pendingAutoRuns({ ...ready, hasToken: false });
        assert.deepEqual(none, { probe: null, list: null, read: null });
    });

    it("waits for each field the read depends on", () => {
        const noApp = pendingAutoRuns({ ...ready, selection: { ...selected, app: "" } });
        assert.equal(noApp.probe, null);
        assert.equal(noApp.list, null);
        assert.equal(noApp.read, null);

        const noParty = pendingAutoRuns({ ...ready, selection: { ...selected, party: "" } });
        assert.ok(noParty.probe);
        assert.equal(noParty.list, null);
        assert.equal(noParty.read, null);

        const noInstance = pendingAutoRuns({ ...ready, selection: { ...selected, instanceGuid: "" } });
        assert.ok(noInstance.probe);
        assert.ok(noInstance.list);
        assert.equal(noInstance.read, null);
    });

    it("aims each run at its own scope", () => {
        const keys = selectionKeys(selected);
        const runs = pendingAutoRuns(ready);
        assert.equal(runs.probe?.key, keys.target);
        assert.equal(runs.list?.key, keys.party);
        assert.equal(runs.read?.key, keys.instance);
    });

    it("lets a typed field settle before asking", () => {
        const runs = pendingAutoRuns(ready);
        assert.ok((runs.probe?.delayMs ?? 0) > 0);
        assert.ok((runs.list?.delayMs ?? 0) > 0);
        assert.ok((runs.read?.delayMs ?? 0) > 0);
    });

    it("asks once per selection, however the answer turned out", () => {
        const keys = selectionKeys(selected);
        // An app that is not running, or a party this token may not act for, must not be asked
        // again on every render for as long as it is on screen.
        const attempted = { probe: keys.target, list: keys.party, read: keys.instance };
        assert.deepEqual(pendingAutoRuns({ ...ready, attempted }), { probe: null, list: null, read: null });
    });

    it("only reopens the scopes the move touched", () => {
        const keys = selectionKeys(selected);
        const attempted = { probe: keys.target, list: keys.party, read: keys.instance };

        // Another instance of the same party: the read is due again, the app and the listing are not.
        const elsewhere = { ...selected, instanceGuid: "another" };
        const afterInstance = pendingAutoRuns({ ...ready, selection: elsewhere, attempted });
        assert.equal(afterInstance.probe, null);
        assert.equal(afterInstance.list, null);
        assert.equal(afterInstance.read?.key, selectionKeys(elsewhere).instance);

        // Another party: the listing and the read are due, the app is unchanged.
        const otherParty = { ...selected, party: "510002" };
        const afterParty = pendingAutoRuns({ ...ready, selection: otherParty, attempted });
        assert.equal(afterParty.probe, null);
        assert.equal(afterParty.list?.key, selectionKeys(otherParty).party);
        assert.ok(afterParty.read);
    });

    it("asks everything again for another token, since the answers were that token's", () => {
        const keys = selectionKeys(selected);
        const attempted = { probe: keys.target, list: keys.party, read: keys.instance };
        const runs = pendingAutoRuns({ ...ready, selection: { ...selected, tokenId: "0000" }, attempted });
        assert.ok(runs.probe);
        assert.ok(runs.list);
        assert.ok(runs.read);
    });

    it("is not fooled by a data element, which nothing here depends on", () => {
        const keys = selectionKeys(selected);
        const attempted = { probe: keys.target, list: keys.party, read: keys.instance };
        const runs = pendingAutoRuns({ ...ready, selection: { ...selected, dataGuid: "picked" }, attempted });
        assert.deepEqual(runs, { probe: null, list: null, read: null });
    });
});
