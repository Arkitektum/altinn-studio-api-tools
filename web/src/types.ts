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

export type TokenKind = 'test-user' | 'raw';

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
}

export interface AppMetadataResponse {
  baseUrl: string;
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

export type RunMode = 'sequential' | 'multipart' | 'existing';

export interface DataElementInput {
  dataType: string;
  content: string;
  contentType?: string;
  filename?: string;
  /** UI-only: which example file this content came from. Not sent to the server. */
  exampleName?: string;
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

/** A target app the operator has used before, persisted locally for one-click recall. */
export interface SavedApp {
  org: string;
  app: string;
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

export type ExampleKind = 'form' | 'subform';

export interface ExampleFile {
  name: string;
  label: string;
  sizeBytes: number;
}

export interface ExampleGroup {
  dataType: string;
  kind: ExampleKind;
  files: ExampleFile[];
}

export interface ExamplesResponse {
  dir: string;
  groups: ExampleGroup[];
}

export interface ExampleContent {
  content: string;
  sizeBytes: number;
  name: string;
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

export interface ReadInstanceResult {
  ok: boolean;
  steps: RunStep[];
  failedAt: string | null;
  instanceOwnerPartyId: string;
  instanceGuid: string;
  instanceUrl: string;
  instance: unknown;
  dataElements: DataElementSummary[];
}

export interface ReadDataElementResult {
  ok: boolean;
  steps: RunStep[];
  failedAt: string | null;
  dataGuid: string;
  contentType: string | null;
  content: unknown;
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
  rows: { label: string; value: string }[];
  instanceUrl?: string | null;
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

export interface ValidateResult {
  ok: boolean;
  steps: RunStep[];
  failedAt: string | null;
  /** Set when validating a single data element rather than the whole instance. */
  dataGuid: string | null;
  issues: ValidationIssue[];
  counts: ValidationCounts;
}
