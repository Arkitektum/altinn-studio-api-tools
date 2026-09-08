export interface ServerConfig {
    /** Where the local Altinn apps are served, e.g. http://local.altinn.cloud:8000 */
    appHost: string;
    /** The LocalTest project, e.g. http://localhost:5101 */
    localtestUrl: string;
    /** Directory the example form data is read from. */
    exampleDataDir: string;
}

export interface LocaltestStatus {
    reachable: boolean;
    status: number | null;
    url: string;
    error?: string;
}

export type TokenKind = "test-user" | "raw";

export interface PublicToken {
    id: string;
    kind: TokenKind;
    label: string;
    claims: Record<string, unknown>;
    scopes: string[];
    issuedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    partyId: string | null;
    userId: string | null;
}

export interface AppDataType {
    id: string;
    allowedContentTypes?: string[] | null;
    minCount?: number;
    maxCount?: number;
    taskId?: string | null;
    appLogic?: { autoCreate?: boolean; classRef?: string } | null;
}

export interface ApplicationMetadata {
    id: string;
    org: string;
    title?: Record<string, string>;
    dataTypes?: AppDataType[];
    /** Data type id of the app's main form. Declared by the DIBK apps. */
    mainFormDataType?: string;
    /**
     * Subform data types. Entries are ids, but older apps write objects, so this stays loose and
     * is normalised on read.
     */
    subFormDataTypes?: unknown[];
}

export interface AppMetadataResponse {
    /** Link to the app frontend, for the Open app button. */
    appUrl: string;
    metadata: ApplicationMetadata;
}

export interface AppParty {
    partyId: number;
    partyUuid?: string;
    name?: string;
    orgNumber?: string | null;
    ssn?: string | null;
    partyTypeName?: number;
    childParties?: AppParty[] | null;
}

export type RunMode = "sequential" | "multipart" | "existing";

export interface DataElementInput {
    dataType: string;
    content: string;
    /** base64 means the content is encoded and the server decodes it before posting. */
    encoding?: ExampleEncoding;
    contentType?: string;
    filename?: string;
    /**
     * UI-only: where this content came from, an example file or an instance it was read back
     * from. Reads after "from" in the editor hint. Not sent to the server.
     */
    exampleName?: string;
    /** UI-only: collapsed in the payload list. Not sent to the server. */
    collapsed?: boolean;
}

export interface RunStep {
    index: number;
    name: string;
    method: string;
    url: string;
    status: number | null;
    ok: boolean;
    durationMs: number;
    requestPreview?: string;
    /** Headers the request went out with. The token is a `$TOKEN` placeholder, never the real one. */
    requestHeaders?: Record<string, string>;
    /** Whether requestPreview is the exact body sent, so it can be replayed as written. */
    requestVerbatim?: boolean;
    response?: unknown;
    error?: string;
}

export interface RunResult {
    ok: boolean;
    mode: RunMode;
    steps: RunStep[];
    instanceOwnerPartyId: string | null;
    instanceGuid: string | null;
    instanceUrl: string | null;
    instance: unknown;
    failedAt: string | null;
}

// ---------------------------------------------------------------- catalogue & examples

export interface CatalogueSubform {
    org: string;
    app: string;
    dataType: string;
}

export interface CatalogueApp {
    org: string;
    app: string;
    dataType: string;
    subForms: CatalogueSubform[];
}

export type ExampleKind = "form" | "subform" | "attachment";

export type ExampleEncoding = "utf8" | "base64";

export interface ExampleFile {
    name: string;
    label: string;
    sizeBytes: number;
    contentType: string;
    encoding: ExampleEncoding;
}

export interface ExampleGroup {
    kind: ExampleKind;
    /** Data type id for forms and subforms. Content type for attachments. */
    key: string;
    files: ExampleFile[];
}

export interface ExamplesResponse {
    dir: string;
    groups: ExampleGroup[];
}

export interface ExampleContent {
    name: string;
    content: string;
    encoding: ExampleEncoding;
    contentType: string;
    sizeBytes: number;
}

// ---------------------------------------------------------------- reading

export interface DataElementSummary {
    id: string;
    dataType: string;
    contentType: string | null;
    filename: string | null;
    size: number | null;
    lastChanged: string | null;
}

/** One entry of the party's instance list, as offered in the instance picker. */
export interface InstanceSummary {
    /** "510001/99d0632c-…", as Altinn writes it. */
    id: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    lastChanged: string | null;
    lastChangedBy: string | null;
}

export interface ListInstancesResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instances: InstanceSummary[];
}

/** Where an instance stands in its process. */
export interface ProcessSummary {
    /** Element id of the task the instance sits in. Null once the process has ended. */
    currentTask: string | null;
    /** Altinn's task type: data, confirmation, feedback, signing, payment. */
    taskType: string | null;
    started: string | null;
    ended: string | null;
    endEvent: string | null;
}

export interface ReadInstanceResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    instanceUrl: string;
    instance: unknown;
    dataElements: DataElementSummary[];
    process: ProcessSummary | null;
}

export interface AdvanceProcessResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    process: ProcessSummary | null;
}

export interface ReadDataElementResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    dataGuid: string;
    contentType: string | null;
    /** utf8 for text formats, base64 for a stored binary file. */
    encoding: ExampleEncoding;
    content: string | null;
}

/**
 * The data element last read back, held so it can be downloaded or copied. The log shows it too,
 * but as text in a `pre`, which is not something you can get a file out of.
 */
export interface FetchedDataElement {
    dataGuid: string;
    dataType: string;
    /** What a download would be called. */
    filename: string;
    contentType: string | null;
    encoding: ExampleEncoding;
    content: string;
    /** Decoded byte count, so the panel can show a size without decoding again. */
    size: number;
}

/** A validation issue, ready to render. Ids are resolved to names before it gets here. */
export interface LogIssue {
    severity: number;
    severityLabel: string;
    description: string;
    code: string | null;
    field: string | null;
    /** Data type name where the id could be resolved, otherwise the raw id. */
    dataElement: string | null;
    source: string | null;
}

/**
 * What the run log renders. Both the posting and the reading flows build one of these, so the
 * log does not need to know which produced it.
 */
export interface LogResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    /** Heading shown when the request succeeded. */
    title: string;
    rows: { label: string; value: string; tone?: "ok" | "warn" | "bad" }[];
    instanceUrl?: string | null;
    /**
     * Present when the run included a validation, even when it found nothing. Absent means no
     * validation ran, which is what keeps earlier results on screen.
     */
    validation?: ValidationResult;
}

/** One validation, identified so that re-validating the same target replaces it. */
export interface ValidationResult {
    /** "instance", or "data:{guid}". One result is kept per key. */
    key: string;
    /** The instance these issues belong to. Changing instance drops results from the old one. */
    instanceGuid: string;
    scope: "instance" | "data element";
    /** Data type name where known, otherwise the guid. */
    label: string;
    issues: LogIssue[];
}

/** A validation result as shown in the panel, with the run it came from. */
export interface ValidationView extends ValidationResult {
    /** Time the run finished. */
    at: string;
    /** Id of the run, used to reset the fold state when the same target is validated again. */
    runId: string;
}

/** One entry in the run history. */
export interface LogEntry {
    id: string;
    /** Wall clock time the run finished, for the history header. */
    at: string;
    result: LogResult;
}

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

export interface PdfPreviewResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    contentType: string | null;
    /** The pdf bytes, base64 encoded because the rest of the api is json. */
    content: string | null;
    size: number;
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
