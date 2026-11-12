import { altinnFetch, describeFailure } from "./altinnClient.js";
import { appBaseUrl } from "./urls.js";
import { HttpError } from "./httpError.js";

export interface DataTypeAppLogic {
    autoCreate?: boolean;
    classRef?: string;
}

export interface AppDataType {
    id: string;
    allowedContentTypes?: string[] | null;
    minCount?: number;
    maxCount?: number;
    taskId?: string | null;
    appLogic?: DataTypeAppLogic | null;
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

export interface AppParty {
    partyId: number;
    partyUuid?: string;
    name?: string;
    orgNumber?: string | null;
    ssn?: string | null;
    partyTypeName?: number;
    childParties?: AppParty[] | null;
}

export async function fetchApplicationMetadata(token: string, org: string, app: string): Promise<ApplicationMetadata> {
    const url = `${appBaseUrl(org, app)}/api/v1/applicationmetadata`;
    const response = await altinnFetch({ url, token });
    if (!response.ok) {
        throw new HttpError(response.status, `Could not read application metadata for ${org}/${app}: ${describeFailure(response)}`, { url });
    }
    return response.body as ApplicationMetadata;
}

/**
 * Parties the authenticated user is allowed to instantiate on behalf of. Handy for filling in
 * instanceOwnerPartyId without guessing, because an unauthorised party id yields an opaque 403.
 */
export async function fetchInstantiableParties(token: string, org: string, app: string): Promise<AppParty[]> {
    const url = `${appBaseUrl(org, app)}/api/v1/parties?allowedToInstantiateFilter=true`;
    const response = await altinnFetch({ url, token });
    if (!response.ok) {
        throw new HttpError(response.status, `Could not list instantiable parties for ${org}/${app}: ${describeFailure(response)}`, { url });
    }
    return Array.isArray(response.body) ? (response.body as AppParty[]) : [];
}

/**
 * Whether a content type is JSON or XML, which is what form data is posted as.
 *
 * Matched on the subtype rather than by substring, because "xml" is also in the office package types (docx and
 * the like), which are zips. Mirrors isStructuredData in the web workspace.
 */
export function isStructuredData(contentType: string): boolean {
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type === "application/json" || type === "application/xml" || type === "text/xml") return true;
    return type.endsWith("+json") || type.endsWith("+xml");
}

/** Best default content type for a data type: what the app allows, else sniffed from the payload. */
export function resolveContentType(dataType: AppDataType | undefined, content: string): string {
    const allowed = dataType?.allowedContentTypes ?? [];
    const preferred = allowed.find(isStructuredData);
    if (preferred) return preferred;
    if (allowed.length === 1 && allowed[0]) return allowed[0];
    return sniffContentType(content);
}

export function sniffContentType(content: string): string {
    const trimmed = content.trimStart();
    if (trimmed.startsWith("<")) return "application/xml";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "application/json";
    return "text/plain";
}
