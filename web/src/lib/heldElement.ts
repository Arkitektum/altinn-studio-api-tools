import { suggestedFilename } from "./download";
import type { DataElementSummary, FetchedDataElement, ReadDataElementResult } from "../types";

/**
 * What was read back, as something to save to disk, or null when there is nothing to save.
 *
 * Null rather than the last one for a read that failed or came back empty: the previous element
 * left on screen would look like the one you just asked for, and the download button beside it
 * would hand you that file under this element's name.
 *
 * The name comes from what Altinn stored it as, falling back to the data type, and the size is
 * counted in bytes rather than characters, which for base64 is what the encoding stands for rather
 * than how long it is written.
 */
export function heldElement(dataGuid: string, read: ReadDataElementResult, summary: DataElementSummary | null): FetchedDataElement | null {
    if (!read.ok || read.content === null) return null;

    const dataType = summary?.dataType ?? "data";
    return {
        dataGuid,
        dataType,
        filename: suggestedFilename({ dataType, filename: summary?.filename ?? null, contentType: read.contentType }),
        contentType: read.contentType,
        encoding: read.encoding,
        content: read.content,
        size: read.encoding === "base64" ? Math.ceil((read.content.length * 3) / 4) : new Blob([read.content]).size
    };
}
