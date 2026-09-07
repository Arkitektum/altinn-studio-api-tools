import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { postDataToApp } from "./runService.js";

interface Call {
    method: string;
    url: string;
    body: string | null;
    contentType: string | null;
}

const APP_BASE = "http://local.altinn.cloud:8000/dibk/et-v4";
const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";

/**
 * Replace global fetch with a scripted Altinn app. Each handler is matched in order on
 * "METHOD url-substring", and the first match wins.
 */
function stubAltinn(handlers: [match: string, respond: () => { status?: number; json: unknown }][]) {
    const calls: Call[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? "GET").toUpperCase();
        const headers = new Headers(init?.headers ?? {});
        calls.push({
            method,
            url,
            body: typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? Buffer.from(init.body).toString("utf8") : null,
            contentType: headers.get("content-type")
        });

        assert.equal(headers.get("authorization"), "Bearer test-token", `missing bearer on ${url}`);
        assert.ok(url.startsWith(APP_BASE), `unexpected host: ${url}`);

        const handler = handlers.find(([match]) => {
            const [wantMethod, ...rest] = match.split(" ");
            return wantMethod === method && url.includes(rest.join(" "));
        });
        if (!handler) throw new Error(`unexpected request: ${method} ${url}`);

        const { status = 200, json } = handler[1]();
        return new Response(JSON.stringify(json), {
            status,
            headers: { "content-type": "application/json" }
        });
    }) as typeof fetch;

    return { calls, restore: () => (globalThis.fetch = original) };
}

const metadata = (dataTypes: unknown[]) => ({
    status: 200,
    json: { id: "dibk/et-v4", org: "dibk", dataTypes }
});

const ET_FORM = [{ id: "ET", maxCount: 1, appLogic: { classRef: "Dibk.Et.Model" } }];

const baseRequest = { org: "dibk", app: "et-v4", instanceOwnerPartyId: "510001" };

let active: { restore: () => void } | null = null;
afterEach(() => {
    active?.restore();
    active = null;
});

describe("sequential mode: create then upload", () => {
    it("replaces the auto-created element for a maxCount:1 form data type", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata(ET_FORM)],
            [
                "POST /instances?instanceOwnerPartyId",
                () => ({
                    status: 201,
                    // Altinn auto-creates the form data element on instantiation.
                    json: { id: `510001/${GUID}`, data: [{ id: "data-1", dataType: "ET" }] }
                })
            ],
            ["PUT /data/data-1", () => ({ json: { id: "data-1", dataType: "ET" } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "ET", content: '{"a":1}' }]
        });

        assert.equal(result.ok, true);
        assert.equal(result.instanceGuid, GUID);
        assert.equal(result.instanceOwnerPartyId, "510001");
        assert.equal(result.instanceUrl, `${APP_BASE}/#/instance/510001/${GUID}`);

        const upload = stub.calls.find((call) => call.url.includes("/data/data-1"));
        assert.ok(upload, "expected a PUT to the existing data element");
        assert.equal(upload.method, "PUT");
        assert.equal(upload.body, '{"a":1}');
        assert.equal(upload.contentType, "application/json");

        // Must not try to add a second element of a maxCount:1 type.
        assert.equal(stub.calls.filter((call) => call.method === "POST" && call.url.includes("/data?")).length, 0);
    });

    it("adds a new element when the data type allows several", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([{ id: "vedlegg", maxCount: 0 }])],
            ["POST /instances?instanceOwnerPartyId", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            ["POST /data?dataType=vedlegg", () => ({ status: 201, json: { id: "data-9" } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "vedlegg", content: "<root/>" }]
        });

        assert.equal(result.ok, true);
        const upload = stub.calls.find((call) => call.url.includes("/data?dataType=vedlegg"));
        assert.ok(upload);
        assert.equal(upload.method, "POST");
        // Sniffed from the payload since the data type declares no allowed content types.
        assert.equal(upload.contentType, "application/xml");
    });

    it("reports the failing step and stops instead of throwing", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata(ET_FORM)],
            ["POST /instances?instanceOwnerPartyId", () => ({ status: 403, json: { detail: "Not authorized for party" } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "ET", content: "{}" }]
        });

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Instance creation failed.");
        assert.equal(result.steps.at(-1)?.status, 403);
        assert.equal(result.steps.at(-1)?.error, "Not authorized for party");
    });

    it("rejects a data type the app does not declare, before any write", async () => {
        const stub = stubAltinn([["GET applicationmetadata", () => metadata(ET_FORM)]]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "et", content: "{}" }]
        });

        assert.equal(result.ok, false);
        assert.match(result.failedAt ?? "", /Unknown data type\(s\).*"?et"?/);
        assert.equal(stub.calls.filter((call) => call.method === "POST").length, 0);
    });

    it("runs validate before process/next when both are asked for", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata(ET_FORM)],
            [
                "POST /instances?instanceOwnerPartyId",
                () => ({
                    status: 201,
                    json: { id: `510001/${GUID}`, data: [{ id: "data-1", dataType: "ET" }] }
                })
            ],
            ["PUT /data/data-1", () => ({ json: {} })],
            ["GET /validate", () => ({ json: [] })],
            ["PUT /process/next", () => ({ json: { currentTask: null } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "ET", content: "{}" }],
            validate: true,
            advanceProcess: true
        });

        assert.equal(result.ok, true);
        const order = stub.calls.map((call) => `${call.method} ${call.url.replace(APP_BASE, "")}`);
        assert.ok(
            order.indexOf(`GET /instances/510001/${GUID}/validate`) < order.indexOf(`PUT /instances/510001/${GUID}/process/next`),
            `validate must run before process/next, got ${order.join(" | ")}`
        );
    });

    it("still posts when application metadata cannot be read", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => ({ status: 401, json: { detail: "nope" } })],
            ["POST /instances?instanceOwnerPartyId", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            ["POST /data?dataType=ET", () => ({ status: 201, json: {} })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [{ dataType: "ET", content: "{}" }]
        });

        assert.equal(result.ok, true);
        assert.match(result.steps[0]?.error ?? "", /Skipped/);
    });
});

describe("multipart mode: create with data in one request", () => {
    it("sends exactly one POST carrying instance and data parts", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([...ET_FORM, { id: "vedlegg", maxCount: 0 }])],
            ["POST /instances", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            mode: "multipart",
            dataElements: [
                { dataType: "ET", content: '{"a":1}' },
                { dataType: "vedlegg", content: "<x/>" }
            ]
        });

        assert.equal(result.ok, true);
        const posts = stub.calls.filter((call) => call.method === "POST");
        assert.equal(posts.length, 1, "multipart mode must issue exactly one POST");
        assert.equal(posts[0]?.url, `${APP_BASE}/instances`);

        const contentType = posts[0]?.contentType ?? "";
        assert.match(contentType, /^multipart\/form-data; boundary=/);

        const body = posts[0]?.body ?? "";
        assert.match(body, /name="instance"[\s\S]*?"partyId":"510001"/);
        // Content types are sniffed per part: ET is posted as JSON here, vedlegg as XML.
        assert.match(body, /name="ET"\r\nContent-Type: application\/json\r\n\r\n\{"a":1\}\r\n/);
        assert.match(body, /name="vedlegg"\r\nContent-Type: application\/xml\r\n\r\n<x\/>\r\n/);
        // Form data parts must not carry a filename, or Altinn names the data element "blob".
        assert.doesNotMatch(body, /filename=/);

        // The declared boundary must actually delimit the body.
        const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? "";
        assert.ok(boundary.length > 0);
        assert.equal(body.split(`--${boundary}`).length - 1, 4, "expected 3 parts plus the terminator");
        assert.ok(body.endsWith(`--${boundary}--\r\n`));
    });

    it("sends a filename only for parts that ask for one", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([...ET_FORM, { id: "vedlegg", maxCount: 0 }])],
            ["POST /instances", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        await postDataToApp("test-token", {
            ...baseRequest,
            mode: "multipart",
            dataElements: [
                { dataType: "ET", content: "<ET/>" },
                { dataType: "vedlegg", content: "%PDF", filename: "tegning.pdf" }
            ]
        });

        const body = stub.calls.find((call) => call.method === "POST")?.body ?? "";
        assert.match(body, /name="vedlegg"; filename="tegning\.pdf"/);
        assert.doesNotMatch(body, /name="ET"; filename/);
    });
});

describe("existing mode: post onto an instance that already exists", () => {
    it("reads the instance and upserts without creating anything", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata(ET_FORM)],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}`, data: [{ id: "data-1", dataType: "ET" }] } })],
            ["PUT /data/data-1", () => ({ json: { id: "data-1" } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            mode: "existing",
            instanceGuid: GUID,
            dataElements: [{ dataType: "ET", content: '{"b":2}' }]
        });

        assert.equal(result.ok, true);
        assert.equal(result.instanceGuid, GUID);
        assert.equal(stub.calls.filter((call) => call.method === "POST").length, 0);
        assert.ok(stub.calls.some((call) => call.method === "PUT" && call.body === '{"b":2}'));
    });

    it("adds a data element to an instance that has none of that type yet", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([{ id: "vedlegg", maxCount: 0 }])],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}`, data: [] } })],
            ["POST /data?dataType=vedlegg", () => ({ status: 201, json: {} })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            mode: "existing",
            instanceGuid: GUID,
            dataElements: [{ dataType: "vedlegg", content: "{}" }]
        });

        assert.equal(result.ok, true);
        assert.ok(stub.calls.some((call) => call.url === `${APP_BASE}/instances/510001/${GUID}/data?dataType=vedlegg`));
    });

    it("fails clearly when the instance does not exist", async () => {
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata(ET_FORM)],
            [`GET /instances/510001/${GUID}`, () => ({ status: 404, json: { detail: "Not found" } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            mode: "existing",
            instanceGuid: GUID,
            dataElements: [{ dataType: "ET", content: "{}" }]
        });

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not read the existing instance.");
    });

    it("requires an instanceGuid", async () => {
        const stub = stubAltinn([["GET applicationmetadata", () => metadata(ET_FORM)]]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            mode: "existing",
            dataElements: [{ dataType: "ET", content: "{}" }]
        });

        assert.equal(result.ok, false);
        assert.match(result.failedAt ?? "", /instanceGuid is required/);
    });
});

describe("binary data elements", () => {
    it("decodes base64 content before posting it, and keeps the filename", async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([{ id: "vedlegg", maxCount: 0 }])],
            ["POST /instances?instanceOwnerPartyId", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            ["POST /data?dataType=vedlegg", () => ({ status: 201, json: {} })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        const result = await postDataToApp("test-token", {
            ...baseRequest,
            dataElements: [
                {
                    dataType: "vedlegg",
                    content: png.toString("base64"),
                    encoding: "base64",
                    contentType: "image/png",
                    filename: "dummy.png"
                }
            ]
        });

        assert.equal(result.ok, true);
        const upload = stub.calls.find((call) => call.url.includes("/data?dataType=vedlegg"));
        assert.ok(upload);
        assert.equal(upload.contentType, "image/png");
        // The bytes must arrive decoded, not as the base64 text.
        assert.equal(upload.body, png.toString("utf8"));
        assert.notEqual(upload.body, png.toString("base64"));

        // The log shows a byte count instead of a wall of base64.
        const step = result.steps.find((s) => s.name.includes("vedlegg"));
        assert.equal(step?.requestPreview, "[10 bytes, base64 encoded]");
    });

    it("carries decoded bytes into a multipart body", async () => {
        const pdf = Buffer.from("%PDF-1.4 mock\n%%EOF\n");
        const stub = stubAltinn([
            ["GET applicationmetadata", () => metadata([...ET_FORM, { id: "vedlegg", maxCount: 0 }])],
            ["POST /instances", () => ({ status: 201, json: { id: `510001/${GUID}`, data: [] } })],
            [`GET /instances/510001/${GUID}`, () => ({ json: { id: `510001/${GUID}` } })]
        ]);
        active = stub;

        await postDataToApp("test-token", {
            ...baseRequest,
            mode: "multipart",
            dataElements: [
                { dataType: "ET", content: "<ET/>" },
                {
                    dataType: "vedlegg",
                    content: pdf.toString("base64"),
                    encoding: "base64",
                    contentType: "application/pdf",
                    filename: "dummy.pdf"
                }
            ]
        });

        const body = stub.calls.find((call) => call.method === "POST")?.body ?? "";
        assert.match(body, /name="vedlegg"; filename="dummy\.pdf"/);
        assert.match(body, /Content-Type: application\/pdf/);
        assert.ok(body.includes("%PDF-1.4 mock"), "expected the decoded pdf bytes in the part");
        assert.ok(!body.includes(pdf.toString("base64")), "base64 must not be sent verbatim");
    });
});
