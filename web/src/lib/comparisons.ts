import type { DataElementInput, DataElementSummary } from "../types";

export interface ComparisonPair {
    /** The element as Altinn stored it. */
    stored: DataElementSummary;
    /** The payload element it was written from, or null when the payload has none to offer. */
    written: DataElementInput | null;
}

/** Whether a payload element holds text a comparison could read. Base64 is a file, not xml. */
function isWrittenXml(element: DataElementInput): boolean {
    return Boolean(element.content.trim()) && element.encoding !== "base64";
}

/**
 * Every stored element worth comparing, each beside the payload element it was written from.
 *
 * Only form data is compared, which is the main form and the sub forms, since `isForm` says which
 * those are. An attachment goes in as a file and comes back as the same file, so there is nothing
 * for a model to have done to it.
 *
 * Paired in order within a data type: the second stored element of a sub form is the second
 * payload element of it, because a post sends them in the order the payload lists them and
 * storage lists them in the order they were made. A stored element past the end of what the
 * payload holds is kept with nothing beside it, so the panel can say why it is not compared rather
 * than leaving it out.
 */
export function pairComparisons(stored: DataElementSummary[], payload: DataElementInput[], isForm: (dataType: string) => boolean): ComparisonPair[] {
    const seen = new Map<string, number>();
    return stored
        .filter((element) => isForm(element.dataType))
        .map((element) => {
            const index = seen.get(element.dataType) ?? 0;
            seen.set(element.dataType, index + 1);
            const written = payload.filter((candidate) => candidate.dataType === element.dataType && isWrittenXml(candidate))[index] ?? null;
            return { stored: element, written };
        });
}
