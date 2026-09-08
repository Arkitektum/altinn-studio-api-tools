/**
 * Extension per content type, for naming a downloaded data element. Only the formats the example
 * data covers, since those are the ones the apps declare.
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

/** The extension for a content type, ignoring any charset parameter. Empty when unknown. */
export function extensionFor(contentType: string | null): string {
    if (!contentType) return "";
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    return EXTENSIONS[type] ?? "";
}

/**
 * What to call a downloaded data element. Altinn's own filename wins when it stored one, since an
 * attachment was uploaded under a name someone chose. Otherwise the data type names the file and
 * the content type gives it an extension.
 */
export function suggestedFilename(element: { dataType: string; filename: string | null; contentType: string | null }): string {
    if (element.filename) return element.filename;
    const extension = extensionFor(element.contentType);
    return extension ? `${element.dataType}.${extension}` : element.dataType;
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
 * Saves content as a file through a blob url. The url is revoked straight after the click, since
 * the browser has already taken what it needs by then.
 */
export function downloadContent(filename: string, content: string, encoding: "utf8" | "base64", contentType: string | null): void {
    const type = contentType ?? "application/octet-stream";
    const blob = encoding === "base64" ? new Blob([bytesFromBase64(content)], { type }) : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
