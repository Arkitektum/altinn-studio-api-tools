import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
    advanceProcess,
    deleteInstance,
    listInstances,
    previewPdf,
    readDataElement,
    readInstance,
    readPdfTargets,
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
            lastChangedBy: null,
            // The endpoint only answers with unfinished ones, so the row need not say so itself.
            state: "active"
        });
        // Nothing was asked of storage, which is not the same as storage having nothing to add.
        assert.equal(result.completedListed, null);
        assert.equal(result.completedStatus, null);
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

    describe("with the completed ones", () => {
        const FINISHED = "bbbbbbbb-1111-2222-3333-444444444444";
        const DELETED = "cccccccc-1111-2222-3333-444444444444";

        /** The app's active list, and storage answering with everything it holds for the party. */
        function stubBoth(storage: { status?: number; body: unknown }) {
            return stubAltinn((url) =>
                url.includes("/storage/api/v1/instances")
                    ? { status: storage.status, body: JSON.stringify(storage.body), contentType: "application/json" }
                    : {
                          body: JSON.stringify([{ id: `510001/${GUID}`, lastChanged: "2026-09-03T10:00:00Z" }]),
                          contentType: "application/json"
                      }
            );
        }

        const storageBody = {
            count: 3,
            instances: [
                // The same instance the app already offered, which must not be listed twice.
                { id: `510001/${GUID}`, lastChanged: "2026-09-03T10:00:00Z", process: { ended: null } },
                { id: `510001/${FINISHED}`, lastChanged: "2026-09-04T12:00:00Z", process: { ended: "2026-09-04T12:00:00Z" } },
                { id: `510001/${DELETED}`, lastChanged: "2026-09-02T09:00:00Z", status: { softDeleted: "2026-09-02T09:05:00Z" } }
            ]
        };

        it("asks storage as well, and says which instance is in what state", async () => {
            const stub = stubBoth({ body: storageBody });
            active = stub;

            const result = await listInstances("test-token", { ...party, includeCompleted: true });

            assert.equal(result.ok, true);
            assert.equal(result.completedListed, true);
            assert.equal(stub.calls.length, 2);
            assert.equal(stub.calls[1]?.url, "http://localhost:5101/storage/api/v1/instances?appId=dibk%2Fet-v4&instanceOwner.partyId=510001");
            assert.equal(result.steps[1]?.name, "List every instance from storage");

            // Three rows, newest first, and the one both endpoints hold is listed once.
            assert.deepEqual(
                result.instances.map((instance) => [instance.instanceGuid, instance.state]),
                [
                    [FINISHED, "completed"],
                    [GUID, "active"],
                    [DELETED, "deleted"]
                ]
            );
        });

        it("keeps the active list when storage will not answer", async () => {
            const stub = stubBoth({ status: 403, body: { detail: "Forbidden" } });
            active = stub;

            const result = await listInstances("test-token", { ...party, includeCompleted: true });

            // The listing that did answer still stands, and the refusal is a step in the log.
            assert.equal(result.ok, true);
            assert.equal(result.completedListed, false);
            assert.equal(result.instances.length, 1);
            assert.equal(result.instances[0]?.instanceGuid, GUID);
            assert.equal(result.steps[1]?.ok, false);
        });

        /*
         * A 403 is the token not being allowed to act for that party, which is a thing you fix. A
         * 500 is LocalTest, which is a thing you wait for. The panel said "usually a 403" before
         * this, which is a guess it does not have to make.
         */
        it("says which refusal it was, rather than leaving the panel to guess", async () => {
            for (const status of [403, 404, 500]) {
                active = stubBoth({ status, body: { detail: "no" } });
                const result = await listInstances("test-token", { ...party, includeCompleted: true });
                assert.equal(result.completedStatus, status, `expected ${status} to be carried through`);
            }
        });

        it("has no status to report when storage answered", async () => {
            active = stubBoth({ body: storageBody });
            const result = await listInstances("test-token", { ...party, includeCompleted: true });

            assert.equal(result.completedListed, true);
            assert.equal(result.completedStatus, null);
        });

        it("treats a row it cannot place as active rather than hiding it", async () => {
            const stub = stubBoth({ body: { instances: [{ id: `510001/${FINISHED}` }] } });
            active = stub;

            const result = await listInstances("test-token", { ...party, includeCompleted: true });
            assert.equal(result.instances.find((instance) => instance.instanceGuid === FINISHED)?.state, "active");
        });
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

describe("previewPdf", () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.7 test");

    it("asks for the instance as a whole when no task is named, as it always did", async () => {
        const stub = stubAltinn(() => ({ body: pdfBytes, contentType: "application/pdf" }));
        active = stub;

        const result = await previewPdf("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/pdf/preview`);
        assert.equal(stub.calls[0]?.accept, "application/pdf");
        assert.equal(result.size, pdfBytes.byteLength);
        assert.equal(Buffer.from(result.content ?? "", "base64").toString(), "%PDF-1.7 test");
    });

    it("names the task, the subform element and the language in the query", async () => {
        const stub = stubAltinn(() => ({ body: pdfBytes, contentType: "application/pdf" }));
        active = stub;

        await previewPdf("test-token", { ...target, taskId: "PdfSubform", dataElementId: DATA_GUID, language: "nn" });

        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/pdf/preview?taskId=PdfSubform&dataElementId=${DATA_GUID}&language=nn`);
    });

    it("sends only what was given, so a language alone renders the whole instance in it", async () => {
        const stub = stubAltinn(() => ({ body: pdfBytes, contentType: "application/pdf" }));
        active = stub;

        await previewPdf("test-token", { ...target, language: "en" });

        assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/pdf/preview?language=en`);
    });

    it("reports a refusal without throwing, and without content", async () => {
        const stub = stubAltinn(() => ({
            status: 400,
            body: JSON.stringify({ detail: "taskId must identify a PDF or subform PDF service task" }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await previewPdf("test-token", { ...target, taskId: "Task_1" });

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not render the pdf preview.");
        assert.equal(result.content, null);
        assert.equal(result.size, 0);
    });
});

describe("readPdfTargets", () => {
    const processBody = {
        currentTask: { elementId: "Task_1", altinnTaskType: "data" },
        processTasks: [
            { elementId: "Task_1", altinnTaskType: "data" },
            { elementId: "PdfForm", altinnTaskType: "pdf" },
            { elementId: "PdfSubform", altinnTaskType: "subformPdf" },
            { elementId: "PdfSubform2", altinnTaskType: "subformPdf" },
            { elementId: "PdfSubform3", altinnTaskType: "subformPdf" },
            { elementId: "Untyped" },
            { altinnTaskType: "pdf" },
            "not-an-object"
        ]
    };

    /*
     * et-v4's layout sets as they are. The set for PdfSubform is on ET, the main form's data type,
     * which is what made the set's data type the wrong thing to go by.
     */
    const layoutSetsBody = {
        sets: [
            { id: "form", dataType: "ET", tasks: ["Task_1"] },
            { id: "subform-DispensasjonssoeknadDataV1", dataType: "DispensasjonssoeknadDataV1", type: "subform" },
            { id: "subform-GjenpartNabovarselDataV3", dataType: "GjenpartNabovarselDataV3", type: "subform" },
            { id: "subform-GjennomfoeringsplanDataV7", dataType: "GjennomfoeringsplanDataV7", type: "subform" },
            { id: "formPdf", dataType: "ET", tasks: ["PdfForm"] },
            { id: "subform-DispensasjonssoeknadDataV1Pdf", dataType: "ET", tasks: ["PdfSubform"] },
            { id: "subform-GjenpartNabovarselDataV3Pdf", dataType: "GjenpartNabovarselDataV3", tasks: ["PdfSubform2"] },
            { id: "subform-GjennomfoeringsplanDataV7Pdf", dataType: "GjennomfoeringsplanDataV7", tasks: ["PdfSubform3"] }
        ]
    };

    /** A pdf task's layouts, holding the hidden Subform component that names the subform's set. */
    const serviceTaskLayouts = (subformSet: string) => ({
        ServiceTask: {
            $schema: "https://altinncdn.no/toolkits/altinn-app-frontend/4/schemas/json/layout/layout.schema.v1.json",
            data: {
                layout: [
                    // Ahead of it, so it is the component's type that picks it and not being first.
                    { id: "not-it", type: "Paragraph", layoutSet: "form" },
                    { id: "pdf-subform", type: "Subform", layoutSet: subformSet, hidden: true }
                ]
            }
        }
    });

    type Answer = { status?: number; body: unknown };
    /**
     * `contentType` is what the layout sets and layouts come back labelled as. The app serves them
     * as the files' text, not as `application/json`, which is what a stub answering json hid.
     */
    function respondWith(answers: { layoutSets?: Answer; layouts?: (set: string) => Answer; contentType?: string }) {
        const files = answers.contentType ?? "text/plain; charset=utf-8";
        return (url: string) => {
            const answer = ({ status = 200, body }: Answer, contentType: string) => ({ status, body: JSON.stringify(body), contentType });
            if (url.endsWith("/api/layoutsets")) return answer(answers.layoutSets ?? { body: layoutSetsBody }, files);
            const layouts = url.match(/\/api\/layouts\/([^/]+)$/);
            if (layouts) return answer(answers.layouts?.(decodeURIComponent(layouts[1] ?? "")) ?? { status: 404, body: {} }, files);
            return answer({ body: processBody }, "application/json");
        };
    }

    /** Each pdf set's Subform component points at the subform it is named after. */
    const namedAfter = (set: string): Answer => ({ body: serviceTaskLayouts(set.replace(/Pdf$/, "")) });

    it("places each subform task through the Subform component in its layout, not its set's data type", async () => {
        const stub = stubAltinn(respondWith({ layouts: namedAfter }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.ok, true);
        assert.deepEqual(
            stub.calls.map((call) => call.url),
            [
                `${APP_BASE}/instances/510001/${GUID}/process`,
                `${APP_BASE}/api/layoutsets`,
                `${APP_BASE}/api/layouts/subform-DispensasjonssoeknadDataV1Pdf`,
                `${APP_BASE}/api/layouts/subform-GjenpartNabovarselDataV3Pdf`,
                `${APP_BASE}/api/layouts/subform-GjennomfoeringsplanDataV7Pdf`
            ]
        );
        assert.deepEqual(
            result.steps.map((step) => step.name),
            ["Get process tasks", "Get layout sets", "Get layouts for PdfSubform", "Get layouts for PdfSubform2", "Get layouts for PdfSubform3"]
        );
        assert.deepEqual(result.pdfTasks, ["PdfForm"]);
        assert.deepEqual(result.subformPdfTasks, [
            { taskId: "PdfSubform", dataType: "DispensasjonssoeknadDataV1" },
            { taskId: "PdfSubform2", dataType: "GjenpartNabovarselDataV3" },
            { taskId: "PdfSubform3", dataType: "GjennomfoeringsplanDataV7" }
        ]);
    });

    it("reads them the same where the app does label them json", async () => {
        const stub = stubAltinn(respondWith({ layouts: namedAfter, contentType: "application/json" }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.deepEqual(
            result.subformPdfTasks.map((task) => task.dataType),
            ["DispensasjonssoeknadDataV1", "GjenpartNabovarselDataV3", "GjennomfoeringsplanDataV7"]
        );
    });

    it("goes by the component over the set even where both name a subform", async () => {
        // PdfSubform3's set says plan, its component says the neighbour notice: the component wins.
        const stub = stubAltinn(
            respondWith({
                layouts: (set) =>
                    set === "subform-GjennomfoeringsplanDataV7Pdf"
                        ? { body: serviceTaskLayouts("subform-GjenpartNabovarselDataV3") }
                        : namedAfter(set)
            })
        );
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.subformPdfTasks[2]?.dataType, "GjenpartNabovarselDataV3");
    });

    it("falls back on the set's data type where the layouts cannot be read, but only a subform's", async () => {
        const stub = stubAltinn(respondWith({ layouts: () => ({ status: 500, body: { detail: "boom" } }) }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.ok, true);
        // PdfSubform's set is on ET, the main form, which no subform task renders.
        assert.deepEqual(result.subformPdfTasks, [
            { taskId: "PdfSubform", dataType: null },
            { taskId: "PdfSubform2", dataType: "GjenpartNabovarselDataV3" },
            { taskId: "PdfSubform3", dataType: "GjennomfoeringsplanDataV7" }
        ]);
    });

    it("does not trust a failed layouts read that happens to look right", async () => {
        const stub = stubAltinn(respondWith({ layouts: () => ({ status: 500, body: serviceTaskLayouts("subform-GjenpartNabovarselDataV3") }) }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.subformPdfTasks[0]?.dataType, null);
    });

    it("leaves a task no layout set names unplaced, without asking for layouts it has none of", async () => {
        const stub = stubAltinn(
            respondWith({
                layoutSets: { body: { sets: layoutSetsBody.sets.filter((set) => !set.tasks?.includes("PdfSubform")) } },
                layouts: namedAfter
            })
        );
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.subformPdfTasks[0]?.dataType, null);
        // The process, the layout sets, and the layouts of the two tasks that have a set.
        assert.equal(stub.calls.length, 4);
    });

    it("does not ask for the layout sets when there is no subform task to place", async () => {
        const stub = stubAltinn(() => ({
            body: JSON.stringify({ processTasks: [{ elementId: "PdfForm", altinnTaskType: "pdf" }] }),
            contentType: "application/json"
        }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(stub.calls.length, 1);
        assert.deepEqual(result.pdfTasks, ["PdfForm"]);
        assert.deepEqual(result.subformPdfTasks, []);
    });

    it("keeps the subform tasks when the layout sets cannot be read, unplaced", async () => {
        // A body that would place them, so it is the status that is trusted and not the shape.
        const stub = stubAltinn(respondWith({ layoutSets: { status: 500, body: layoutSetsBody }, layouts: namedAfter }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.ok, true);
        assert.equal(result.steps[1]?.status, 500);
        assert.deepEqual(
            result.subformPdfTasks.map((task) => task.dataType),
            [null, null, null]
        );
    });

    it("reads an app that lists no process tasks as having nothing but the whole instance", async () => {
        const stub = stubAltinn(() => ({ body: JSON.stringify({ currentTask: { elementId: "Task_1" } }), contentType: "application/json" }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.ok, true);
        assert.deepEqual(result.pdfTasks, []);
        assert.deepEqual(result.subformPdfTasks, []);
    });

    it("reports a process it could not read without throwing", async () => {
        const stub = stubAltinn(() => ({ status: 403, body: JSON.stringify({ detail: "Forbidden" }), contentType: "application/json" }));
        active = stub;

        const result = await readPdfTargets("test-token", target);

        assert.equal(result.ok, false);
        assert.equal(result.failedAt, "Could not read the process tasks.");
        assert.equal(stub.calls.length, 1);
        assert.deepEqual(result.pdfTasks, []);
    });
});
