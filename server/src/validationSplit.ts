import type { ValidationReportRequest } from "./validationService.js";

/**
 * Turning one submission into the requests the validation service can actually answer.
 *
 * The service takes `formData` and ignores `subForms` entirely. Sending a submission with three
 * subforms got back a report about the main form alone, and the subforms were never looked at: the
 * `soknadtype` that came back named whatever was in `formData`, whatever `subForms` held. So the
 * panel has been showing a report about one form while saying it was about the submission.
 *
 * Each form therefore goes up as a submission of its own. The service recognises them: a
 * gjennomføringsplan comes back as `GFP`, a dispensasjonssøknad as `DS`, so these are real
 * submission types rather than fragments it is being asked to make sense of.
 *
 * Every request carries the same attachments. Measured rather than assumed: naming six attachments
 * on an ET submission silenced six of its fourteen document rules, and nothing was ever added by
 * naming one. Attachments can only ever answer a rule, so giving every request the whole list is
 * both the safe choice and the correct one. A form sent bare would report documents the submission
 * has as missing.
 */

/** One request, and the form it is asking about, which is how its answers get attributed. */
export interface SplitRequest {
    /** The data type whose content this is. The main form's own name for the first one. */
    formName: string;
    /** True for the submission's own form, which is the one whose `soknadtype` the merge keeps. */
    main: boolean;
    request: ValidationReportRequest;
}

/**
 * `mainFormName` is only a label for the answers. The service works out what it has been given
 * from the form itself, so nothing about the request depends on getting this right.
 *
 * A submission with no subforms splits into one request identical to what was sent before, which
 * is what keeps this from being a change to the common case.
 */
export function splitSubmission(submission: ValidationReportRequest, mainFormName: string): SplitRequest[] {
    const shared = {
        authenticatedSubmitter: submission.authenticatedSubmitter,
        // Never populated again. It is the property the service ignores, and leaving it set would
        // be leaving the thing that caused this in the request.
        subForms: [],
        attachments: submission.attachments
    };

    return [
        { formName: mainFormName, main: true, request: { ...shared, formData: submission.formData } },
        ...submission.subForms.map((subForm) => ({
            formName: subForm.formName,
            main: false,
            request: { ...shared, formData: subForm.subFormData }
        }))
    ];
}

/** A message as the service writes one, kept loose because it is somebody else's shape. */
export type RawMessage = Record<string, unknown>;

export interface RawReport {
    soknadtype?: unknown;
    /** The form the submission is of, so a message tagged with any other came from a subform. */
    mainFormName?: unknown;
    errors?: unknown;
    warnings?: unknown;
    messages?: unknown;
}

/** One form's answer, with the form it was about. */
export interface ReportPart {
    formName: string;
    main: boolean;
    report: unknown;
}

function messagesOf(report: unknown): RawMessage[] {
    const messages = (report as RawReport | null)?.messages;
    return Array.isArray(messages) ? messages.filter((entry): entry is RawMessage => Boolean(entry) && typeof entry === "object") : [];
}

/**
 * The parts as one report, shaped exactly like one the service would have answered, so everything
 * downstream reads it without knowing it was ever several.
 *
 * Each message is tagged with the form it came from. Without that a `DS` error out of a subform is
 * indistinguishable from one about the main form, and the panel would be naming a problem in a
 * document it never mentions. A main form message is tagged too: a reader should not have to know
 * that absence means the main one.
 *
 * `soknadtype` is the main form's. The submission is an ET submission whatever its subforms come
 * back as, and the panel says "this ET submission" with it. When the main form was refused there is
 * no answer to take it from, so it is left empty rather than borrowed from a subform: a subform's
 * `DS` would have the panel call the whole submission a DS submission.
 *
 * `mainFormName` comes from the caller rather than from the parts for the same reason. It is what
 * tells a main form finding from a subform's, and a subform standing in for a refused main form
 * would have its own findings lose their badge.
 *
 * The counts are recounted from the messages rather than summed from the parts. A part that failed
 * contributes no messages, and summing would then promise findings that are not in the list.
 */
export function mergeReports(parts: ReportPart[], mainFormName: string): RawReport & { messages: RawMessage[] } {
    const main = parts.find((part) => part.main);
    const messages = parts.flatMap((part) => messagesOf(part.report).map((message) => ({ ...message, fromForm: part.formName })));
    const severityOf = (message: RawMessage): string => String(message["messagetype"] ?? "").toUpperCase();

    return {
        soknadtype: (main?.report as RawReport | null)?.soknadtype ?? "",
        mainFormName,
        errors: messages.filter((message) => severityOf(message) === "ERROR").length,
        warnings: messages.filter((message) => severityOf(message) !== "ERROR").length,
        messages
    };
}
