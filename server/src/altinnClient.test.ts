import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTextual } from "./altinnClient.js";

describe("isTextual", () => {
    it("treats text subtypes and the xml/json family as text", () => {
        for (const type of [
            "text/plain",
            "text/csv",
            "text/xml",
            "text/html; charset=utf-8",
            "application/json",
            "application/xml",
            "image/svg+xml",
            "application/problem+json"
        ]) {
            assert.equal(isTextual(type), true, `${type} should be text`);
        }
    });

    it('treats office packages as binary even though their type contains "xml"', () => {
        // application/vnd.openxmlformats-... is a zip. A substring test for xml gets this wrong.
        for (const type of [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ]) {
            assert.equal(isTextual(type), false, `${type} should be binary`);
        }
    });

    it("treats other binaries and a missing type as binary", () => {
        for (const type of [
            "application/pdf",
            "image/png",
            "image/tiff",
            "application/zip",
            "application/octet-stream",
            "application/vnd.oasis.opendocument.text"
        ]) {
            assert.equal(isTextual(type), false, `${type} should be binary`);
        }
        assert.equal(isTextual(null), false);
    });
});
