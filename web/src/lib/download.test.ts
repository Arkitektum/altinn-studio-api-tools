import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bytesFromBase64, extensionFor, suggestedFilename } from "./download";

describe("extensionFor", () => {
    it("names the formats the example data covers", () => {
        assert.equal(extensionFor("application/xml"), "xml");
        assert.equal(extensionFor("application/pdf"), "pdf");
        assert.equal(extensionFor("image/jpeg"), "jpg");
        assert.equal(extensionFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx");
    });

    it("ignores a charset parameter", () => {
        assert.equal(extensionFor("text/xml; charset=utf-8"), "xml");
    });

    it("gives nothing for an unknown or missing type", () => {
        assert.equal(extensionFor("application/vnd.made-up"), "");
        assert.equal(extensionFor(null), "");
    });
});

describe("suggestedFilename", () => {
    it("keeps the name Altinn stored, since someone chose it", () => {
        assert.equal(
            suggestedFilename({ dataType: "vedlegg", filename: "situasjonsplan.pdf", contentType: "application/pdf" }),
            "situasjonsplan.pdf"
        );
    });

    it("names form data after its data type", () => {
        assert.equal(suggestedFilename({ dataType: "ET", filename: null, contentType: "application/xml" }), "ET.xml");
    });

    it("leaves off the extension when the content type is unknown", () => {
        assert.equal(suggestedFilename({ dataType: "ET", filename: null, contentType: null }), "ET");
    });
});

describe("bytesFromBase64", () => {
    it("gives back the bytes, including ones no text encoding survives", () => {
        const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00];
        assert.deepEqual([...bytesFromBase64(Buffer.from(bytes).toString("base64"))], bytes);
    });
});
