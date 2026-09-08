import type {
    AdvanceProcessResult,
    AppMetadataResponse,
    AppParty,
    CatalogueApp,
    ExampleContent,
    ExampleKind,
    ExamplesResponse,
    ListInstancesResult,
    LocaltestStatus,
    PdfPreviewResult,
    PublicToken,
    ReadDataElementResult,
    ReadInstanceResult,
    RunResult,
    ServerConfig,
    ValidateResult
} from "./types";

export class ApiError extends Error {
    readonly status: number;
    readonly issues: { path: string; message: string }[];

    constructor(status: number, message: string, issues: { path: string; message: string }[] = []) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.issues = issues;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            ...init,
            headers: {
                ...(init?.body ? { "content-type": "application/json" } : {}),
                ...init?.headers
            }
        });
    } catch (error) {
        throw new ApiError(
            0,
            `Cannot reach the local API. Is the server running on port 4000? (${error instanceof Error ? error.message : String(error)})`
        );
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch {
            payload = text;
        }
    }

    if (!response.ok) {
        const record = (payload ?? {}) as Record<string, unknown>;
        const message =
            typeof record["error"] === "string"
                ? record["error"]
                : typeof payload === "string" && payload
                  ? payload
                  : `${response.status} ${response.statusText}`;
        const issues = Array.isArray(record["issues"]) ? (record["issues"] as { path: string; message: string }[]) : [];
        throw new ApiError(response.status, message, issues);
    }

    return payload as T;
}

const jsonBody = (value: unknown): RequestInit => ({
    method: "POST",
    body: JSON.stringify(value)
});

export const api = {
    getConfig: () => request<ServerConfig>("/config"),
    getLocaltestStatus: () => request<LocaltestStatus>("/localtest/status"),

    getCatalogue: () => request<CatalogueApp[]>("/catalogue"),
    getExamples: () => request<ExamplesResponse>("/examples"),
    getExampleFile: (params: { kind: ExampleKind; group: string; name: string }) =>
        request<ExampleContent>(`/examples/file?${new URLSearchParams(params)}`),

    listTokens: () => request<PublicToken[]>("/tokens"),
    createTestUserToken: (input: { userId: string; label?: string }) => request<PublicToken>("/tokens/test-user", jsonBody(input)),
    createRawToken: (input: { token: string }) => request<PublicToken>("/tokens/raw", jsonBody(input)),
    deleteToken: (id: string) => request<void>(`/tokens/${id}`, { method: "DELETE" }),

    getAppMetadata: (params: { tokenId: string; org: string; app: string }) =>
        request<AppMetadataResponse>(`/app/metadata?${new URLSearchParams(params)}`),
    getAppParties: (params: { tokenId: string; org: string; app: string }) => request<AppParty[]>(`/app/parties?${new URLSearchParams(params)}`),

    postRun: (input: Record<string, unknown>) => request<RunResult>("/runs", jsonBody(input)),

    listInstances: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string }) =>
        request<ListInstancesResult>(`/instances/active?${new URLSearchParams(params)}`),

    getInstance: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string; instanceGuid: string }) =>
        request<ReadInstanceResult>(`/instances?${new URLSearchParams(params)}`),

    getDataElement: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string; instanceGuid: string; dataGuid: string }) =>
        request<ReadDataElementResult>(`/instances/data-element?${new URLSearchParams(params)}`),

    validateInstance: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string; instanceGuid: string }) =>
        request<ValidateResult>(`/instances/validate?${new URLSearchParams(params)}`),

    validateDataElement: (params: {
        tokenId: string;
        org: string;
        app: string;
        instanceOwnerPartyId: string;
        instanceGuid: string;
        dataGuid: string;
    }) => request<ValidateResult>(`/instances/data-element/validate?${new URLSearchParams(params)}`),
    previewPdf: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string; instanceGuid: string }) =>
        request<PdfPreviewResult>(`/instances/pdf-preview?${new URLSearchParams(params)}`),

    advanceProcess: (params: { tokenId: string; org: string; app: string; instanceOwnerPartyId: string; instanceGuid: string }) =>
        request<AdvanceProcessResult>("/instances/process/next", { method: "PUT", body: JSON.stringify(params) })
};
