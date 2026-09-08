import { isTextual } from "./contentType";
import { base64FromBytes, contentTypeForFilename, extensionFor } from "./formats";
import type { ExampleEncoding } from "../types";

/**
 * Biggest file worth picking. The server parses request bodies up to 25 MB and base64 inflates by
 * a third on the way there, so anything much past this is refused by express rather than by us.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface PickedFile {
    filename: string;
    contentType: string;
    encoding: ExampleEncoding;
    /** Text for the textual formats, base64 for everything else. */
    content: string;
}

/**
 * The content type to post a picked file as.
 *
 * The browser's own guess comes first, since it looked at the file. Where it has none, and it
 * often has none for `.gml` or `.geojson`, the extension decides. Either way, a spelling the app
 * declared wins over an equivalent one it did not: an app asking for `text/xml` gets `text/xml`
 * rather than `application/xml`, which is the same rule the dummy attachments follow.
 */
export function resolveFileContentType(filename: string, browserType: string, allowed: string[]): string {
    const guess = (browserType || contentTypeForFilename(filename) || "application/octet-stream").split(";")[0]?.trim().toLowerCase() ?? "";
    if (allowed.length === 0 || allowed.includes(guess)) return guess;

    // Same format under another name, e.g. text/xml where we guessed application/xml.
    const extension = extensionFor(guess);
    const sameFormat = extension ? allowed.find((type) => extensionFor(type) === extension) : undefined;
    // Nothing matched, so keep the honest guess. The app refusing it is useful to see.
    return sameFormat ?? guess;
}

export function describeTooLarge(size: number): string {
    return `That file is ${Math.round(size / (1024 * 1024))} MB. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB, since the payload travels as base64 inside a json request.`;
}

/**
 * Reads a picked file into a data element payload. Textual formats are read as text so they stay
 * editable and round-trip byte for byte, and everything else as base64, which the server decodes
 * before the request goes to Altinn.
 */
export async function readPickedFile(file: File, allowed: string[]): Promise<PickedFile> {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(describeTooLarge(file.size));

    const contentType = resolveFileContentType(file.name, file.type, allowed);
    if (isTextual(contentType)) {
        return { filename: file.name, contentType, encoding: "utf8", content: await file.text() };
    }
    return {
        filename: file.name,
        contentType,
        encoding: "base64",
        content: base64FromBytes(new Uint8Array(await file.arrayBuffer()))
    };
}
