import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPdf, isStructuredData, preferredContentType } from "./contentType";

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

describe("isPdf", () => {
    const pdf = btoa("%PDF-1.7\n");

    it("takes a declared pdf at its word, parameters and case aside", () => {
        assert.equal(isPdf("application/pdf", ""), true);
        assert.equal(isPdf("Application/PDF; name=plan.pdf", ""), true);
    });

    it("knows a pdf by its first bytes when it was stored under another type", () => {
        assert.equal(isPdf("application/octet-stream", pdf), true);
        assert.equal(isPdf(null, pdf), true);
    });

    it("is not fooled by another file, a short one, or base64 that does not decode", () => {
        assert.equal(isPdf("image/png", btoa("\x89PNG\r\n\x1a\n")), false);
        assert.equal(isPdf("application/octet-stream", btoa("%PD")), false);
        assert.equal(isPdf("application/octet-stream", "%%%%%%%%"), false);
    });
});
