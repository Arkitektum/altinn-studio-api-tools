import { randomUUID } from 'node:crypto';

export interface MultipartPart {
  /** Part name. For Altinn instantiation this is the data type id, or "instance". */
  name: string;
  content: string;
  contentType: string;
  /** Only set for binary/attachment parts. Form data parts must not carry a filename. */
  filename?: string;
}

/**
 * Builds a multipart/form-data body by hand rather than using FormData.
 *
 * `FormData.append(name, blob)` always emits `filename="blob"`, and Altinn stores that as the
 * data element's filename, so a prefilled form data element would come out named "blob".
 * Writing the body ourselves lets us omit Content-Disposition's filename entirely.
 */
export function buildMultipart(parts: MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = pickBoundary(parts);
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${escapeQuotes(part.name)}"; filename="${escapeQuotes(part.filename)}"`
      : `form-data; name="${escapeQuotes(part.name)}"`;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: ${disposition}\r\n` +
          `Content-Type: ${part.contentType}\r\n\r\n`,
        'utf8',
      ),
      Buffer.from(part.content, 'utf8'),
      Buffer.from('\r\n', 'utf8'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** A boundary must not occur in any payload. A UUID never will, but verify rather than assume. */
function pickBoundary(parts: MultipartPart[]): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `----AltinnApiTools${randomUUID().replace(/-/g, '')}`;
    if (!parts.some((part) => part.content.includes(candidate))) return candidate;
  }
  throw new Error('Could not find a multipart boundary absent from the payload.');
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '');
}
