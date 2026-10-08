import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeHidden, isAddedEmptyDifference, isRowIdDifference, partitionDifferences } from "./differences";
import type { XmlDifference } from "../types";

function difference(path: string, kind: XmlDifference["kind"] = "added"): XmlDifference {
    return { path, kind, left: null, right: "x", type: null };
}

describe("isRowIdDifference", () => {
    it("recognises the attribute Altinn stamps on every repeating row", () => {
        assert.equal(isRowIdDifference(difference("/ettrinn/part[2]/@altinnRowId")), true);
        // However it is spelled.
        assert.equal(isRowIdDifference(difference("/ettrinn/part/@altinnrowid")), true);
    });

    it("leaves anything else alone, including an element that merely mentions it", () => {
        assert.equal(isRowIdDifference(difference("/ettrinn/part[2]/@kode")), false);
        assert.equal(isRowIdDifference(difference("/ettrinn/altinnRowId")), false);
        assert.equal(isRowIdDifference(difference("/ettrinn/@altinnRowIdentifier")), false);
    });
});

describe("isAddedEmptyDifference", () => {
    it("recognises an element the model added with nothing in it", () => {
        assert.equal(isAddedEmptyDifference({ ...difference("/ettrinn/bnr"), right: "empty", empty: true }), true);
    });

    it("leaves an added element with a value alone, even when the value is the word empty", () => {
        assert.equal(isAddedEmptyDifference({ ...difference("/ettrinn/merknad"), right: "empty" }), false);
    });

    it("leaves an empty element the model dropped alone, since the file had it", () => {
        assert.equal(isAddedEmptyDifference({ ...difference("/ettrinn/bnr", "missing"), left: "empty", right: null, empty: true }), false);
    });
});

describe("partitionDifferences", () => {
    const differences = [
        difference("/ettrinn/part[1]/@altinnRowId"),
        difference("/ettrinn/eiendom/festenr", "missing"),
        difference("/ettrinn/part[2]/@altinnRowId"),
        difference("/ettrinn/dato", "changed")
    ];

    it("holds the row ids back and counts them", () => {
        const { shown, hiddenRowIds } = partitionDifferences(differences, true);
        assert.deepEqual(
            shown.map((entry) => entry.path),
            ["/ettrinn/eiendom/festenr", "/ettrinn/dato"]
        );
        assert.equal(hiddenRowIds, 2);
    });

    it("shows everything when the filter is off, and counts nothing hidden", () => {
        const { shown, hiddenRowIds } = partitionDifferences(differences, false);
        assert.equal(shown.length, 4);
        assert.equal(hiddenRowIds, 0);
    });

    it("holds back empty added elements only when asked, and counts them apart from row ids", () => {
        const withEmpty = [...differences, { ...difference("/ettrinn/bnr"), right: "empty", empty: true as const }];
        assert.equal(partitionDifferences(withEmpty, true).shown.length, 3);
        const { shown, hiddenRowIds, hiddenEmpty } = partitionDifferences(withEmpty, true, true);
        assert.deepEqual(
            shown.map((entry) => entry.path),
            ["/ettrinn/eiendom/festenr", "/ettrinn/dato"]
        );
        assert.equal(hiddenRowIds, 2);
        assert.equal(hiddenEmpty, 1);
    });

    it("hides empty added elements with the row ids shown", () => {
        const withEmpty = [...differences, { ...difference("/ettrinn/bnr"), right: "empty", empty: true as const }];
        const { shown, hiddenRowIds, hiddenEmpty } = partitionDifferences(withEmpty, false, true);
        assert.equal(shown.length, 4);
        assert.equal(hiddenRowIds, 0);
        assert.equal(hiddenEmpty, 1);
    });

    it("keeps the order it was given", () => {
        const { shown } = partitionDifferences(differences, true);
        assert.equal(shown[0]?.path, "/ettrinn/eiendom/festenr");
    });
});

describe("describeHidden", () => {
    it("names each kind that was held back, and counts in the singular where it is one", () => {
        assert.equal(describeHidden({ hiddenRowIds: 2, hiddenEmpty: 1 }), "2 altinnRowId differences and 1 empty added element");
        assert.equal(describeHidden({ hiddenRowIds: 1, hiddenEmpty: 0 }), "1 altinnRowId difference");
        assert.equal(describeHidden({ hiddenRowIds: 0, hiddenEmpty: 3 }), "3 empty added elements");
    });

    it("has nothing to say when nothing was held back", () => {
        assert.equal(describeHidden({ hiddenRowIds: 0, hiddenEmpty: 0 }), null);
    });
});
