import { describeFailure, type AltinnResponse } from "./altinnClient.js";

export interface RunStep {
    index: number;
    name: string;
    method: string;
    url: string;
    status: number | null;
    ok: boolean;
    durationMs: number;
    requestPreview?: string;
    /** Headers the request went out with, token replaced. Absent on a step that made no request. */
    requestHeaders?: Record<string, string>;
    /**
     * Whether requestPreview is the exact body that was sent. False for a summary, such as the
     * byte count that stands in for base64 content, which cannot be replayed as written.
     */
    requestVerbatim?: boolean;
    response?: unknown;
    error?: string;
}

/** What was sent, for the step log. */
export interface RequestRecord {
    /** The body, or a summary of it when the body would be unreadable. */
    preview?: string;
    /** Whether the preview is the exact body. Defaults to true, since most previews are. */
    verbatim?: boolean;
}

/**
 * Records each Altinn call as a step so the UI can show what happened, in order, with timings
 * and both bodies. Shared by the posting and the reading flows.
 */
export class StepRecorder {
    readonly steps: RunStep[] = [];

    async run(name: string, method: string, url: string, call: () => Promise<AltinnResponse>, request?: RequestRecord): Promise<AltinnResponse> {
        const startedAt = performance.now();
        const response = await call();
        const step: RunStep = {
            index: this.steps.length + 1,
            name,
            method,
            url,
            status: response.status,
            ok: response.ok,
            durationMs: Math.round(performance.now() - startedAt),
            requestHeaders: response.requestHeaders,
            response: response.body
        };
        if (request?.preview !== undefined) {
            step.requestPreview = request.preview;
            step.requestVerbatim = request.verbatim ?? true;
        }
        if (!response.ok) step.error = describeFailure(response);
        this.steps.push(step);
        return response;
    }

    /** Record something that did not result in a request, such as a skipped or invalid step. */
    note(name: string, error: string, durationMs = 0): void {
        this.steps.push({
            index: this.steps.length + 1,
            name,
            method: "-",
            url: "-",
            status: null,
            ok: false,
            durationMs,
            error
        });
    }
}
