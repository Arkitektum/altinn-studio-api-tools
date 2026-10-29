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

    it("answers a header Node cannot send with a failed request instead of throwing", async () => {
        stub();

        const response = await altinnFetch({
            url: "http://localhost:1/data",
            token: "a-real-token",
            headers: { "content-disposition": 'filename="sør–plan.pdf"' }
        });

        assert.equal(response.ok, false);
        assert.equal(response.status, 502);
        assert.match(String((response.body as { error: string }).error), /ByteString/);
    });

    // Node's error for a header value it cannot send quotes the value, and here the value is the bearer token.
    for (const [label, token] of [
        ["a line break", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.SECRETSIG-part1\nSECRETSIG-part2"],
        ["a carriage return", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.SECRETSIG-part1\rSECRETSIG-part2"]
    ] as [string, string][]) {
        it(`keeps a token with ${label} in it out of the failure`, async () => {
            stub();

            const response = await altinnFetch({ url: "http://localhost:1/data", token });

            assert.equal(response.ok, false);
            const error = String((response.body as { error: string }).error);
            assert.equal(error.includes("SECRETSIG"), false, error);
            assert.match(error, /\$TOKEN/);
        });
    }

    it("keeps the token out of a failure that quotes it JSON-escaped", async () => {
        const token = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.SECRET\tSIG";
        globalThis.fetch = (async () => {
            throw new Error(`refused ${JSON.stringify(token)}`);
        }) as typeof fetch;

        const response = await altinnFetch({ url: "http://localhost:1/data", token });

        assert.equal(String((response.body as { error: string }).error).includes("SECRET"), false);
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
