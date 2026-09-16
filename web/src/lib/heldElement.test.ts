import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heldElement } from "./heldElement";
import type { DataElementSummary, ReadDataElementResult } from "../types";

const summary: DataElementSummary = {
    id: "0f1e2d3c",
    dataType: "ET",
    contentType: "application/xml",
    filename: null,
    size: 11,
    lastChanged: "2026-09-10T09:00:00Z"
};

const read: ReadDataElementResult = {
    ok: true,
    steps: [],
    failedAt: null,
    dataGuid: "0f1e2d3c",
    contentType: "application/xml",
    encoding: "utf8",
    content: "<ettrinn />"
};

describe("heldElement", () => {
    it("names the file after the data type when Altinn stored none", () => {
        const held = heldElement("0f1e2d3c", read, summary);
        assert.equal(held?.filename, "ET.xml");
        assert.equal(held?.dataType, "ET");
    });

    it("prefers the name Altinn stored, which is what an attachment has", () => {
        const held = heldElement("0f1e2d3c", read, { ...summary, dataType: "vedlegg", filename: "dummy.pdf" });
        assert.equal(held?.filename, "dummy.pdf");
    });

    it("counts text in bytes rather than characters", () => {
        // A Norwegian vowel is one character and two bytes, which is what the size has to say.
        const held = heldElement("0f1e2d3c", { ...read, content: "<a>æøå</a>" }, summary);
        assert.equal(held?.size, 13);
    });

    it("counts base64 as what it stands for, not how long it is written", () => {
        const held = heldElement("0f1e2d3c", { ...read, encoding: "base64", content: "AAAAAA==" }, summary);
        assert.equal(held?.size, 6);
    });

    /*
     * Null rather than the previous element, which would sit under the new element's name with a
     * download button beside it offering the wrong file.
     */
    it("holds nothing for a read that failed", () => {
        assert.equal(heldElement("0f1e2d3c", { ...read, ok: false }, summary), null);
    });

    it("holds nothing for an element with no content", () => {
        assert.equal(heldElement("0f1e2d3c", { ...read, content: null }, summary), null);
    });

    it("falls back to a name when the instance read said nothing about the element", () => {
        const held = heldElement("0f1e2d3c", read, null);
        assert.equal(held?.dataType, "data");
    });
});
