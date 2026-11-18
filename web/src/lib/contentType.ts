/** Offered when the app has not been probed, or when a data type declares nothing. */
export const COMMON_CONTENT_TYPES = ["application/xml", "application/json", "application/pdf", "text/plain"];

/**
 * The content type to select for a data type, mirroring how the server resolves an empty one:
 * prefer a declared JSON or XML type, otherwise take the first declared type. Returns undefined
 * when the app declares nothing, which leaves the choice to the server.
 */
export function preferredContentType(declared: string[]): string | undefined {
    return declared.find(isStructuredData) ?? declared[0];
}

/**
 * Whether a content type is JSON or XML, which is what form data is posted as. Mirrors isStructuredData on the
 * server, and is matched on the subtype for the same reason isTextual below is.
 */
export function isStructuredData(contentType: string): boolean {
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type === "application/json" || type === "application/xml" || type === "text/xml") return true;
    return type.endsWith("+json") || type.endsWith("+xml");
}

/**
 * Content types that are safe to hand around as UTF-8 text. Mirrors isTextual on the server.
 *
 * Matched on the subtype rather than by substring, because a substring test for "xml" also
 * matches the office packages, which are zips. Reading one of those as text corrupts the file.
 */
export function isTextual(contentType: string | null): boolean {
    if (!contentType) return false;
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type.startsWith("text/")) return true;
    if (type === "application/json" || type === "application/xml") return true;
    return type.endsWith("+json") || type.endsWith("+xml");
}

/**
 * Options for the content type select. A value set before the app was probed stays selectable
 * even if the app does not declare it, so switching to a probed app never silently drops it.
 */
export function contentTypeOptions(declared: string[], current: string | undefined): string[] {
    const base = declared.length > 0 ? declared : COMMON_CONTENT_TYPES;
    return current && !base.includes(current) ? [...base, current] : base;
}

/**
 * Whether base64 content is a pdf, for the browser's own viewer to show. Declared as one, or starting with the `%PDF-`
 * every pdf opens with, since an attachment uploaded as `application/octet-stream` is still a pdf to look at.
 */
export function isPdf(contentType: string | null, base64: string): boolean {
    const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type === "application/pdf") return true;
    try {
        // Eight characters of base64 are six bytes, enough for the five the marker takes.
        return atob(base64.slice(0, 8)).startsWith("%PDF-");
    } catch {
        return false;
    }
}
