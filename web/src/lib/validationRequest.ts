import { dataTypeKindOf } from "./dataTypeGroups";
import { identityFor } from "./identity";
import type { AppDataType, AppParty, ApplicationMetadata, DataElementInput, PublicToken, ValidationReportRequest } from "../types";

/**
 * The payload as the DIBK validation service wants to see it.
 *
 * The service takes a submission rather than a list of data elements: one form, its subforms by
 * name, and the attachments by type, name and size. The tool already knows which element is
 * which, from the same grouping the payload picker uses, so this is a translation rather than a
 * decision.
 *
 * Two things in it were told to the tool rather than worked out. `authenticatedSubmitter` is the
 * organisation number of the party the instance is for, falling back to the person number when
 * the party is a person. And a subform's `formName` is its Altinn data type id.
 */

/** Bytes on the wire, which is what the service is told about an attachment. */
export function contentBytes(element: DataElementInput): number {
    if (element.encoding === "base64") {
        // Four base64 characters carry three bytes, less whatever the padding stands in for.
        const padding = element.content.endsWith("==") ? 2 : element.content.endsWith("=") ? 1 : 0;
        return Math.max(0, Math.floor((element.content.length * 3) / 4) - padding);
    }
    return new TextEncoder().encode(element.content).length;
}

/**
 * The number of the party being submitted for. Empty when the app has not been read for its
 * parties and the token has no claim to fall back on.
 *
 * The same identity `lib/formIdentity.ts` writes into the form, deliberately: the service refuses
 * a submission whose sender is not the party named in it, so the two agreeing is the point.
 */
export function submitterFor(parties: AppParty[], partyId: string, token: PublicToken | null): string {
    return identityFor(parties, partyId, token)?.number ?? "";
}

export interface ValidationRequestInputs {
    elements: DataElementInput[];
    dataTypes: AppDataType[];
    metadata: ApplicationMetadata | null;
    parties: AppParty[];
    partyId: string;
    /** For its claim, which is who you are before the app has been read for its parties. */
    token: PublicToken | null;
}

/**
 * Whether a report still describes the payload in front of you.
 *
 * What was sent is the whole of what the report was about, so comparing it with what would be sent
 * now is the whole test. Any edit at all counts, down to a character in the form: the service reads
 * the form to decide which documents its rules ask for, so there is no such thing as a change too
 * small to matter.
 */
export function sameSubmission(sent: ValidationReportRequest | null, current: ValidationReportRequest | null): boolean {
    if (sent === current) return true;
    if (!sent || !current) return false;

    /*
     * The documents first, on their own. They are almost all of a submission by size, and the two
     * sides usually hold the very same string: what a report was asked about is the payload element
     * it was read from, which has not been touched since. This runs on every keystroke while a
     * report is on screen, and comparing them here is what keeps a megabyte of form out of the
     * stringify below.
     */
    if (sent.formData !== current.formData) return false;
    if (sent.subForms.length !== current.subForms.length) return false;
    if (sent.subForms.some((subForm, index) => subForm.subFormData !== current.subForms[index]?.subFormData)) return false;

    /*
     * Then everything else as it always was, with the documents taken out rather than the fields of
     * interest picked out: a field added to the request is still compared without anyone having to
     * remember this function exists.
     */
    return JSON.stringify(withoutDocuments(sent)) === JSON.stringify(withoutDocuments(current));
}

/** The request with the text of every document blanked, those having been compared already. */
function withoutDocuments(request: ValidationReportRequest): ValidationReportRequest {
    return { ...request, formData: "", subForms: request.subForms.map((subForm) => ({ ...subForm, subFormData: "" })) };
}

export interface BuiltValidationRequest {
    request: ValidationReportRequest | null;
    /** Why there is nothing to send, or null when there is. */
    blockedBy: string | null;
}

export function buildValidationRequest(inputs: ValidationRequestInputs): BuiltValidationRequest {
    const withContent = inputs.elements.filter((element) => element.dataType && element.content.trim());
    const kindOf = (element: DataElementInput): "main" | "sub" | "attachment" | null =>
        dataTypeKindOf(inputs.dataTypes, inputs.metadata, element.dataType);

    const form = withContent.find((element) => kindOf(element) === "main");
    if (!form) {
        return {
            request: null,
            // The service validates a submission, and a submission is a form. Sending the subforms
            // on their own would be asking about half of something.
            blockedBy: "The payload has no main form element with content, which is what the report is about."
        };
    }

    const subForms = withContent
        .filter((element) => element !== form && kindOf(element) === "sub")
        .map((element) => ({ formName: element.dataType, subFormData: element.content }));

    /*
     * Everything else counts as an attachment, including an element whose kind the tool cannot
     * place: an app it has not read yet leaves every type unplaced, and an attachment the service
     * does not recognise is a better answer than an attachment it was never told about.
     */
    const attachments = withContent
        .filter((element) => element !== form && kindOf(element) !== "sub")
        .map((element) => ({
            attachmentTypeName: element.dataType,
            filename: element.filename ?? element.exampleName ?? element.dataType,
            fileSize: contentBytes(element)
        }));

    return {
        request: {
            authenticatedSubmitter: submitterFor(inputs.parties, inputs.partyId, inputs.token),
            formData: form.content,
            subForms,
            attachments
        },
        blockedBy: null
    };
}
