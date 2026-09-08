/**
 * Extension per content type, for naming a downloaded data element and for recognising a file
 * picked off disk. Only the formats the example data covers, since those are the ones the apps
 * declare.
 *
 * Several spellings map to one extension. The first one listed wins when going the other way, so
 * a `.xml` file is `application/xml` unless the app asked for `text/xml`.
 */
const EXTENSIONS: Record<string, string> = {
    "application/xml": "xml",
    "text/xml": "xml",
    "application/json": "json",
    "text/json": "json",
    "application/gml+xml": "gml",
    "application/geo+json": "geojson",
    "application/vnd.geo+json": "geojson",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.oasis.opendocument.text": "odt",
    "application/vnd.oasis.opendocument.spreadsheet": "ods",
    "application/rtf": "rtf",
    "text/rtf": "rtf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/x-ms-bmp": "bmp",
    "image/webp": "webp",
    "image/tiff": "tif",
    "image/svg+xml": "svg",
    "text/csv": "csv",
    "application/csv": "csv",
    "text/html": "html",
    "text/markdown": "md",
    "text/plain": "txt",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/octet-stream": "bin"
};

/** Extensions that name the same format under another spelling. */
const ALIASES: Record<string, string> = { jpeg: "jpg", tiff: "tif", htm: "html", markdown: "md", text: "txt", xsd: "xml" };

/** The extension for a content type, ignoring any charset parameter. Empty when unknown. */
export function extensionFor(contentType: string | null): string {
    if (!contentType) return "";
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    return EXTENSIONS[type] ?? "";
}

/** The extension of a filename, lowercased and de-aliased. Empty when it has none. */
export function extensionOf(filename: string): string {
    const raw = filename.includes(".") ? (filename.split(".").pop() ?? "") : "";
    const extension = raw.toLowerCase();
    return ALIASES[extension] ?? extension;
}

/** The content type a filename implies, by its extension. Empty when the format is unknown. */
export function contentTypeForFilename(filename: string): string {
    const extension = extensionOf(filename);
    if (!extension) return "";
    return Object.entries(EXTENSIONS).find(([, value]) => value === extension)?.[0] ?? "";
}

/**
 * Decodes base64 to bytes. Binary content travels as base64, because the api is json.
 *
 * The array buffer is spelled out in the return type because a Blob only takes bytes backed by a
 * real ArrayBuffer, not by the wider ArrayBufferLike.
 */
export function bytesFromBase64(base64: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/**
 * Encodes bytes as base64, in chunks. Applying `String.fromCharCode` to a whole file at once
 * overflows the argument list, and the example GML alone is near a megabyte.
 */
export function base64FromBytes(bytes: Uint8Array): string {
    const CHUNK = 8192;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
    }
    return btoa(binary);
}
