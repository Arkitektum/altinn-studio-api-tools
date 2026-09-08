import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCurl } from "./curl";
import type { RunStep } from "../types";

const URL = "http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/99d0632c/data?dataType=ET";

function step(overrides: Partial<RunStep> = {}): RunStep {
    return {
        index: 1,
        name: 'Add data element "ET"',
        method: "POST",
        url: URL,
        status: 201,
        ok: true,
        durationMs: 42,
        requestHeaders: { accept: "application/json", authorization: "Bearer $TOKEN", "content-type": "application/xml" },
        ...overrides
    };
}

describe("toCurl", () => {
    it("writes the method, url, headers and body", () => {
        const command = toCurl(step({ requestPreview: "<ET><a>1</a></ET>", requestVerbatim: true }));

        assert.equal(
            command,
            [
                `curl -i -X POST '${URL}'`,
                `  -H 'accept: application/json'`,
                `  -H 'authorization: Bearer $TOKEN'`,
                `  -H 'content-type: application/xml'`,
                `  --data-binary '<ET><a>1</a></ET>'`
            ].join(" \\\n")
        );
    });

    it("carries the token placeholder rather than a token", () => {
        // The browser is never given a bearer token, so there is none to put here.
        assert.equal(toCurl(step()).includes("Bearer $TOKEN"), true);
    });

    it("escapes a single quote in the body, so the command stays one string", () => {
        const command = toCurl(step({ requestPreview: `<ET navn="Ola's hus"/>`, requestVerbatim: true }));
        assert.equal(command.includes(`'<ET navn="Ola'\\''s hus"/>'`), true);
    });

    it("says so when the body was only summarised, instead of posting the summary", () => {
        const command = toCurl(step({ requestPreview: "[12345 bytes, base64 encoded]", requestVerbatim: false }));

        assert.equal(command.startsWith("# The body was logged as a summary"), true);
        assert.equal(command.includes("--data-binary @body"), true);
        assert.equal(command.includes("12345 bytes"), false);
    });

    it("leaves out the body for a GET, which has none", () => {
        const command = toCurl(step({ method: "GET", requestPreview: undefined }));
        assert.equal(command.includes("--data-binary"), false);
        assert.equal(command.startsWith(`curl -i -X GET '${URL}'`), true);
    });

    it("gives nothing for a step that made no request", () => {
        assert.equal(toCurl(step({ method: "-", url: "-", status: null, ok: false, requestHeaders: undefined })), "");
    });
});
