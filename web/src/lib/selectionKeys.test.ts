import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasMovedOn, selectionKeys } from "./selectionKeys";
import type { Selection } from "./selectionKeys";

const selected: Selection = {
    tokenId: "b3f1",
    org: "dibk",
    app: "et-v4",
    party: "510001",
    instanceGuid: "99d0632c-1111-2222-3333-444455556666",
    dataGuid: "0f1e2d3c-aaaa-bbbb-cccc-ddddeeeeffff"
};

describe("selectionKeys", () => {
    it("narrows one scope into the next", () => {
        const keys = selectionKeys(selected);
        assert.ok(keys.party.startsWith(keys.target));
        assert.ok(keys.instance.startsWith(keys.party));
        assert.ok(keys.dataElement.startsWith(keys.instance));
    });

    it("tells an absent field apart from a filled one", () => {
        assert.notEqual(selectionKeys({ ...selected, instanceGuid: "" }).instance, selectionKeys(selected).instance);
    });

    it("does not confuse a party with an instance, since both are appended", () => {
        // "510001" then no guid must not read the same as no party then "510001".
        const asParty = selectionKeys({ tokenId: "b3f1", org: "dibk", app: "et-v4", party: "510001" }).instance;
        const asGuid = selectionKeys({ tokenId: "b3f1", org: "dibk", app: "et-v4", instanceGuid: "510001" }).instance;
        assert.notEqual(asParty, asGuid);
    });
});

describe("hasMovedOn", () => {
    const aimedAt = selectionKeys(selected);

    it("says nothing has moved when the selection is the same", () => {
        assert.equal(hasMovedOn(aimedAt.target, selected, "target"), false);
        assert.equal(hasMovedOn(aimedAt.party, selected, "party"), false);
        assert.equal(hasMovedOn(aimedAt.instance, selected, "instance"), false);
        assert.equal(hasMovedOn(aimedAt.dataElement, selected, "dataElement"), false);
    });

    it("only notices what its own scope depends on", () => {
        // A probe is about the app, so picking another instance or data element leaves it current.
        const elsewhere = { ...selected, instanceGuid: "other", dataGuid: "other" };
        assert.equal(hasMovedOn(aimedAt.target, elsewhere, "target"), false);
        assert.equal(hasMovedOn(aimedAt.party, elsewhere, "party"), false);
        // The instance read is about the instance, so it is not.
        assert.equal(hasMovedOn(aimedAt.instance, elsewhere, "instance"), true);
    });

    it("notices the app, the party, the instance and the data element in turn", () => {
        assert.equal(hasMovedOn(aimedAt.target, { ...selected, app: "et-v3" }, "target"), true);
        assert.equal(hasMovedOn(aimedAt.party, { ...selected, party: "510002" }, "party"), true);
        assert.equal(hasMovedOn(aimedAt.instance, { ...selected, instanceGuid: "another" }, "instance"), true);
        assert.equal(hasMovedOn(aimedAt.dataElement, { ...selected, dataGuid: "another" }, "dataElement"), true);
    });

    it("treats another token as another selection at every scope", () => {
        const other = { ...selected, tokenId: "0000" };
        assert.equal(hasMovedOn(aimedAt.target, other, "target"), true);
        assert.equal(hasMovedOn(aimedAt.instance, other, "instance"), true);
    });

    it("counts a cleared selection as having moved", () => {
        assert.equal(hasMovedOn(aimedAt.instance, {}, "instance"), true);
    });
});
