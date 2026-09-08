import { bytesFromBase64, extensionFor } from "./formats";

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
