import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_UPLOAD_BYTES, readPickedFile, resolveFileContentType } from "./fileUpload";

describe("resolveFileContentType", () => {
    it("trusts the browser when it has a type", () => {
        assert.equal(resolveFileContentType("situasjonsplan.pdf", "application/pdf", ["application/pdf"]), "application/pdf");
    });

    it("falls back to the extension, which is the case for gml and geojson", () => {
        // Browsers hand over an empty type for these.
        assert.equal(resolveFileContentType("plan.gml", "", ["application/gml+xml"]), "application/gml+xml");
        assert.equal(resolveFileContentType("omraade.geojson", "", []), "application/geo+json");
    });

    it("posts the spelling the app asked for when it is the same format", () => {
        // An app declaring text/xml gets text/xml rather than application/xml.
        assert.equal(resolveFileContentType("ET.xml", "text/xml", ["text/xml"]), "text/xml");
        assert.equal(resolveFileContentType("ET.xml", "application/xml", ["text/xml"]), "text/xml");
        assert.equal(resolveFileContentType("data.json", "application/json", ["text/json"]), "text/json");
    });

    it("keeps the honest guess when the app declares nothing like it", () => {
        // Letting the app refuse it says more than quietly posting it as something else.
        assert.equal(resolveFileContentType("situasjonsplan.pdf", "application/pdf", ["image/png"]), "application/pdf");
    });

    it("settles on octet-stream for a format it does not know", () => {
        assert.equal(resolveFileContentType("data.sosi", "", []), "application/octet-stream");
    });

    it("drops a charset parameter, so the value matches what the app declared", () => {
        assert.equal(resolveFileContentType("notat.txt", "text/plain;charset=utf-8", ["text/plain"]), "text/plain");
    });
});

describe("readPickedFile", () => {
    it("reads a textual format as text, so it stays editable", async () => {
        const xml = '<?xml version="1.0" encoding="utf-8"?>\n<ET><a>1</a></ET>';
        const picked = await readPickedFile(new File([xml], "ET.xml", { type: "application/xml" }), ["application/xml"]);

        assert.equal(picked.encoding, "utf8");
        assert.equal(picked.content, xml);
        assert.equal(picked.contentType, "application/xml");
        assert.equal(picked.filename, "ET.xml");
    });

    it("reads a binary format as base64, byte for byte", async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
        const picked = await readPickedFile(new File([bytes], "logo.png", { type: "image/png" }), []);

        assert.equal(picked.encoding, "base64");
        assert.deepEqual([...Buffer.from(picked.content, "base64")], [...bytes]);
    });

    it("refuses a file the server would not accept anyway", async () => {
        // Stubbed rather than allocated, since the point is the guard and not the bytes.
        const huge = { name: "big.zip", type: "application/zip", size: MAX_UPLOAD_BYTES + 1 } as File;
        await assert.rejects(() => readPickedFile(huge, []), /limit is 15 MB/);
    });
});
