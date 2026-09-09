import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { compareStored } from "./compareService.js";

const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";
const DATA_GUID = "fdeb5550-f4e8-4f23-87d0-111234ac4771";
const STORAGE = `http://localhost:5101/storage/api/v1/instances/510001/${GUID}/data/${DATA_GUID}`;

const target = { instanceOwnerPartyId: "510001", instanceGuid: GUID, dataGuid: DATA_GUID };

function stubStorage(respond: () => { status?: number; body: string | Uint8Array; contentType: string }) {
    const calls: { method: string; url: string }[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push({ method: (init?.method ?? "GET").toUpperCase(), url });
        assert.equal(new Headers(init?.headers ?? {}).get("authorization"), "Bearer test-token");

        const { status = 200, body, contentType } = respond();
        return new Response(body, { status, headers: { "content-type": contentType } });
    }) as typeof fetch;

    return { calls, restore: () => (globalThis.fetch = original) };
}

let active: { restore: () => void } | null = null;
afterEach(() => {
    active?.restore();
    active = null;
});

describe("compareStored", () => {
    it("reads the blob from storage rather than from the app", async () => {
        const stored = "<ettrinn><gnr>73</gnr></ettrinn>";
        const stub = stubStorage(() => ({ body: stored, contentType: "application/xml" }));
        active = stub;

        const result = await compareStored("test-token", { ...target, left: stored });

        assert.equal(result.ok, true);
        // The app would have answered with the model as JSON, so this has to go to storage.
        assert.equal(stub.calls[0]?.url, STORAGE);
        assert.equal(result.steps[0]?.name, "Read the stored data element");
        assert.equal(result.diff?.same, true);
        assert.equal(result.stored, stored);
    });

    it("calls it the same when only the formatting differs", async () => {
        const stub = stubStorage(() => ({
            body: '<ns9:ettrinn xmlns:ns9="http://dibk.no/et"><gnr>73</gnr><signatur></signatur></ns9:ettrinn>',
            contentType: "application/xml"
        }));
        active = stub;

        const left = `<?xml version="1.0" encoding="utf-8"?>\n<ettrinn>\n  <gnr>73</gnr>\n  <signatur/>\n</ettrinn>`;
        const result = await compareStored("test-token", { ...target, left });

        assert.equal(result.diff?.same, true);
    });

    it("reports the field the model dropped", async () => {
        const stub = stubStorage(() => ({ body: "<ettrinn><gnr>73</gnr></ettrinn>", contentType: "application/xml" }));
        active = stub;

        const result = await compareStored("test-token", { ...target, left: "<ettrinn><gnr>73</gnr><festenr>2</festenr></ettrinn>" });

        assert.equal(result.ok, true);
        assert.equal(result.diff?.same, false);
        assert.deepEqual(result.diff?.differences, [{ path: "/ettrinn/festenr", kind: "missing", left: "2", right: null }]);
    });

    it("explains a 403 rather than calling the element missing", async () => {
        const stub = stubStorage(() => ({ status: 403, body: "", contentType: "text/plain" }));
        active = stub;

        const result = await compareStored("test-token", { ...target, left: "<ettrinn/>" });

        assert.equal(result.ok, false);
        assert.match(result.failedAt ?? "", /may not act for that party/);
        assert.equal(result.diff, null);
    });

    it("says so when the stored element is not text", async () => {
        const stub = stubStorage(() => ({ body: new Uint8Array([0x25, 0x50, 0x44, 0x46]), contentType: "application/pdf" }));
        active = stub;

        const result = await compareStored("test-token", { ...target, left: "<ettrinn/>" });

        assert.equal(result.ok, false);
        assert.match(result.failedAt ?? "", /application\/pdf, which is not text/);
    });

    it("keeps the stored text when the comparison itself fails, so it can still be read", async () => {
        // What a form data element read through the app looks like, pasted in by mistake.
        const stub = stubStorage(() => ({ body: '{"ettrinn":{"gnr":"73"}}', contentType: "application/json" }));
        active = stub;

        const result = await compareStored("test-token", { ...target, left: "<ettrinn><gnr>73</gnr></ettrinn>" });

        assert.equal(result.ok, false);
        assert.match(result.failedAt ?? "", /does not look like XML/);
        assert.equal(result.stored, '{"ettrinn":{"gnr":"73"}}');
    });
});
