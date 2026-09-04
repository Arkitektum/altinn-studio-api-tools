import { altinnFetch } from './altinnClient.js';
import { StepRecorder, type RunStep } from './stepRecorder.js';
import { appBaseUrl, instanceUiUrl } from './urls.js';

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
  /** Parsed when Altinn returns JSON, otherwise the raw text such as XML. */
  content: unknown;
}

function toSummary(value: unknown): DataElementSummary | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] !== 'string') return null;
  const asString = (key: string): string | null =>
    typeof record[key] === 'string' ? (record[key] as string) : null;
  return {
    id: record['id'],
    dataType: asString('dataType') ?? 'unknown',
    contentType: asString('contentType'),
    filename: asString('filename'),
    size: typeof record['size'] === 'number' ? record['size'] : null,
    lastChanged: asString('lastChanged'),
  };
}

/** GET {app}/instances/{party}/{guid} */
export async function readInstance(
  token: string,
  request: ReadRequest,
): Promise<ReadInstanceResult> {
  const recorder = new StepRecorder();
  const url = `${appBaseUrl(request.org, request.app)}/instances/${
    request.instanceOwnerPartyId
  }/${request.instanceGuid}`;

  const response = await recorder.run('Get instance', 'GET', url, () =>
    altinnFetch({ url, token }),
  );

  const instance = response.ok ? response.body : null;
  const rawData =
    instance && typeof instance === 'object'
      ? (instance as Record<string, unknown>)['data']
      : undefined;
  const dataElements = Array.isArray(rawData)
    ? rawData.map(toSummary).filter((element): element is DataElementSummary => element !== null)
    : [];

  return {
    ok: response.ok,
    steps: recorder.steps,
    failedAt: response.ok ? null : 'Could not read the instance.',
    instanceOwnerPartyId: request.instanceOwnerPartyId,
    instanceGuid: request.instanceGuid,
    instanceUrl: instanceUiUrl(
      request.org,
      request.app,
      request.instanceOwnerPartyId,
      request.instanceGuid,
    ),
    instance,
    dataElements,
  };
}

/** GET {app}/instances/{party}/{guid}/data/{dataGuid} */
export async function readDataElement(
  token: string,
  request: ReadRequest & { dataGuid: string },
): Promise<ReadDataElementResult> {
  const recorder = new StepRecorder();
  const url = `${appBaseUrl(request.org, request.app)}/instances/${
    request.instanceOwnerPartyId
  }/${request.instanceGuid}/data/${request.dataGuid}`;

  // Data elements are stored in whatever type the app used, commonly XML, so do not ask for JSON.
  const response = await recorder.run('Get data element', 'GET', url, () =>
    altinnFetch({ url, token, accept: '*/*' }),
  );

  return {
    ok: response.ok,
    steps: recorder.steps,
    failedAt: response.ok ? null : 'Could not read the data element.',
    dataGuid: request.dataGuid,
    contentType: response.contentType,
    content: response.ok ? response.body : null,
  };
}
