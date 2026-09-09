import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRowIdDifference, partitionDifferences } from "./differences";
import type { XmlDifference } from "../types";

function difference(path: string, kind: XmlDifference["kind"] = "added"): XmlDifference {
    return { path, kind, left: null, right: "x" };
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

    it("keeps the order it was given", () => {
        const { shown } = partitionDifferences(differences, true);
        assert.equal(shown[0]?.path, "/ettrinn/eiendom/festenr");
    });
});
