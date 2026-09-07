import { config } from './config.js';

export interface AltinnRequest {
  url: string;
  method?: string;
  token?: string;
  /**
   * Pre-serialized body. Strings are sent verbatim so XML/JSON round-trips byte-for-byte;
   * a Buffer carries an already-assembled multipart body.
   */
  body?: string | Uint8Array;
  contentType?: string;
  headers?: Record<string, string>;
  accept?: string;
  /**
   * Read the response as bytes and expose them on `bytes`. Needed for stored attachments,
   * where decoding as UTF-8 text would corrupt the file.
   */
  binaryResponse?: boolean;
}

export interface AltinnResponse {
  ok: boolean;
  status: number;
  statusText: string;
  /** Parsed JSON when the response is JSON, otherwise the raw text (truncated). */
  body: unknown;
  contentType: string | null;
  /** Raw bytes, only when the request asked for them. */
  bytes?: Buffer;
}

const MAX_LOGGED_BODY = 200_000;

/**
 * Thin fetch wrapper for Altinn endpoints: attaches the bearer token, applies a timeout
 * and always returns a response object instead of throwing on non-2xx, so callers can
 * put the failing status into a step log.
 */
export async function altinnFetch(request: AltinnRequest): Promise<AltinnResponse> {
  const headers = new Headers(request.headers ?? {});
  headers.set('accept', request.accept ?? 'application/json');
  if (request.token) headers.set('authorization', `Bearer ${request.token}`);
  if (request.contentType && request.body !== undefined) {
    headers.set('content-type', request.contentType);
  }

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method ?? 'GET',
      headers,
      body: request.body,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      statusText: timedOut ? 'Gateway Timeout' : 'Bad Gateway',
      body: {
        error: timedOut
          ? `Request to ${request.url} timed out after ${config.requestTimeoutMs} ms.`
          : `Request to ${request.url} failed: ${reason}`,
      },
      contentType: null,
    };
  }

  const contentType = response.headers.get('content-type');

  if (request.binaryResponse) {
    const bytes = Buffer.from(await response.arrayBuffer());
    // Text formats stay readable in the log, and JSON is still parsed so error payloads read
    // the same as on any other request. Anything else gets a summary, because a wall of
    // mojibake would be worse than useless.
    let body: unknown;
    if (contentType?.includes('json')) {
      const text = bytes.toString('utf8');
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else if (isTextual(contentType)) {
      body = bytes.toString('utf8');
    } else {
      body = { bytes: bytes.length, contentType };
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      contentType,
      bytes,
    };
  }

  const text = await response.text();
  let body: unknown = text.length > MAX_LOGGED_BODY ? `${text.slice(0, MAX_LOGGED_BODY)}…[truncated]` : text;
  if (contentType?.includes('json') && text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      /* keep the raw text, since a malformed body is itself useful in the log */
    }
  }
  if (body === '') body = null;

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
    contentType,
  };
}

/**
 * Content types that are safe to hand around as UTF-8 text.
 *
 * Matched on the subtype rather than by substring, because a substring test for "xml" also
 * matches `application/vnd.openxmlformats-officedocument...`, which is a zip. Decoding one of
 * those as text corrupts the file.
 */
export function isTextual(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type.startsWith('text/')) return true;
  if (type === 'application/json' || type === 'application/xml') return true;
  return type.endsWith('+json') || type.endsWith('+xml');
}

/** Pull a human-readable message out of an Altinn/ASP.NET error payload. */
export function describeFailure(response: AltinnResponse): string {
  const body = response.body;
  if (typeof body === 'string' && body.trim()) return body.slice(0, 500);
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['detail', 'title', 'error', 'message']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return JSON.stringify(body).slice(0, 500);
  }
  return `${response.status} ${response.statusText}`;
}
