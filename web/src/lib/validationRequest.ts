import { dataTypeKindOf } from "./dataTypeGroups";
import type { AppDataType, AppParty, ApplicationMetadata, DataElementInput, ValidationReportRequest } from "../types";

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
 * The organisation number of the party being submitted for, or the person number when it is a
 * person. Empty when the app has not been read for its parties and nothing else knows.
 */
export function submitterFor(parties: AppParty[], partyId: string, ssn: string | null): string {
    const flat = parties.flatMap((party) => [party, ...(party.childParties ?? [])]);
    const party = flat.find((entry) => String(entry.partyId) === partyId);
    return party?.orgNumber ?? party?.ssn ?? ssn ?? "";
}

export interface ValidationRequestInputs {
    elements: DataElementInput[];
    dataTypes: AppDataType[];
    metadata: ApplicationMetadata | null;
    parties: AppParty[];
    partyId: string;
    /** The person number the token panel looked up, for a party that is a person. */
    ssn: string | null;
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
            authenticatedSubmitter: submitterFor(inputs.parties, inputs.partyId, inputs.ssn),
            formData: form.content,
            subForms,
            attachments
        },
        blockedBy: null
    };
}
