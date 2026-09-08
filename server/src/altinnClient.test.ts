import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { altinnFetch, isTextual } from "./altinnClient.js";

describe("altinnFetch request headers", () => {
    const original = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = original;
    });

    function stub(): void {
        globalThis.fetch = (async () => new Response("{}", { headers: { "content-type": "application/json" } })) as typeof fetch;
    }

    it("reports the headers it sent, with the token replaced by a placeholder", async () => {
        stub();

        const response = await altinnFetch({
            url: "http://local.altinn.cloud:8000/dibk/et-v4/instances",
            method: "POST",
            token: "a-real-token",
            body: "<ET/>",
            contentType: "application/xml"
        });

        // The bearer token never leaves the server, not even into a log entry.
        assert.equal(response.requestHeaders["authorization"], "Bearer $TOKEN");
        assert.equal(JSON.stringify(response.requestHeaders).includes("a-real-token"), false);
        assert.equal(response.requestHeaders["content-type"], "application/xml");
        assert.equal(response.requestHeaders["accept"], "application/json");
    });

    it("reports the headers even when the request never got through", async () => {
        globalThis.fetch = (async () => {
            throw new Error("connect ECONNREFUSED");
        }) as typeof fetch;

        const response = await altinnFetch({ url: "http://localhost:1/nothing", token: "a-real-token" });

        assert.equal(response.ok, false);
        assert.equal(response.requestHeaders["authorization"], "Bearer $TOKEN");
    });
});

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
