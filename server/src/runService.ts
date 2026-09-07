import { altinnFetch, describeFailure } from './altinnClient.js';
import { StepRecorder, type RunStep } from './stepRecorder.js';
import { buildMultipart, type MultipartPart } from './multipart.js';
import { appBaseUrl, instanceUiUrl } from './urls.js';
import {
  fetchApplicationMetadata,
  resolveContentType,
  sniffContentType,
  type AppDataType,
  type ApplicationMetadata,
} from './appService.js';

export type { RunStep };

/**
 * - `sequential` POST /instances, then upsert each data element one request at a time.
 * - `multipart`  a single POST /instances carrying the instance plus one part per data type.
 * - `existing`   skip creation and post the data elements onto an instance that already exists.
 */
export type RunMode = 'sequential' | 'multipart' | 'existing';

export interface DataElementInput {
  dataType: string;
  content: string;
  /** base64 means `content` is encoded and must be decoded before it goes to Altinn. */
  encoding?: 'utf8' | 'base64';
  contentType?: string;
  /** Set for binary data types. Altinn stores it as the data element filename. */
  filename?: string;
}

export interface RunRequest {
  org: string;
  app: string;
  instanceOwnerPartyId: string;
  dataElements: DataElementInput[];
  mode?: RunMode;
  /** Required for `existing` mode, ignored otherwise. */
  instanceGuid?: string;
  /** Extra fields merged into the instance template, e.g. dueBefore or visibleAfter. */
  instanceTemplate?: Record<string, unknown>;
  /** Run the app's validation endpoint after upload and report the issues. */
  validate?: boolean;
  /** Move the process to the next task/step after upload (submits the form). */
  advanceProcess?: boolean;
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

interface InstanceDataElement {
  id: string;
  dataType: string;
  contentType?: string;
  filename?: string | null;
}

interface Instance {
  id?: string;
  instanceOwner?: { partyId?: string };
  data?: InstanceDataElement[];
  process?: unknown;
}

const PREVIEW_LIMIT = 4_000;

/** Bytes for the wire. Base64 content is decoded here and nowhere else. */
function bodyOf(element: DataElementInput): string | Buffer {
  return element.encoding === 'base64' ? Buffer.from(element.content, 'base64') : element.content;
}

function preview(element: DataElementInput): string {
  if (element.encoding === 'base64') {
    // Dumping base64 into the log would bury the useful part of it.
    return `[${Buffer.from(element.content, 'base64').length} bytes, base64 encoded]`;
  }
  const { content } = element;
  return content.length > PREVIEW_LIMIT ? `${content.slice(0, PREVIEW_LIMIT)}…[truncated]` : content;
}

/** Instance ids look like "510001/99d0632c-...". Split into party id and guid. */
function splitInstanceId(instance: Instance): { partyId: string | null; guid: string | null } {
  const id = instance.id;
  if (typeof id === 'string' && id.includes('/')) {
    const [partyId, guid] = id.split('/');
    return { partyId: partyId ?? null, guid: guid ?? null };
  }
  return { partyId: instance.instanceOwner?.partyId ?? null, guid: null };
}

/** Posts test data to a locally running Altinn app and returns a step-by-step log. */
export async function postDataToApp(token: string, request: RunRequest): Promise<RunResult> {
  const mode: RunMode = request.mode ?? 'sequential';
  const recorder = new StepRecorder();
  const base = appBaseUrl(request.org, request.app);
  const context = { org: request.org, app: request.app };

  // ---- application metadata (advisory: improves content types and upsert decisions)
  let dataTypesById = new Map<string, AppDataType>();
  const metadataStartedAt = performance.now();
  try {
    const metadata: ApplicationMetadata = await fetchApplicationMetadata(
      token,
      request.org,
      request.app,
    );
    dataTypesById = new Map((metadata.dataTypes ?? []).map((type) => [type.id, type]));
    recorder.steps.push({
      index: 1,
      name: 'Read application metadata',
      method: 'GET',
      url: `${base}/api/v1/applicationmetadata`,
      status: 200,
      ok: true,
      durationMs: Math.round(performance.now() - metadataStartedAt),
      response: { dataTypes: [...dataTypesById.keys()] },
    });
  } catch (error) {
    recorder.note(
      'Read application metadata',
      `Skipped: ${error instanceof Error ? error.message : String(error)}`,
      Math.round(performance.now() - metadataStartedAt),
    );
  }

  const unknownDataTypes = request.dataElements
    .map((element) => element.dataType)
    .filter((id) => dataTypesById.size > 0 && !dataTypesById.has(id));
  if (unknownDataTypes.length > 0) {
    return failed(
      recorder,
      mode,
      `Unknown data type(s) for ${request.org}/${request.app}: ${unknownDataTypes.join(', ')}. ` +
        `Known: ${[...dataTypesById.keys()].join(', ') || 'none'}`,
    );
  }

  let instance: Instance | null = null;

  // ---- get hold of an instance, either by creating one or by loading the existing one
  if (mode === 'existing') {
    if (!request.instanceGuid) {
      return failed(recorder, mode, 'An instanceGuid is required when posting to an existing instance.');
    }
    const url = `${base}/instances/${request.instanceOwnerPartyId}/${request.instanceGuid}`;
    const response = await recorder.run('Read existing instance', 'GET', url, () =>
      altinnFetch({ url, token }),
    );
    if (!response.ok) {
      return failed(recorder, mode, 'Could not read the existing instance.');
    }
    instance = response.body as Instance;
  } else if (mode === 'multipart') {
    const instanceTemplate = {
      instanceOwner: { partyId: String(request.instanceOwnerPartyId) },
      ...request.instanceTemplate,
    };
    const parts: MultipartPart[] = [
      {
        name: 'instance',
        content: JSON.stringify(instanceTemplate),
        contentType: 'application/json',
      },
      ...request.dataElements.map((element) => ({
        name: element.dataType,
        content: bodyOf(element),
        contentType:
          element.contentType ??
          resolveContentType(dataTypesById.get(element.dataType), element.content),
        ...(element.filename ? { filename: element.filename } : {}),
      })),
    ];
    const { body: multipartBody, contentType: multipartContentType } = buildMultipart(parts);

    const url = `${base}/instances`;
    const response = await recorder.run(
      `Instantiate with ${request.dataElements.length} data element(s)`,
      'POST',
      url,
      () =>
        altinnFetch({
          url,
          method: 'POST',
          token,
          body: multipartBody,
          contentType: multipartContentType,
        }),
      `${JSON.stringify(instanceTemplate, null, 2)}\n\nparts: ${parts
        .map((part) => `${part.name} (${part.contentType}, ${part.content.length} bytes)`)
        .join(', ')}`,
    );
    if (!response.ok) {
      return failed(recorder, mode, 'Multipart instantiation failed.');
    }
    instance = response.body as Instance;
  } else {
    const hasTemplate =
      request.instanceTemplate && Object.keys(request.instanceTemplate).length > 0;
    // With a template we must send it as the body, because the query string form only carries
    // the party.
    const body = hasTemplate
      ? JSON.stringify({
          instanceOwner: { partyId: String(request.instanceOwnerPartyId) },
          ...request.instanceTemplate,
        })
      : undefined;
    const url = hasTemplate
      ? `${base}/instances`
      : `${base}/instances?instanceOwnerPartyId=${encodeURIComponent(request.instanceOwnerPartyId)}`;

    const response = await recorder.run(
      'Create instance',
      'POST',
      url,
      () =>
        altinnFetch({
          url,
          method: 'POST',
          token,
          body,
          contentType: body ? 'application/json' : undefined,
        }),
      body,
    );
    if (!response.ok) {
      return failed(recorder, mode, 'Instance creation failed.');
    }
    instance = response.body as Instance;
  }

  const located = splitInstanceId(instance);
  const partyId = located.partyId ?? request.instanceOwnerPartyId;
  const guid = located.guid ?? request.instanceGuid ?? null;

  if (!guid) {
    return failed(recorder, mode, 'Altinn returned an instance without a usable id.');
  }

  const at = { ...context, partyId, guid, instance };

  // ---- upload data elements (multipart already carried them)
  if (mode !== 'multipart') {
    for (const element of request.dataElements) {
      const dataType = dataTypesById.get(element.dataType);
      const contentType = element.contentType ?? resolveContentType(dataType, element.content);
      // Altinn auto-creates a data element for form data types (maxCount 1 + appLogic), so a
      // second POST would fail on max-count. Replace the existing element instead.
      const existing = (instance.data ?? []).find((d) => d.dataType === element.dataType);
      const replacing = existing && dataType?.maxCount === 1 ? existing : null;

      const headers: Record<string, string> = {};
      if (element.filename) {
        headers['content-disposition'] =
          `attachment; filename="${element.filename.replace(/"/g, '')}"`;
      }

      const dataUrl = replacing
        ? `${base}/instances/${partyId}/${guid}/data/${replacing.id}`
        : `${base}/instances/${partyId}/${guid}/data?dataType=${encodeURIComponent(element.dataType)}`;

      const dataResponse = await recorder.run(
        `${replacing ? 'Replace' : 'Add'} data element "${element.dataType}"`,
        replacing ? 'PUT' : 'POST',
        dataUrl,
        () =>
          altinnFetch({
            url: dataUrl,
            method: replacing ? 'PUT' : 'POST',
            token,
            body: bodyOf(element),
            contentType,
            headers,
          }),
        preview(element),
      );
      if (!dataResponse.ok) {
        return failed(recorder, mode, `Upload of data element "${element.dataType}" failed.`, at);
      }
    }
  }

  if (request.validate) {
    const url = `${base}/instances/${partyId}/${guid}/validate`;
    await recorder.run('Validate instance', 'GET', url, () => altinnFetch({ url, token }));
  }

  if (request.advanceProcess) {
    const url = `${base}/instances/${partyId}/${guid}/process/next`;
    const response = await recorder.run('Advance process to next task', 'PUT', url, () =>
      altinnFetch({ url, method: 'PUT', token, body: '{}', contentType: 'application/json' }),
    );
    if (!response.ok) {
      return failed(recorder, mode, 'Process could not be advanced (the data is still stored).', at);
    }
  }

  // Re-read so the returned instance reflects the uploaded data and current process state.
  const readBackUrl = `${base}/instances/${partyId}/${guid}`;
  const readBack = await recorder.run('Read back instance', 'GET', readBackUrl, () =>
    altinnFetch({ url: readBackUrl, token }),
  );
  if (readBack.ok) instance = readBack.body as Instance;

  return {
    ok: true,
    mode,
    steps: recorder.steps,
    instanceOwnerPartyId: partyId,
    instanceGuid: guid,
    instanceUrl: instanceUiUrl(request.org, request.app, partyId, guid),
    instance,
    failedAt: null,
  };
}

function failed(
  recorder: StepRecorder,
  mode: RunMode,
  reason: string,
  at?: {
    org: string;
    app: string;
    partyId: string | null;
    guid: string | null;
    instance: unknown;
  },
): RunResult {
  return {
    ok: false,
    mode,
    steps: recorder.steps,
    instanceOwnerPartyId: at?.partyId ?? null,
    instanceGuid: at?.guid ?? null,
    instanceUrl:
      at?.partyId && at.guid ? instanceUiUrl(at.org, at.app, at.partyId, at.guid) : null,
    instance: at?.instance ?? null,
    failedAt: reason,
  };
}

export { sniffContentType };
