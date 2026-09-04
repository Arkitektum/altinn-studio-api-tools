import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readDataElement, readInstance } from './readService.js';

const APP_BASE = 'http://local.altinn.cloud:8000/dibk/et-v4';
const GUID = '99d0632c-5917-448c-8ab6-a5d3b681376b';
const DATA_GUID = 'fdeb5550-f4e8-4f23-87d0-111234ac4771';

const target = { org: 'dibk', app: 'et-v4', instanceOwnerPartyId: '510001', instanceGuid: GUID };

interface Call {
  method: string;
  url: string;
  accept: string | null;
}

function stubAltinn(respond: (url: string) => { status?: number; body: string; contentType: string }) {
  const calls: Call[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers ?? {});
    calls.push({ method: (init?.method ?? 'GET').toUpperCase(), url, accept: headers.get('accept') });
    assert.equal(headers.get('authorization'), 'Bearer test-token');

    const { status = 200, body, contentType } = respond(url);
    return new Response(body, { status, headers: { 'content-type': contentType } });
  }) as typeof fetch;

  return { calls, restore: () => (globalThis.fetch = original) };
}

const instanceBody = {
  id: `510001/${GUID}`,
  instanceOwner: { partyId: '510001' },
  appId: 'dibk/et-v4',
  data: [
    {
      id: DATA_GUID,
      dataType: 'ET',
      contentType: 'application/xml',
      size: 17585,
      lastChanged: '2026-09-03T10:00:00Z',
    },
    { id: 'aaaa-1111', dataType: 'GjennomfoeringsplanDataV7', contentType: 'application/xml' },
    { id: 'bbbb-2222', dataType: 'ref-data-as-pdf', contentType: 'application/pdf', filename: 'kvittering.pdf' },
    'not-an-object',
  ],
};

let active: { restore: () => void } | null = null;
afterEach(() => {
  active?.restore();
  active = null;
});

describe('readInstance', () => {
  it('gets the instance and summarises its data elements', async () => {
    const stub = stubAltinn(() => ({
      body: JSON.stringify(instanceBody),
      contentType: 'application/json',
    }));
    active = stub;

    const result = await readInstance('test-token', target);

    assert.equal(result.ok, true);
    assert.equal(result.failedAt, null);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]?.method, 'GET');
    assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}`);

    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0]?.name, 'Get instance');
    assert.equal(result.steps[0]?.status, 200);

    // The malformed entry is dropped rather than crashing the summary.
    assert.equal(result.dataElements.length, 3);
    assert.deepEqual(result.dataElements[0], {
      id: DATA_GUID,
      dataType: 'ET',
      contentType: 'application/xml',
      filename: null,
      size: 17585,
      lastChanged: '2026-09-03T10:00:00Z',
    });
    assert.equal(result.dataElements[2]?.filename, 'kvittering.pdf');
    assert.equal(result.instanceUrl, `${APP_BASE}/#/instance/510001/${GUID}`);
  });

  it('reports a missing instance without throwing', async () => {
    const stub = stubAltinn(() => ({
      status: 404,
      body: JSON.stringify({ detail: 'Not found' }),
      contentType: 'application/json',
    }));
    active = stub;

    const result = await readInstance('test-token', target);

    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'Could not read the instance.');
    assert.equal(result.dataElements.length, 0);
    assert.equal(result.steps[0]?.status, 404);
    assert.equal(result.steps[0]?.error, 'Not found');
  });

  it('copes with an instance that has no data array', async () => {
    const stub = stubAltinn(() => ({
      body: JSON.stringify({ id: `510001/${GUID}` }),
      contentType: 'application/json',
    }));
    active = stub;

    const result = await readInstance('test-token', target);
    assert.equal(result.ok, true);
    assert.deepEqual(result.dataElements, []);
  });
});

describe('readDataElement', () => {
  it('gets the chosen data element and returns the xml verbatim', async () => {
    const xml = '<?xml version="1.0" encoding="utf-8"?>\n<ettrinn><a>1</a></ettrinn>';
    const stub = stubAltinn(() => ({ body: xml, contentType: 'application/xml' }));
    active = stub;

    const result = await readDataElement('test-token', { ...target, dataGuid: DATA_GUID });

    assert.equal(result.ok, true);
    assert.equal(stub.calls[0]?.url, `${APP_BASE}/instances/510001/${GUID}/data/${DATA_GUID}`);
    // Asking for JSON would make Altinn refuse to hand back stored XML.
    assert.equal(stub.calls[0]?.accept, '*/*');
    assert.equal(result.contentType, 'application/xml');
    assert.equal(result.content, xml);
    assert.equal(result.dataGuid, DATA_GUID);
  });

  it('parses a json data element', async () => {
    const stub = stubAltinn(() => ({
      body: '{"melding":{"navn":"Test"}}',
      contentType: 'application/json',
    }));
    active = stub;

    const result = await readDataElement('test-token', { ...target, dataGuid: DATA_GUID });
    assert.deepEqual(result.content, { melding: { navn: 'Test' } });
  });

  it('reports an unknown data guid without throwing', async () => {
    const stub = stubAltinn(() => ({
      status: 404,
      body: JSON.stringify({ detail: 'Data element not found' }),
      contentType: 'application/json',
    }));
    active = stub;

    const result = await readDataElement('test-token', { ...target, dataGuid: 'nope' });

    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'Could not read the data element.');
    assert.equal(result.content, null);
    assert.equal(result.steps[0]?.error, 'Data element not found');
  });
});
