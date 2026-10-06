import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchValidationReport, type ValidationReportRequest } from "./validationService.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

/** A submission of an ET main form with the given subforms, each one's content being its own name, so the stub can tell them apart. */
function submission(...subForms: string[]): ValidationReportRequest {
    return {
        authenticatedSubmitter: "01899699552",
        formData: "ET",
        subForms: subForms.map((name) => ({ formName: name, subFormData: name })),
        attachments: []
    } as unknown as ValidationReportRequest;
}

/**
 * A validation service that answers each form from a table keyed by what the form holds, and refuses with a 500 any form it has no answer for. Records the forms it was asked about.
 */
function stubService(answers: Record<string, unknown>) {
    const asked: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const formData = String(JSON.parse(String(init?.body)).formData);
        asked.push(formData);
        return formData in answers
            ? new Response(JSON.stringify(answers[formData]), { status: 200, headers: { "Content-Type": "application/json" } })
            : new Response("refused", { status: 500, statusText: "Internal Server Error" });
    }) as typeof fetch;
    return asked;
}

const said = (soknadtype: string, ...messagetypes: string[]) => ({ soknadtype, messages: messagetypes.map((messagetype) => ({ messagetype })) });

describe("fetchValidationReport", () => {
    it("asks about each form on its own and merges what comes back", async () => {
        const asked = stubService({ ET: said("ET", "ERROR"), Gjennomfoeringsplan: said("GFP", "WARNING") });

        const result = await fetchValidationReport(submission("Gjennomfoeringsplan"), "ET");

        assert.deepEqual(asked, ["ET", "Gjennomfoeringsplan"]);
        assert.equal(result.ok, true);
        assert.deepEqual(result.refused, []);
        assert.equal(result.failedAt, null);
        assert.deepEqual(result.report, {
            soknadtype: "ET",
            mainFormName: "ET",
            errors: 1,
            warnings: 1,
            messages: [
                { messagetype: "ERROR", fromForm: "ET" },
                { messagetype: "WARNING", fromForm: "Gjennomfoeringsplan" }
            ]
        });
    });

    it("carries on past a refused subform, and says which one it was", async () => {
        stubService({ ET: said("ET", "ERROR") });

        const result = await fetchValidationReport(submission("Gjennomfoeringsplan"), "ET");

        assert.equal(result.ok, false);
        assert.deepEqual(result.refused, ["Gjennomfoeringsplan"]);
        assert.equal(result.failedAt, "The validation service would not answer about Gjennomfoeringsplan.");
        assert.deepEqual((result.report as { messages: unknown[] }).messages, [{ messagetype: "ERROR", fromForm: "ET" }]);
    });

    it("names every refused form, not only the first", async () => {
        stubService({ ET: said("ET") });

        const result = await fetchValidationReport(submission("A", "B", "C"), "ET");

        assert.deepEqual(result.refused, ["A", "B", "C"]);
        assert.equal(result.failedAt, "The validation service would not answer about A, B and C.");
    });

    it("keeps the main form's name when it is the one refused, and borrows no soknadtype from a subform", async () => {
        stubService({ Dispensasjon: said("DS", "ERROR") });

        const result = await fetchValidationReport(submission("Dispensasjon"), "ET");
        const report = result.report as { soknadtype: string; mainFormName: string; messages: { fromForm: string }[] };

        assert.deepEqual(result.refused, ["ET"]);
        assert.equal(report.soknadtype, "");
        assert.equal(report.mainFormName, "ET");
        assert.equal(report.messages[0]?.fromForm, "Dispensasjon");
    });

    it("answers no report at all when no form was answered", async () => {
        stubService({});

        const result = await fetchValidationReport(submission("Gjennomfoeringsplan"), "ET");

        assert.equal(result.report, null);
        assert.deepEqual(result.refused, ["ET", "Gjennomfoeringsplan"]);
    });
});
