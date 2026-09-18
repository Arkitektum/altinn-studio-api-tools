import type { PrevalidationSummary } from "./chain";
import type { AppDataType } from "../types";

/**
 * Reading the DIBK validation report for what a submission is missing.
 *
 * The report is the answer to a question `applicationmetadata` cannot answer: a `minCount` is what
 * the app declares, and it is not what the validation insists on. The service is told the form and
 * gives back one message per rule it has something to say about, with the rules about documents
 * naming the document.
 *
 * Two things make that name findable. A rule about a document has `Vedlegg` in its reference path,
 * `Ettrinn.Vedlegg.Situasjonsplan`, and the last segment is the attachment type. Where a rule
 * accepts alternatives it quotes them in the message text, so the names are read out of the prose
 * as well: "Minst én tegning med en av vedleggstypene ‘TegningNyttSnitt’, ‘TegningNyPlan’ …".
 *
 * Everything else the report says is about what is inside the form, which is not a payload element
 * and is left to the run log. That split is the whole of what this module decides.
 */

export type ReportSeverity = "error" | "warning";

export interface ReportMessage {
    rule: string;
    reference: string;
    message: string;
    severity: ReportSeverity;
    /** Where in the form, when the rule points at a field. */
    xpathField: string | null;
    /** The national checklist point, when the rule cites one. */
    checklistReference: string | null;
}

export interface ValidationReport {
    /** What kind of submission the service read it as, `ET` and so on. Empty when it did not say. */
    soknadtype: string;
    errors: number;
    warnings: number;
    messages: ReportMessage[];
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function optional(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

/**
 * The report as this tool needs it, or null when the answer was not one.
 *
 * Read defensively, since this is an external service and the only thing the tool cannot stub: a
 * report missing a field it was expected to have loses that field rather than the whole document.
 * An unknown severity counts as the milder one, because overstating what is required is the worse
 * mistake and the report itself is in the run log either way.
 */
export function parseValidationReport(raw: unknown): ValidationReport | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.messages)) return null;

    const messages: ReportMessage[] = record.messages
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
            rule: text(entry.rule),
            reference: text(entry.reference),
            message: text(entry.message),
            severity: text(entry.messagetype).toUpperCase() === "ERROR" ? ("error" as const) : ("warning" as const),
            xpathField: optional(entry.xpathField),
            checklistReference: optional(entry.checklistReference)
        }));

    const count = (key: string, severity: ReportSeverity): number =>
        typeof record[key] === "number" ? (record[key] as number) : messages.filter((message) => message.severity === severity).length;

    return {
        soknadtype: text(record.soknadtype),
        errors: count("errors", "error"),
        warnings: count("warnings", "warning"),
        messages
    };
}

/** Names quoted in the prose. Attachment types are one word in caps, the surrounding Norwegian is not. */
const QUOTED_TYPE = /['‘’"“”]([A-Z][A-Za-z0-9]{2,})['‘’"“”]/g;

/** Whether the rule is about a document at all, rather than about a field inside the form. */
export function isDocumentMessage(message: ReportMessage): boolean {
    const inReference = message.reference.split(".").some((segment) => segment.toLowerCase() === "vedlegg");
    return inReference || /vedlegg/i.test(message.xpathField ?? "");
}

/**
 * The attachment types that would answer the rule, best guess first.
 *
 * The quoted ones lead because a rule that accepts alternatives spells them out, and its own name
 * is then a heading rather than a type: `SnittPlanFasadeTegninger` is not something to attach, the
 * six drawings it lists are. For every other rule the name is the type and the quotes agree.
 */
export function documentNames(message: ReportMessage): string[] {
    const names = [...message.message.matchAll(QUOTED_TYPE)].map((match) => match[1] as string);
    names.push(message.reference.split(".").pop() ?? "", message.rule);
    return [...new Set(names.filter(Boolean))];
}

export interface DocumentRequirement {
    severity: ReportSeverity;
    /** Types that would answer it, more than one when the rule accepts alternatives. */
    dataTypes: string[];
    /** Whether the app declares any of them, which is what lets the tool add the element itself. */
    known: boolean;
    /** Already in the payload, or on the instance. */
    satisfied: boolean;
    rule: string;
    message: string;
    checklistReference: string | null;
}

export interface ReportRequirements {
    soknadtype: string;
    /** Documents the report calls errors, so the submission is not complete without them. */
    required: DocumentRequirement[];
    /** The ones it only recommends. */
    recommended: DocumentRequirement[];
    /**
     * Messages about the form's own content, which no payload element answers.
     *
     * Kept whole rather than counted. They were two numbers, on the grounds that the panel can do
     * nothing about them, but an error is worth reading whether or not the tool can act on it: a
     * submission with every document attached and an empty address field is still a submission that
     * would be refused, and "and one thing about the form's own content" does not say which.
     */
    other: ReportMessage[];
}

/** The findings about the form itself, of one severity. */
export function contentIssues(requirements: ReportRequirements, severity: ReportSeverity): ReportMessage[] {
    return requirements.other.filter((message) => message.severity === severity);
}

export interface RequirementInputs {
    /** From applicationmetadata, for turning a name in the report into a type you can select. */
    dataTypes: AppDataType[];
    /** Data types in the payload as it stands. */
    payload: string[];
    /** And the ones the selected instance already holds. */
    onInstance: string[];
}

function requirementFrom(message: ReportMessage, inputs: RequirementInputs): DocumentRequirement {
    const names = documentNames(message);

    // Matched case-insensitively but reported in the app's own spelling, since that is the string
    // the picker and the post use.
    const declared = new Map(inputs.dataTypes.map((type) => [type.id.toLowerCase(), type.id]));
    const matched = names.map((name) => declared.get(name.toLowerCase())).filter((id): id is string => Boolean(id));

    // An unmatched name is still worth naming: an app the tool has not probed declares nothing yet,
    // and a document the service wants that this app has no type for is a finding of its own.
    const dataTypes = matched.length > 0 ? [...new Set(matched)] : names;
    const held = new Set([...inputs.payload, ...inputs.onInstance].map((id) => id.toLowerCase()));

    return {
        severity: message.severity,
        dataTypes,
        known: matched.length > 0,
        satisfied: dataTypes.some((id) => held.has(id.toLowerCase())),
        rule: message.rule,
        message: message.message,
        checklistReference: message.checklistReference
    };
}

/**
 * What the report asks for, split into what it requires and what it recommends.
 *
 * Two rules can land on the same document, so the list is deduplicated by the types that would
 * answer it. Severity is part of that key: a drawing that is required by one rule and recommended
 * by another is required, and saying both would be saying it twice.
 */
export function requirementsFrom(report: ValidationReport | null, inputs: RequirementInputs): ReportRequirements {
    const empty: ReportRequirements = { soknadtype: "", required: [], recommended: [], other: [] };
    if (!report) return empty;

    const documents = new Map<string, DocumentRequirement>();
    const other: ReportMessage[] = [];

    for (const message of report.messages) {
        if (!isDocumentMessage(message)) {
            other.push(message);
            continue;
        }
        const requirement = requirementFrom(message, inputs);
        const key = requirement.dataTypes.join("|").toLowerCase();
        const seen = documents.get(key);
        // An error outranks a warning about the same document, and otherwise the first stands.
        if (!seen) documents.set(key, requirement);
        else if (seen.severity === "warning" && requirement.severity === "error") documents.set(key, requirement);
    }

    const all = [...documents.values()];
    return {
        soknadtype: report.soknadtype,
        required: all.filter((requirement) => requirement.severity === "error"),
        recommended: all.filter((requirement) => requirement.severity === "warning"),
        other
    };
}

/** The last report and whether the payload has moved on since. Null until it has been asked for. */
export interface Prevalidation {
    requirements: ReportRequirements;
    stale: boolean;
}

/** Required documents the payload still does not have. */
export function outstandingOf(requirements: ReportRequirements): DocumentRequirement[] {
    return requirements.required.filter((requirement) => !requirement.satisfied);
}

/**
 * The report boiled down to what the rail says, and the post panel with it.
 *
 * Everything the report found, not only the documents. The panel splits them up because each part
 * is acted on differently: the missing documents can be added from there, the recommended ones are
 * a line to read, and what the rules say about the form's own content is counted and left to the
 * run log. The rail has one row, and a row that went red for missing documents while staying quiet
 * about four errors in the form would be answering a narrower question than the one it looks like
 * it is answering.
 *
 * A requirement that is already satisfied is not counted. It was found once and has been answered,
 * and the row is about where the submission stands now.
 */
export function summarisePrevalidation(prevalidation: Prevalidation | null): PrevalidationSummary {
    if (!prevalidation) return { run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 };

    const { requirements, stale } = prevalidation;
    const outstanding = outstandingOf(requirements).length;
    const advised = requirements.recommended.filter((requirement) => !requirement.satisfied).length;

    return {
        run: true,
        stale,
        outstanding,
        errors: outstanding + contentIssues(requirements, "error").length,
        warnings: advised + contentIssues(requirements, "warning").length
    };
}

/**
 * The data types to append, one per document that is required and not here yet.
 *
 * Only the ones the app declares, since the tool cannot select a type the app does not have, and
 * the first alternative where a rule accepts several: it is the one the message recommends, and the
 * element's own picker is right there to change it to another.
 */
export function documentsToAdd(required: DocumentRequirement[]): string[] {
    const wanted = required
        .filter((requirement) => requirement.known && !requirement.satisfied)
        .map((requirement) => requirement.dataTypes[0] as string);
    return [...new Set(wanted)];
}
