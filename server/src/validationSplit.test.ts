import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeReports, splitSubmission, type ReportPart } from "./validationSplit.js";
import type { ValidationReportRequest } from "./validationService.js";

const attachments = [{ attachmentTypeName: "Situasjonsplan", filename: "dummy.pdf", fileSize: 10 }];

const submission = (subForms: { formName: string; subFormData: string }[] = []): ValidationReportRequest => ({
    authenticatedSubmitter: "910297937",
    formData: "<ettrinn />",
    subForms,
    attachments
});

describe("splitSubmission", () => {
    /* No subforms is one request identical to what was always sent, which is the common case. */
    it("is one request when there is nothing but the main form", () => {
        const asked = splitSubmission(submission(), "ET");

        assert.equal(asked.length, 1);
        assert.equal(asked[0]?.formName, "ET");
        assert.equal(asked[0]?.main, true);
        assert.equal(asked[0]?.request.formData, "<ettrinn />");
    });

    it("gives every subform a request of its own, with the main form first", () => {
        const asked = splitSubmission(
            submission([
                { formName: "GjennomfoeringsplanDataV7", subFormData: "<gfp />" },
                { formName: "DispensasjonssoeknadDataV1", subFormData: "<ds />" }
            ]),
            "ET"
        );

        assert.deepEqual(
            asked.map((each) => [each.formName, each.main, each.request.formData]),
            [
                ["ET", true, "<ettrinn />"],
                ["GjennomfoeringsplanDataV7", false, "<gfp />"],
                ["DispensasjonssoeknadDataV1", false, "<ds />"]
            ]
        );
    });

    /*
     * Measured rather than assumed. Naming six attachments on an ET submission silenced six of its
     * fourteen document rules, and nothing was ever added by naming one, so a form sent bare would
     * report documents the submission has as missing.
     */
    it("gives every request the whole attachment list", () => {
        const asked = splitSubmission(submission([{ formName: "GjennomfoeringsplanDataV7", subFormData: "<gfp />" }]), "ET");

        for (const each of asked) {
            assert.deepEqual(each.request.attachments, attachments);
            assert.equal(each.request.authenticatedSubmitter, "910297937");
        }
    });

    /* The property the service ignores, and the reason this module exists. */
    it("never sets subForms on anything it sends", () => {
        const asked = splitSubmission(submission([{ formName: "GjennomfoeringsplanDataV7", subFormData: "<gfp />" }]), "ET");

        for (const each of asked) assert.deepEqual(each.request.subForms, []);
    });
});

const part = (formName: string, main: boolean, report: unknown): ReportPart => ({ formName, main, report });

const said = (soknadtype: string, messages: Record<string, unknown>[]): unknown => ({ soknadtype, errors: 0, warnings: 0, messages });

describe("mergeReports", () => {
    it("reads as one report, holding every part's messages", () => {
        const merged = mergeReports([
            part("ET", true, said("ET", [{ rule: "a", messagetype: "ERROR" }])),
            part("GjennomfoeringsplanDataV7", false, said("GFP", [{ rule: "b", messagetype: "WARNING" }]))
        ]);

        assert.equal(merged.messages.length, 2);
        assert.equal(merged.errors, 1);
        assert.equal(merged.warnings, 1);
    });

    /*
     * The service calls a subform its own submission type, GFP or DS, so without this a DS error
     * out of a subform is indistinguishable from one about the main form and the panel would be
     * naming a problem in a document it never mentions.
     */
    it("tags each message with the form it came from, the main one included", () => {
        const merged = mergeReports([
            part("ET", true, said("ET", [{ rule: "a" }])),
            part("DispensasjonssoeknadDataV1", false, said("DS", [{ rule: "b" }]))
        ]);

        assert.deepEqual(
            merged.messages.map((message) => [message["rule"], message["fromForm"]]),
            [
                ["a", "ET"],
                ["b", "DispensasjonssoeknadDataV1"]
            ]
        );
    });

    /* The submission is an ET submission whatever its subforms come back as. */
    it("keeps the main form's soknadtype", () => {
        const merged = mergeReports([part("ET", true, said("ET", [])), part("GjennomfoeringsplanDataV7", false, said("GFP", []))]);
        assert.equal(merged.soknadtype, "ET");
    });

    /*
     * On the flag rather than on the position. splitSubmission puts the main form first and the
     * service keeps that order, so today the two agree, and an ordering invariant reaching across
     * two modules is not a thing to leave a merge depending on.
     */
    it("takes the main form's soknadtype wherever in the list it is", () => {
        const merged = mergeReports([part("GjennomfoeringsplanDataV7", false, said("GFP", [])), part("ET", true, said("ET", []))]);
        assert.equal(merged.soknadtype, "ET");
    });

    it("falls back to the first part when the main form is not among them", () => {
        const merged = mergeReports([part("GjennomfoeringsplanDataV7", false, said("GFP", []))]);
        assert.equal(merged.soknadtype, "GFP");
    });

    /*
     * Recounted rather than summed from the parts. A part that was refused contributes no messages,
     * and summing the counts would promise findings that are not in the list.
     */
    it("counts the messages it has rather than what the parts claimed", () => {
        const merged = mergeReports([
            part("ET", true, { soknadtype: "ET", errors: 99, warnings: 99, messages: [{ messagetype: "ERROR" }, { messagetype: "WARNING" }] })
        ]);

        assert.equal(merged.errors, 1);
        assert.equal(merged.warnings, 1);
    });

    /* Anything that is not an error is the milder one, the same reading the parser uses. */
    it("counts a severity it does not recognise as a warning", () => {
        const merged = mergeReports([part("ET", true, said("ET", [{ messagetype: "INFO" }, { messagetype: undefined }]))]);
        assert.equal(merged.errors, 0);
        assert.equal(merged.warnings, 2);
    });

    it("copes with a part that answered something other than a report", () => {
        const merged = mergeReports([part("ET", true, null), part("GFP", false, "not json"), part("DS", false, { messages: "nor this" })]);

        assert.deepEqual(merged.messages, []);
        assert.equal(merged.errors, 0);
    });
});
