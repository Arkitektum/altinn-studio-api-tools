import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMultipart } from "./multipart.js";

/**
 * The body is asserted as bytes rather than parsed back.
 *
 * A parser written here would be untested code checking untested code, and it would accept a body
 * that a strict server rejects: what this module has to get exactly right is the CRLFs and the two
 * dashes, which is precisely what a forgiving parser papers over. So the shape is spelled out.
 */
const text = (body: Buffer): string => body.toString("utf8");

/** The boundary as it was chosen, read back off the header it was announced in. */
function boundaryOf(contentType: string): string {
    const found = /boundary=(.+)$/.exec(contentType);
    assert.ok(found, `no boundary in ${contentType}`);
    return found[1] as string;
}

describe("buildMultipart", () => {
    it("announces the boundary it actually used", () => {
        const { body, contentType } = buildMultipart([{ name: "ET", content: "<ettrinn />", contentType: "application/xml" }]);
        const boundary = boundaryOf(contentType);

        assert.match(contentType, /^multipart\/form-data; boundary=/);
        // Announced and used have to be the same string, or every part is prologue.
        assert.ok(text(body).startsWith(`--${boundary}\r\n`), "body does not open with the announced boundary");
        assert.ok(text(body).endsWith(`--${boundary}--\r\n`), "body does not close with the announced boundary");
    });

    /*
     * The whole reason this module exists. FormData.append(name, blob) always emits
     * filename="blob", and Altinn stores that as the data element's filename, so a prefilled form
     * would come out called "blob".
     */
    it("writes no filename for a form data part", () => {
        const { body } = buildMultipart([{ name: "ET", content: "<ettrinn />", contentType: "application/xml" }]);

        assert.ok(!text(body).includes("filename"), "a form data part must carry no filename at all");
        assert.ok(text(body).includes('Content-Disposition: form-data; name="ET"\r\n'));
    });

    it("writes one for an attachment, which is where Altinn gets the stored name", () => {
        const { body } = buildMultipart([
            { name: "Situasjonsplan", content: Buffer.from("%PDF-"), contentType: "application/pdf", filename: "dummy.pdf" }
        ]);

        assert.ok(text(body).includes('Content-Disposition: form-data; name="Situasjonsplan"; filename="dummy.pdf"\r\n'));
    });

    it("separates the headers from the content by a blank line, and every part by CRLF", () => {
        const { body, contentType } = buildMultipart([
            { name: "instance", content: "{}", contentType: "application/json" },
            { name: "ET", content: "<ettrinn />", contentType: "application/xml" }
        ]);
        const boundary = boundaryOf(contentType);

        assert.equal(
            text(body),
            `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="instance"\r\n` +
                `Content-Type: application/json\r\n` +
                `\r\n` +
                `{}\r\n` +
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="ET"\r\n` +
                `Content-Type: application/xml\r\n` +
                `\r\n` +
                `<ettrinn />\r\n` +
                `--${boundary}--\r\n`
        );
    });

    /* A pdf that came back a byte different from the one on disk would be a silent corruption. */
    it("carries binary content through byte for byte", () => {
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x0d, 0x0a]);
        const { body } = buildMultipart([{ name: "png", content: bytes, contentType: "image/png", filename: "dummy.png" }]);

        // Between the blank line after the headers and the CRLF before the closing boundary.
        const start = body.indexOf(Buffer.from("\r\n\r\n")) + 4;
        assert.deepEqual([...body.subarray(start, start + bytes.length)], [...bytes]);
    });

    /*
     * Norwegian in a form is the normal case, and the length that matters is the byte length: a
     * body whose declared parts and actual bytes disagree is one a server reads short.
     */
    it("encodes text as utf8 rather than as characters", () => {
        const content = "<navn>Blåbærsyltetøy Æ Ø Å</navn>";
        const { body } = buildMultipart([{ name: "ET", content, contentType: "application/xml" }]);

        assert.ok(body.includes(Buffer.from(content, "utf8")));
        assert.ok(Buffer.byteLength(content, "utf8") > content.length, "expected multi-byte characters in the fixture");
    });

    it("never picks a boundary that occurs in the payload", () => {
        const { body, contentType } = buildMultipart([
            { name: "ET", content: "<ettrinn />", contentType: "application/xml" },
            { name: "png", content: Buffer.from([0x00, 0x01]), contentType: "image/png", filename: "d.png" }
        ]);
        const boundary = boundaryOf(contentType);

        // Three times and no more: opening each of the two parts, then closing the body.
        assert.equal(text(body).split(`--${boundary}`).length - 1, 3);
    });

    /*
     * A quote in a name would close the Content-Disposition value early and change what the part
     * is called. It is dropped rather than escaped, which is worth pinning: the names come from
     * data type ids and file names, and neither should contain one.
     */
    it("drops quotes from names and filenames rather than letting them break the header", () => {
        const { body } = buildMultipart([{ name: 'ET"x', content: "y", contentType: "application/xml", filename: 'a"b.xml' }]);

        assert.ok(text(body).includes('name="ETx"; filename="ab.xml"'));
    });

    it("builds an empty body with nothing but the closing boundary", () => {
        const { body, contentType } = buildMultipart([]);
        assert.equal(text(body), `--${boundaryOf(contentType)}--\r\n`);
    });
});
