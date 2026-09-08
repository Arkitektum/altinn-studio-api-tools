import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base64FromBytes, bytesFromBase64, contentTypeForFilename, extensionFor, extensionOf } from "./formats";

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

describe("extensionOf", () => {
    it("reads the extension, lowercased", () => {
        assert.equal(extensionOf("Situasjonsplan.PDF"), "pdf");
        assert.equal(extensionOf("archive.tar.gz"), "gz");
    });

    it("folds the alternative spellings onto one", () => {
        assert.equal(extensionOf("photo.jpeg"), "jpg");
        assert.equal(extensionOf("scan.tiff"), "tif");
        assert.equal(extensionOf("side.htm"), "html");
    });

    it("gives nothing for a name without one", () => {
        assert.equal(extensionOf("vedlegg"), "");
    });
});

describe("contentTypeForFilename", () => {
    it("takes the first spelling listed for the extension", () => {
        assert.equal(contentTypeForFilename("ET.xml"), "application/xml");
        assert.equal(contentTypeForFilename("plan.gml"), "application/gml+xml");
        assert.equal(contentTypeForFilename("omraade.geojson"), "application/geo+json");
    });

    it("gives nothing for an unknown extension", () => {
        assert.equal(contentTypeForFilename("data.sosi"), "");
        assert.equal(contentTypeForFilename("vedlegg"), "");
    });
});

describe("base64 round trip", () => {
    it("gives back the bytes, including ones no text encoding survives", () => {
        const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00];
        assert.deepEqual([...bytesFromBase64(Buffer.from(bytes).toString("base64"))], bytes);
    });

    it("encodes more than one chunk without overflowing the argument list", () => {
        // Past the 8 kB chunk, which is what a spread of the whole file would fall over on.
        const bytes = new Uint8Array(40_000).map((_, index) => index % 256);
        const encoded = base64FromBytes(bytes);
        assert.equal(encoded, Buffer.from(bytes).toString("base64"));
        assert.deepEqual([...bytesFromBase64(encoded)], [...bytes]);
    });
});
