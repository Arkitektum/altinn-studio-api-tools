import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    issueRow,
    logFromCompare,
    logFromDataElement,
    logFromDelete,
    logFromRead,
    logFromRun,
    logFromValidation,
    renumber,
    toValidation
} from "./logResults";
import type { DataElementSummary, ReadInstanceResult, RunResult, RunStep, ValidateResult } from "../types";

const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";
const DATA_GUID = "fdeb5550-f4e8-4f23-87d0-111234ac4771";

function step(name: string, index = 1): RunStep {
    return { index, name, method: "GET", url: `http://local/${name}`, status: 200, ok: true, durationMs: 5 };
}

const ELEMENTS: DataElementSummary[] = [
    { id: DATA_GUID, dataType: "ET", contentType: "application/xml", filename: null, size: 100, lastChanged: null },
    { id: "aaaa", dataType: "vedlegg", contentType: "application/pdf", filename: "plan.pdf", size: 200, lastChanged: null }
];

function validation(overrides: Partial<ValidateResult> = {}): ValidateResult {
    return {
        ok: true,
        steps: [step("Validate instance")],
        failedAt: null,
        instanceGuid: GUID,
        dataGuid: null,
        issues: [],
        counts: { errors: 0, warnings: 0, other: 0 },
        ...overrides
    };
}

function run(overrides: Partial<RunResult> = {}): RunResult {
    return {
        ok: true,
        mode: "sequential",
        steps: [step("Create instance"), step("Add data element", 2)],
        instanceOwnerPartyId: "510001",
        instanceGuid: GUID,
        instanceUrl: `http://local/#/instance/510001/${GUID}`,
        instance: null,
        failedAt: null,
        ...overrides
    };
}

function instanceRead(overrides: Partial<ReadInstanceResult> = {}): ReadInstanceResult {
    return {
        ok: true,
        steps: [step("Get instance")],
        failedAt: null,
        instanceOwnerPartyId: "510001",
        instanceGuid: GUID,
        instanceUrl: `http://local/#/instance/510001/${GUID}`,
        instance: null,
        dataElements: ELEMENTS,
        process: { currentTask: "Task_1", taskType: "data", started: null, ended: null, endEvent: null },
        ...overrides
    };
}

const ISSUES = [
    { severity: 2, code: "advice", description: "Anbefalt felt mangler.", field: "epost", dataElementId: DATA_GUID, source: "ETValidator" },
    { severity: 1, code: "required", description: "Feltet er obligatorisk.", field: "tiltakshaver", dataElementId: null, source: null }
];

describe("renumber", () => {
    it("numbers concatenated steps from one, since each request numbers its own", () => {
        const steps = renumber([step("a"), step("b"), step("c")]);
        assert.deepEqual(
            steps.map((entry) => entry.index),
            [1, 2, 3]
        );
    });

    it("leaves everything else on the step untouched", () => {
        assert.equal(renumber([step("Get instance")])[0]?.name, "Get instance");
    });
});

describe("issueRow", () => {
    it("reads as none when nothing came back", () => {
        const row = issueRow(validation());
        assert.equal(row.value, "none");
        assert.equal(row.tone, "ok");
    });

    it("counts by severity, and singular reads as singular", () => {
        const row = issueRow(validation({ issues: ISSUES, counts: { errors: 1, warnings: 1, other: 0 } }));
        assert.equal(row.value, "1 error, 1 warning");
        assert.equal(row.tone, "bad");
    });

    it("mentions other severities only when there are some", () => {
        const row = issueRow(validation({ issues: ISSUES, counts: { errors: 0, warnings: 2, other: 3 } }));
        assert.equal(row.value, "0 errors, 2 warnings, 3 other");
        // Warnings alone do not block a submission, so they are amber rather than red.
        assert.equal(row.tone, "warn");
    });
});

describe("toValidation", () => {
    it("gives nothing when the request itself failed", () => {
        // Absent means no validation ran, which is what keeps earlier results on screen.
        assert.equal(toValidation(validation({ ok: false }), ELEMENTS), undefined);
        assert.equal(toValidation(null, ELEMENTS), undefined);
    });

    it("sorts issues worst first and names the data element by its type", () => {
        const view = toValidation(validation({ issues: ISSUES }), ELEMENTS);

        assert.equal(view?.key, "instance");
        assert.equal(view?.scope, "instance");
        assert.equal(view?.issues[0]?.severity, 1);
        assert.equal(view?.issues[0]?.severityLabel, "error");
        // The guid is resolved, so an issue says ET rather than fdeb5550-…
        assert.equal(view?.issues[1]?.dataElement, "ET");
    });

    it("keeps an unresolvable data element id as the id", () => {
        const view = toValidation(validation({ issues: [{ ...ISSUES[0]!, dataElementId: "unknown-guid" }] }), []);
        assert.equal(view?.issues[0]?.dataElement, "unknown-guid");
    });

    it("labels a data element validation by type, and keys it per element", () => {
        const view = toValidation(validation({ dataGuid: DATA_GUID }), ELEMENTS);
        assert.equal(view?.key, `data:${DATA_GUID}`);
        assert.equal(view?.scope, "data element");
        assert.equal(view?.label, "ET");
    });
});

describe("logFromRun", () => {
    it("folds the post, the read and the validation into one entry", () => {
        const entry = logFromRun(run(), {
            instance: instanceRead(),
            validation: validation({ issues: ISSUES, counts: { errors: 1, warnings: 1, other: 0 } })
        });

        assert.equal(entry.title, "Posted");
        // Two post steps, one read, one validate, renumbered across the lot.
        assert.deepEqual(
            entry.steps.map((s) => s.index),
            [1, 2, 3, 4]
        );
        assert.deepEqual(
            entry.rows.map((row) => row.label),
            ["Mode", "Party", "Instance", "Data elements", "Task", "Issues"]
        );
        assert.equal(entry.rows.find((row) => row.label === "Task")?.value, "Task_1");
        assert.equal(entry.validation?.issues.length, 2);
    });

    it("says only what it knows when the follow-ups did not answer", () => {
        const entry = logFromRun(run({ ok: false, failedAt: "Instance creation failed.", instanceGuid: null, instanceUrl: null }), {
            instance: null,
            validation: null
        });

        assert.equal(entry.ok, false);
        assert.equal(entry.failedAt, "Instance creation failed.");
        assert.deepEqual(
            entry.rows.map((row) => row.label),
            ["Mode", "Party"]
        );
        assert.equal(entry.validation, undefined);
    });
});

describe("logFromDataElement", () => {
    const read = {
        ok: true,
        steps: [step("Get data element")],
        failedAt: null,
        dataGuid: DATA_GUID,
        contentType: "application/xml",
        encoding: "utf8" as const,
        content: "<ET/>"
    };

    it("reports the decoded byte count for base64 content", () => {
        // Four base64 characters carry three bytes, which is worth saying out loud.
        const rows = logFromDataElement({ ...read, encoding: "base64", content: "AAAAAAAA", contentType: "image/png" }).rows;
        assert.equal(rows.find((row) => row.label === "Bytes")?.value, "6");
    });

    it("leaves the byte count out for text, and for a read that failed", () => {
        assert.equal(
            logFromDataElement(read).rows.some((row) => row.label === "Bytes"),
            false
        );
        assert.equal(
            logFromDataElement({ ...read, ok: false, encoding: "base64", content: null }).rows.some((row) => row.label === "Bytes"),
            false
        );
    });
});

describe("logFromDelete", () => {
    const deleted = { ok: true, steps: [step("Delete instance")], failedAt: null, instanceOwnerPartyId: "510001", instanceGuid: GUID };

    it("says which kind of delete it was, in the title and in a row", () => {
        assert.equal(logFromDelete({ ...deleted, hard: true }).title, "Deleted instance");
        assert.equal(logFromDelete({ ...deleted, hard: false }).title, "Marked instance deleted");
        assert.equal(logFromDelete({ ...deleted, hard: false }).rows.find((row) => row.label === "Delete")?.value, "soft");
    });
});

describe("logFromValidation", () => {
    it("titles itself by what was validated", () => {
        assert.equal(logFromValidation(validation(), ELEMENTS).title, "Validated instance");
        assert.equal(logFromValidation(validation({ dataGuid: DATA_GUID }), ELEMENTS).title, "Validated data element");
    });

    it("leaves out the issue row on a failed request, where none would read as clean", () => {
        const entry = logFromValidation(validation({ ok: false, failedAt: "Could not validate the instance." }), ELEMENTS);
        assert.deepEqual(entry.rows, []);
        assert.equal(entry.validation, undefined);
    });
});

describe("logFromRead", () => {
    it("folds the read and its validation into one entry", () => {
        const entry = logFromRead(instanceRead(), validation({ issues: ISSUES, counts: { errors: 1, warnings: 1, other: 0 } }));

        assert.equal(entry.title, "Read instance");
        // One read step and one validate step, renumbered across both.
        assert.deepEqual(
            entry.steps.map((step) => step.index),
            [1, 2]
        );
        assert.deepEqual(
            entry.rows.map((row) => row.label),
            ["Party", "Instance", "Data elements", "Task", "Issues"]
        );
        assert.equal(entry.validation?.issues.length, 2);
    });

    it("leaves the task row out for an instance with no process", () => {
        const rows = logFromRead(instanceRead({ process: null }), null).rows;
        assert.equal(
            rows.some((row) => row.label === "Task"),
            false
        );
    });

    it("says only what it knows when the read failed", () => {
        const entry = logFromRead(instanceRead({ ok: false, failedAt: "Could not read the instance." }), null);

        assert.equal(entry.ok, false);
        assert.equal(entry.instanceUrl, null);
        assert.deepEqual(
            entry.rows.map((row) => row.label),
            ["Party", "Instance"]
        );
        assert.equal(entry.validation, undefined);
    });
});

describe("logFromCompare", () => {
    const compared = {
        ok: true,
        steps: [step("Read the stored data element")],
        failedAt: null,
        dataGuid: DATA_GUID,
        storedContentType: "application/xml",
        stored: "<ettrinn/>"
    };

    it("counts the differences that mean something, and names the row ids apart", () => {
        // The panel hides row ids by default, so a bare count of twelve would disagree with it.
        const entry = logFromCompare({
            ...compared,
            diff: {
                same: false,
                differences: [
                    { path: "/ettrinn/part[1]/@altinnRowId", kind: "added" as const, left: null, right: "guid", type: "uuid" },
                    { path: "/ettrinn/part[2]/@altinnRowId", kind: "added" as const, left: null, right: "guid", type: "uuid" },
                    { path: "/ettrinn/festenr", kind: "missing" as const, left: "2", right: null, type: null }
                ]
            }
        });

        assert.equal(entry.rows.find((row) => row.label === "Differences")?.value, "1, plus 2 altinnRowId");
        assert.equal(entry.rows.find((row) => row.label === "Differences")?.tone, "warn");
    });

    it("reads as none for two documents that say the same thing", () => {
        const entry = logFromCompare({ ...compared, diff: { same: true, differences: [] } });
        const row = entry.rows.find((entry) => entry.label === "Differences");
        assert.equal(row?.value, "none");
        assert.equal(row?.tone, "ok");
    });

    it("reads as ok when only row ids differ, since nothing meaningful did", () => {
        const entry = logFromCompare({
            ...compared,
            diff: {
                same: false,
                differences: [{ path: "/ettrinn/part[1]/@altinnRowId", kind: "added" as const, left: null, right: "guid", type: "uuid" }]
            }
        });
        const row = entry.rows.find((entry) => entry.label === "Differences");
        assert.equal(row?.value, "0, plus 1 altinnRowId");
        assert.equal(row?.tone, "ok");
    });

    it("says nothing about differences when the comparison never happened", () => {
        const entry = logFromCompare({ ...compared, ok: false, failedAt: "Could not read the stored data element.", diff: null });
        assert.equal(
            entry.rows.some((row) => row.label === "Differences"),
            false
        );
    });
});
