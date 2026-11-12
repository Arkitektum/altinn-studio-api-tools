import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStructuredData, preferredContentType } from "./contentType";

const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("preferredContentType", () => {
    it("takes the declared XML type over an office package declared first", () => {
        assert.equal(preferredContentType([docx, "application/xml"]), "application/xml");
    });

    it("takes the first declared type when none is JSON or XML, rather than an office package for being XML", () => {
        assert.equal(preferredContentType(["application/pdf", docx]), "application/pdf");
    });

    it("leaves the choice to the server when the app declares nothing", () => {
        assert.equal(preferredContentType([]), undefined);
    });
});

describe("isStructuredData", () => {
    const cases: [type: string, structured: boolean][] = [
        ["application/json", true],
        ["application/xml", true],
        ["text/xml; charset=utf-8", true],
        ["application/problem+json", true],
        [docx, false],
        ["application/pdf", false],
        ["text/plain", false]
    ];
    for (const [type, structured] of cases) {
        it(`answers ${structured} for ${type}`, () => {
            assert.equal(isStructuredData(type), structured);
        });
    }
});
