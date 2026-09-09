import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
    advanceProcess,
    deleteInstance,
    listInstances,
    readDataElement,
    readInstance,
    severityLabel,
    validateDataElement,
    validateInstance
} from "./readService.js";

const APP_BASE = "http://local.altinn.cloud:8000/dibk/et-v4";
const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";
const DATA_GUID = "fdeb5550-f4e8-4f23-87d0-111234ac4771";

const target = { org: "dibk", app: "et-v4", instanceOwnerPartyId: "510001", instanceGuid: GUID };

interface Call {
    method: string;
    url: string;
    accept: string | null;
}

function stubAltinn(respond: (url: string) => { status?: number; body: string | Uint8Array; contentType: string }) {
    const calls: Call[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const headers = new Headers(init?.headers ?? {});
        calls.push({ method: (init?.method ?? "GET").toUpperCase(), url, accept: headers.get("accept") });
        assert.equal(headers.get("authorization"), "Bearer test-token");

        const { status = 200, body, contentType } = respond(url);
        return new Response(body, { status, headers: { "content-type": contentType } });
    }) as typeof fetch;

    return { calls, restore: () => (globalThis.fetch = original) };
}

const instanceBody = {
    id: `510001/${GUID}`,
    instanceOwner: { partyId: "510001" },
    appId: "dibk/et-v4",
    process: {
        started: "2026-09-03T09:59:00Z",
        startEvent: "StartEvent_1",
        currentTask: { flow: 2, elementId: "Task_1", altinnTaskType: "data", name: null },
        ended: null,
        endEvent: null
    },
    data: [
        {
            id: DATA_GUID,
            dataType: "ET",
            contentType: "application/xml",
            size: 17585,
            lastChanged: "2026-09-03T10:00:00Z"
        },
        { id: "aaaa-1111", dataType: "GjennomfoeringsplanDataV7", contentType: "application/xml" },
        { id: "bbbb-2222", dataType: "ref-data-as-pdf", contentType: "application/pdf", filename: "kvittering.pdf" },
        "not-an-object"
    ]
};

let active: { restore: () => void } | null = null;
afterEach(() => {
    active?.restore();
    active = null;
});

describe("listInstances", () => {
    const party = { org: "dibk", app: "et-v4", instanceOwnerPartyId: "510001" };

    it("lists the party's instances, newest first", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify([
                { id: `510001/${GUID}`, lastChanged: "2026-09-03T10:00:00Z", lastChangedBy: "Pengelens Partner" },
                { id: "510001/aaaaaaaa-1111-2222-3333-444444444444", lastChanged: "2026-09-05T08:30:00Z" },
                "not-an-object",
                { lastChanged: "2026-09-06T08:30:00Z" }
            ]),
            contentType: "application/json"
        }));
        active = stub;

        const result = await listInstances("test-token", party);

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/active`);
        assert.equal(result.steps[0]?.name, "List active instances");
        // The malformed entries are dropped rather than crashing the list.
        assert.equal(result.instances.length, 2);
        assert.deepEqual(result.instances[0], {
            id: "510001/aaaaaaaa-1111-2222-3333-444444444444",
            instanceOwnerPartyId: "510001",
            instanceGuid: "aaaaaaaa-1111-2222-3333-444444444444",
            lastChanged: "2026-09-05T08:30:00Z",
            lastChangedBy: null
        });
        assert.equal(result.instances[1]?.instanceGuid, GUID);
        assert.equal(result.instances[1]?.lastChangedBy, "Pengelens Partner");
    });

    it("reads a storage-style body, and a bare guid as this party's instance", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify({ count: 1, instances: [{ id: GUID }] }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await listInstances("test-token", party);
        assert.equal(result.instances.length, 1);
        assert.equal(result.instances[0]?.instanceGuid, GUID);
        assert.equal(result.instances[0]?.instanceOwnerPartyId, "510001");
    });

    it("reports a party with nothing on it as an empty list", async () => {
        const stub = stubAltinn(() => ({ body: "[]", contentType: "application/json" }));
        active = stub;

        const result = await listInstances("test-token", party);
        assert.equal(result.ok, true);
        assert.deepEqual(result.instances, []);
    });

    it("reports a failure without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 403,
            body: JSON.stringify({ detail: "Forbidden" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await listInstances("test-token", party);
        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not list the instances for this party.");
        assert.deepEqual(result.instances, []);
    });
});

describe("readInstance", () => {
    it("gets the instance and summarises its data elements", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify(instanceBody),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readInstance("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(result.failedAt, null);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]?.method, "GET");
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}`);

        assert.equal(result.steps.length, 1);
        assert.equal(result.steps[0]?.name, "Get instance");
        assert.equal(result.steps[0]?.status, 200);

        // The malformed entry is dropped rather than crashing the summary.
        assert.equal(result.dataElements.length, 3);
        assert.deepEqual(result.dataElements[0], {
            id: DATA_GUID,
            dataType: "ET",
            contentType: "application/xml",
            filename: null,
            size: 17585,
            lastChanged: "2026-09-03T10:00:00Z"
        });
        assert.equal(result.dataElements[2]?.filename, "kvittering.pdf");
        assert.equal(result.instanceUrl, `${APP_BASE}/#/instance/510001/${GUID}`);

        // Where the instance stands, so the process panel needs no request of its own.
        assert.deepEqual(result.process, {
            currentTask: "Task_1",
            taskType: "data",
            started: "2026-09-03T09:59:00Z",
            ended: null,
            endEvent: null
        });
    });

    it("reports a missing instance without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 404,
            body: JSON.stringify({ detail: "Not found" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readInstance("test-token", target);

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not read the instance.");
        assert.equal(result.dataElements.length, 0);
        assert.equal(result.steps[0]?.status, 404);
        assert.equal(result.steps[0]?.error, "Not found");
    });

    it("copes with an instance that has no data array", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify({ id: `510001/${GUID}` }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readInstance("test-token", target);
        assert.equal(result.ok, true);
        assert.deepEqual(result.dataElements, []);
        // No process on the body is not the same as a process that has not started.
        assert.equal(result.process, null);
    });

    it("reads an ended process as ended rather than as no task", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify({
                id: `510001/${GUID}`,
                process: { started: "2026-09-03T09:59:00Z", currentTask: null, ended: "2026-09-03T10:05:00Z", endEvent: "EndEvent_1" }
            }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readInstance("test-token", target);
        assert.deepEqual(result.process, {
            currentTask: null,
            taskType: null,
            started: "2026-09-03T09:59:00Z",
            ended: "2026-09-03T10:05:00Z",
            endEvent: "EndEvent_1"
        });
    });
});

describe("deleteInstance", () => {
    it("soft deletes unless asked otherwise, since that is the reversible one", async () => {
        const stub = stubAltinn(() => ({ body: JSON.stringify(instanceBody), contentType: "application/json" }));
        active = stub;

        const result = await deleteInstance("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(result.hard, false);
        assert.equal(stub.calls[0]?.method, "DELETE");
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}?hard=false`);
        assert.equal(result.steps[0]?.name, "Delete instance (soft)");
    });

    it("hard deletes when asked, and says so in the step name", async () => {
        const stub = stubAltinn(() => ({ body: JSON.stringify(instanceBody), contentType: "application/json" }));
        active = stub;

        const result = await deleteInstance("test-token", { ...target, hard: true });

        assert.equal(result.hard, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}?hard=true`);
        assert.equal(result.steps[0]?.name, "Delete instance (hard)");
    });

    it("reports a refusal without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 403,
            body: JSON.stringify({ detail: "Forbidden" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await deleteInstance("test-token", target);
        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not delete the instance.");
        assert.equal(result.steps[0]?.error, "Forbidden");
    });
});

describe("advanceProcess", () => {
    it("submits the task and reports the process it landed in", async () => {
        // The app answers with a bare process state here, not with the whole instance.
        const stub = stubAltinn(() => ({
            body: JSON.stringify({
                started: "2026-09-03T09:59:00Z",
                currentTask: { flow: 3, elementId: "Task_2", altinnTaskType: "confirmation" },
                ended: null
            }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await advanceProcess("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.method, "PUT");
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/process/next`);
        assert.equal(result.steps[0]?.name, "Advance process to next task");
        assert.equal(result.process?.currentTask, "Task_2");
        assert.equal(result.process?.taskType, "confirmation");
    });

    it("reports a refusal without throwing, since it is usually validation talking", async () => {
        const stub = stubAltinn(() => ({
            status: 409,
            body: JSON.stringify({ detail: "Instance is not valid for task Task_1" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await advanceProcess("test-token", target);

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not advance the process.");
        assert.equal(result.process, null);
        assert.equal(result.steps[0]?.error, "Instance is not valid for task Task_1");
    });
});

describe("readDataElement", () => {
    it("gets the chosen data element and returns the xml verbatim", async () => {
        const xml = '<?xml version="1.0" encoding="utf-8"?>\n<ettrinn><a>1</a></ettrinn>';
        const stub = stubAltinn(() => ({ body: xml, contentType: "application/xml" }));
        active = stub;

        const result = await readDataElement("test-token", { ...target, dataGuid: DATA_GUID });

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/data/${DATA_GUID}`);
        // Asking for JSON would stop Altinn handing back a stored XML element as stored. Asking
        // for XML was tried and does nothing: the app has no XML output formatter, so form data
        // comes back as JSON whatever we ask for.
        assert.equal(stub.calls[0]?.accept, "*/*");
        assert.equal(result.contentType, "application/xml");
        assert.equal(result.content, xml);
        assert.equal(result.dataGuid, DATA_GUID);
    });

    it("returns a json data element as text, not pre-parsed", async () => {
        const body = '{"melding":{"navn":"Test"}}';
        const stub = stubAltinn(() => ({ body, contentType: "application/json" }));
        active = stub;

        const result = await readDataElement("test-token", { ...target, dataGuid: DATA_GUID });
        // The payload is handed back verbatim, so it is the app's bytes and not our re-encoding.
        assert.equal(result.encoding, "utf8");
        assert.equal(result.content, body);
    });

    it("returns a binary data element as base64", async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
        // Passed as bytes, since routing them through a JS string would re-encode them as UTF-8.
        const stub = stubAltinn(() => ({ body: png, contentType: "image/png" }));
        active = stub;

        const result = await readDataElement("test-token", { ...target, dataGuid: DATA_GUID });
        assert.equal(result.encoding, "base64");
        assert.equal(result.contentType, "image/png");
        // Decoding must give the bytes back, which UTF-8 text handling would have mangled.
        assert.deepEqual([...Buffer.from(result.content ?? "", "base64")], [...png]);

        // The log gets a byte summary rather than mojibake.
        assert.deepEqual(result.steps[0]?.response, { bytes: png.length, contentType: "image/png" });
    });

    it("reports an unknown data guid without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 404,
            body: JSON.stringify({ detail: "Data element not found" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readDataElement("test-token", { ...target, dataGuid: "nope" });

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not read the data element.");
        assert.equal(result.content, null);
        assert.equal(result.steps[0]?.error, "Data element not found");
    });
});

const ISSUES = [
    { severity: 1, code: "required", description: "Feltet er obligatorisk.", field: "tiltakshaver" },
    { severity: 1, code: "required", description: "Mangler kommunenummer.", field: "eiendom" },
    { severity: 2, code: "advice", description: "Anbefalt felt mangler.", field: "epost" },
    { severity: 3, code: "info", description: "Til informasjon." },
    "not-an-object"
];

describe("validateInstance", () => {
    it("validates the instance and counts issues by severity", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify(ISSUES),
            contentType: "application/json"
        }));
        active = stub;

        const result = await validateInstance("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/validate`);
        assert.equal(result.steps[0]?.name, "Validate instance");
        assert.equal(result.dataGuid, null);
        // The malformed entry is dropped rather than counted.
        assert.equal(result.issues.length, 4);
        assert.deepEqual(result.counts, { errors: 2, warnings: 1, other: 1 });
        assert.equal(result.issues[0]?.field, "tiltakshaver");
    });

    it("reports a clean instance as no issues", async () => {
        const stub = stubAltinn(() => ({ body: "[]", contentType: "application/json" }));
        active = stub;

        const result = await validateInstance("test-token", target);
        assert.equal(result.ok, true);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.counts, { errors: 0, warnings: 0, other: 0 });
    });

    it("reports a failure without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 404,
            body: JSON.stringify({ detail: "Not found" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await validateInstance("test-token", target);
        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not validate the instance.");
        assert.deepEqual(result.counts, { errors: 0, warnings: 0, other: 0 });
    });
});

describe("validateDataElement", () => {
    it("validates one data element and keeps its guid", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify([ISSUES[0]]),
            contentType: "application/json"
        }));
        active = stub;

        const result = await validateDataElement("test-token", { ...target, dataGuid: DATA_GUID });

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/data/${DATA_GUID}/validate`);
        assert.equal(result.steps[0]?.name, "Validate data element");
        assert.equal(result.dataGuid, DATA_GUID);
        assert.deepEqual(result.counts, { errors: 1, warnings: 0, other: 0 });
    });

    it("reports an unknown data guid without throwing", async () => {
        const stub = stubAltinn(() => ({
            status: 404,
            body: JSON.stringify({ detail: "Data element not found" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await validateDataElement("test-token", { ...target, dataGuid: "nope" });
        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not validate the data element.");
    });
});

describe("severityLabel", () => {
    it("names the severities Altinn uses", () => {
        assert.equal(severityLabel(1), "error");
        assert.equal(severityLabel(2), "warning");
        assert.equal(severityLabel(3), "info");
        assert.equal(severityLabel(4), "fixed");
        assert.equal(severityLabel(5), "success");
        assert.equal(severityLabel(9), "severity 9");
    });
});
