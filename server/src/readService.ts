import { altinnFetch, isTextual } from "./altinnClient.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";
import { appBaseUrl, instanceUiUrl } from "./urls.js";

export interface ReadRequest {
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
}

/** One entry of an instance's `data` array, trimmed to what the UI needs to pick one. */
export interface DataElementSummary {
    id: string;
    dataType: string;
    contentType: string | null;
    filename: string | null;
    size: number | null;
    lastChanged: string | null;
}

/** One entry of the party's instance list, trimmed to what the UI needs to pick one. */
export interface InstanceSummary {
    /** "510001/99d0632c-…", as Altinn writes it. */
    id: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    lastChanged: string | null;
    /** Name of whoever last touched it, which is what Altinn's own list shows. */
    lastChangedBy: string | null;
}

export interface ListInstancesResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instances: InstanceSummary[];
}

export interface ReadInstanceResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    instanceUrl: string;
    instance: unknown;
    /** Data elements on the instance, for choosing which one to fetch next. */
    dataElements: DataElementSummary[];
}

export interface ReadDataElementResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    dataGuid: string;
    contentType: string | null;
    /** utf8 for text formats, base64 for a stored binary file. */
    encoding: "utf8" | "base64";
    /** Text for XML and JSON, base64 for anything binary. */
    content: string | null;
}

export interface PdfPreviewResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    contentType: string | null;
    /** The pdf bytes, base64 encoded because the rest of the api is json. */
    content: string | null;
    /** Decoded byte count, so the ui can show a size without decoding first. */
    size: number;
}

/** One entry of Altinn's validation response. */
export interface ValidationIssue {
    severity: number;
    code: string | null;
    description: string | null;
    field: string | null;
    dataElementId: string | null;
    source: string | null;
}

export interface ValidationCounts {
    errors: number;
    warnings: number;
    other: number;
}

export interface ValidateResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    /** The instance that was validated. Results are only meaningful for this instance. */
    instanceGuid: string;
    /** Set when validating a single data element rather than the whole instance. */
    dataGuid: string | null;
    issues: ValidationIssue[];
    counts: ValidationCounts;
}

/** Altinn's ValidationIssueSeverity. */
const SEVERITY_LABELS: Record<number, string> = {
    1: "error",
    2: "warning",
    3: "info",
    4: "fixed",
    5: "success"
};

export function severityLabel(severity: number): string {
    return SEVERITY_LABELS[severity] ?? `severity ${severity}`;
}

function toSummary(value: unknown): DataElementSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record["id"] !== "string") return null;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        id: record["id"],
        dataType: asString("dataType") ?? "unknown",
        contentType: asString("contentType"),
        filename: asString("filename"),
        size: typeof record["size"] === "number" ? record["size"] : null,
        lastChanged: asString("lastChanged")
    };
}

function toInstanceSummary(value: unknown, fallbackPartyId: string): InstanceSummary | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const id = record["id"];
    if (typeof id !== "string" || !id.trim()) return null;
    // Instance ids read "510001/99d0632c-…". A bare guid is accepted too, in which case the party
    // is the one we asked about.
    const [first, second] = id.split("/");
    const guid = second ?? first ?? "";
    if (!guid) return null;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        id,
        instanceOwnerPartyId: second ? (first ?? fallbackPartyId) : fallbackPartyId,
        instanceGuid: guid,
        lastChanged: asString("lastChanged"),
        lastChangedBy: asString("lastChangedBy")
    };
}

/**
 * GET {app}/instances/{party}/active
 *
 * The app's own list endpoint, the one its frontend uses to offer an unfinished form back to the
 * user. It answers with the party's instances whose process has not ended, so an archived
 * instance is not in the list.
 */
export async function listInstances(
    token: string,
    request: { org: string; app: string; instanceOwnerPartyId: string }
): Promise<ListInstancesResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/active`;

    const response = await recorder.run("List active instances", "GET", url, () => altinnFetch({ url, token }));

    // The app answers with a bare array. Storage-style `{ instances: [...] }` is accepted too, so
    // pointing this at another endpoint still yields a list rather than nothing.
    const body = response.ok ? response.body : null;
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { instances?: unknown } | null)?.instances)
          ? (body as { instances: unknown[] }).instances
          : [];
    const instances = rows
        .map((row) => toInstanceSummary(row, request.instanceOwnerPartyId))
        .filter((instance): instance is InstanceSummary => instance !== null)
        // Newest first, which is nearly always the one you just made.
        .sort((a, b) => (b.lastChanged ?? "").localeCompare(a.lastChanged ?? ""));

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not list the instances for this party.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instances
    };
}

/** GET {app}/instances/{party}/{guid} */
export async function readInstance(token: string, request: ReadRequest): Promise<ReadInstanceResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}`;

    const response = await recorder.run("Get instance", "GET", url, () => altinnFetch({ url, token }));

    const instance = response.ok ? response.body : null;
    const rawData = instance && typeof instance === "object" ? (instance as Record<string, unknown>)["data"] : undefined;
    const dataElements = Array.isArray(rawData) ? rawData.map(toSummary).filter((element): element is DataElementSummary => element !== null) : [];

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not read the instance.",
        instanceOwnerPartyId: request.instanceOwnerPartyId,
        instanceGuid: request.instanceGuid,
        instanceUrl: instanceUiUrl(request.org, request.app, request.instanceOwnerPartyId, request.instanceGuid),
        instance,
        dataElements
    };
}

/** GET {app}/instances/{party}/{guid}/data/{dataGuid} */
export async function readDataElement(token: string, request: ReadRequest & { dataGuid: string }): Promise<ReadDataElementResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/data/${request.dataGuid}`;

    // Data elements are stored in whatever type the app used, commonly XML, so do not ask for
    // JSON. Read the bytes rather than text, because an attachment is not necessarily text.
    const response = await recorder.run("Get data element", "GET", url, () => altinnFetch({ url, token, accept: "*/*", binaryResponse: true }));

    const textual = isTextual(response.contentType);
    const bytes = response.bytes;

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not read the data element.",
        dataGuid: request.dataGuid,
        contentType: response.contentType,
        encoding: textual ? "utf8" : "base64",
        content: response.ok && bytes ? bytes.toString(textual ? "utf8" : "base64") : null
    };
}

/**
 * GET {app}/instances/{party}/{guid}/pdf/preview
 *
 * The app renders the receipt pdf it would archive, which is the quickest way to see what the
 * form data turns into without walking the process to the end.
 */
export async function previewPdf(token: string, request: ReadRequest): Promise<PdfPreviewResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/pdf/preview`;

    const response = await recorder.run("Preview pdf", "GET", url, () =>
        altinnFetch({ url, token, accept: "application/pdf", binaryResponse: true })
    );

    const bytes = response.ok ? response.bytes : null;
    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not render the pdf preview.",
        contentType: response.contentType,
        content: bytes ? bytes.toString("base64") : null,
        size: bytes?.byteLength ?? 0
    };
}

function toIssue(value: unknown): ValidationIssue | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const asString = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
    return {
        severity: typeof record["severity"] === "number" ? record["severity"] : 0,
        code: asString("code"),
        description: asString("description"),
        field: asString("field"),
        dataElementId: asString("dataElementId"),
        source: asString("source")
    };
}

/** Altinn answers with an array of issues, empty when everything passes. */
function summariseIssues(body: unknown): { issues: ValidationIssue[]; counts: ValidationCounts } {
    const issues = Array.isArray(body) ? body.map(toIssue).filter((issue): issue is ValidationIssue => issue !== null) : [];
    return {
        issues,
        counts: {
            errors: issues.filter((issue) => issue.severity === 1).length,
            warnings: issues.filter((issue) => issue.severity === 2).length,
            other: issues.filter((issue) => issue.severity !== 1 && issue.severity !== 2).length
        }
    };
}

/** GET {app}/instances/{party}/{guid}/validate */
export async function validateInstance(token: string, request: ReadRequest): Promise<ValidateResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}/validate`;

    const response = await recorder.run("Validate instance", "GET", url, () => altinnFetch({ url, token }));

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not validate the instance.",
        instanceGuid: request.instanceGuid,
        dataGuid: null,
        ...summariseIssues(response.ok ? response.body : null)
    };
}

/** GET {app}/instances/{party}/{guid}/data/{dataGuid}/validate */
export async function validateDataElement(token: string, request: ReadRequest & { dataGuid: string }): Promise<ValidateResult> {
    const recorder = new StepRecorder();
    const url = `${appBaseUrl(request.org, request.app)}/instances/${
        request.instanceOwnerPartyId
    }/${request.instanceGuid}/data/${request.dataGuid}/validate`;

    const response = await recorder.run("Validate data element", "GET", url, () => altinnFetch({ url, token }));

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "Could not validate the data element.",
        instanceGuid: request.instanceGuid,
        dataGuid: request.dataGuid,
        ...summariseIssues(response.ok ? response.body : null)
    };
}
