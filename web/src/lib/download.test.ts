import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestedFilename } from "./download";

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
