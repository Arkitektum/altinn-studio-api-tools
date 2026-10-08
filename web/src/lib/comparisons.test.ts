import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pairComparisons, type FormKind } from "./comparisons";
import type { DataElementInput, DataElementSummary } from "../types";

function stored(id: string, dataType: string): DataElementSummary {
    return { id, dataType, contentType: "application/xml", filename: null, size: null, lastChanged: null };
}

const KINDS: Record<string, FormKind> = { ET: "main", Sub: "sub" };
const kindOf = (dataType: string): FormKind | null => KINDS[dataType] ?? null;

describe("pairComparisons", () => {
    it("compares the main form and the sub forms and leaves attachments out", () => {
        const pairs = pairComparisons(
            [stored("a", "ET"), stored("b", "vedlegg"), stored("c", "Sub")],
            [
                { dataType: "ET", content: "<et />" },
                { dataType: "vedlegg", content: "JVBERi0=", encoding: "base64" },
                { dataType: "Sub", content: "<sub />" }
            ],
            kindOf
        );
        assert.deepEqual(
            pairs.map((pair) => [pair.stored.id, pair.written?.content]),
            [
                ["a", "<et />"],
                ["c", "<sub />"]
            ]
        );
    });

    it("says which kind of form each one is", () => {
        const pairs = pairComparisons([stored("a", "ET"), stored("b", "Sub")], [], kindOf);
        assert.deepEqual(
            pairs.map((pair) => pair.kind),
            ["main", "sub"]
        );
    });

    it("pairs the sub forms of one type in the order they were written", () => {
        const pairs = pairComparisons(
            [stored("a", "ET"), stored("b", "Sub"), stored("c", "Sub")],
            [
                { dataType: "Sub", content: "<first />" },
                { dataType: "ET", content: "<et />" },
                { dataType: "Sub", content: "<second />" }
            ],
            kindOf
        );
        assert.deepEqual(
            pairs.map((pair) => [pair.stored.id, pair.written?.content]),
            [
                ["a", "<et />"],
                ["b", "<first />"],
                ["c", "<second />"]
            ]
        );
    });

    it("skips payload elements with nothing in them, or with a file rather than xml", () => {
        const pairs = pairComparisons(
            [stored("a", "Sub")],
            [
                { dataType: "Sub", content: "   " },
                { dataType: "Sub", content: "PHN1YiAvPg==", encoding: "base64" },
                { dataType: "Sub", content: "<sub />" }
            ],
            kindOf
        );
        assert.equal(pairs[0]?.written?.content, "<sub />");
    });

    it("keeps a stored form the payload has nothing for, with nothing beside it", () => {
        const pairs = pairComparisons([stored("a", "ET"), stored("b", "Sub"), stored("c", "Sub")], [{ dataType: "Sub", content: "<sub />" }], kindOf);
        assert.deepEqual(
            pairs.map((pair) => [pair.stored.id, pair.written?.content ?? null]),
            [
                ["a", null],
                ["b", "<sub />"],
                ["c", null]
            ]
        );
    });
});
