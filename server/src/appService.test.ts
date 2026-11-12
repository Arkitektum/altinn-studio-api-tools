import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStructuredData, resolveContentType } from "./appService.js";

const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("resolveContentType", () => {
    it("takes the declared XML type over an office package declared first", () => {
        assert.equal(resolveContentType({ id: "Vedlegg", allowedContentTypes: [docx, "application/xml"] }, "<a />"), "application/xml");
    });

    it("does not take an office package for XML when nothing else is JSON or XML", () => {
        // Two declared and neither is form data, so it is sniffed from the payload.
        assert.equal(resolveContentType({ id: "Vedlegg", allowedContentTypes: ["application/pdf", docx] }, "%PDF-1.4"), "text/plain");
    });
});

describe("isStructuredData", () => {
    const cases: [type: string, structured: boolean][] = [
        ["application/json", true],
        ["application/xml", true],
        ["text/xml; charset=utf-8", true],
        ["application/problem+json", true],
        ["application/atom+xml", true],
        [docx, false],
        ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false],
        ["application/pdf", false],
        ["text/plain", false]
    ];
    for (const [type, structured] of cases) {
        it(`answers ${structured} for ${type}`, () => {
            assert.equal(isStructuredData(type), structured);
        });
    }
});
