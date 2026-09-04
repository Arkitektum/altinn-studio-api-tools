import { describeFailure, type AltinnResponse } from './altinnClient.js';

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

/**
 * Records each Altinn call as a step so the UI can show what happened, in order, with timings
 * and both bodies. Shared by the posting and the reading flows.
 */
export class StepRecorder {
  readonly steps: RunStep[] = [];

  async run(
    name: string,
    method: string,
    url: string,
    call: () => Promise<AltinnResponse>,
    requestPreview?: string,
  ): Promise<AltinnResponse> {
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
      response: response.body,
    };
    if (requestPreview !== undefined) step.requestPreview = requestPreview;
    if (!response.ok) step.error = describeFailure(response);
    this.steps.push(step);
    return response;
  }

  /** Record something that did not result in a request, such as a skipped or invalid step. */
  note(name: string, error: string, durationMs = 0): void {
    this.steps.push({
      index: this.steps.length + 1,
      name,
      method: '-',
      url: '-',
      status: null,
      ok: false,
      durationMs,
      error,
    });
  }
}
