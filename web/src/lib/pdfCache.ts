import type { DataElementSummary, ProcessSummary } from "../types";

/**
 * Whether the pdf in hand still describes the instance in front of you.
 *
 * A render is the one read in this tool that is expensive at both ends: the app lays the whole form
 * out, and what comes back is megabytes of base64 that become a blob url. Pressing the button twice
 * without having changed anything in between used to do all of that twice for the same document.
 *
 * So the pdf is kept, with a fingerprint of the instance it was rendered from, and the button only
 * asks again when that fingerprint has moved. The window closing no longer throws the pdf away,
 * which is what made a second render necessary to look at the same document again.
 */

/** none: nothing rendered yet. current: what is held still describes the instance. stale: it does not. */
export type PdfStand = "none" | "current" | "stale";

export interface FingerprintInputs {
    dataElements: DataElementSummary[];
    process: ProcessSummary | null;
}

/**
 * What the pdf was rendered from, as one string, or null when the instance has not been read.
 *
 * The data elements and where the process stands, which between them are everything a render
 * reads: the form and its attachments are the elements, and the task decides which layout the app
 * uses. Sorted by id, because the order storage lists them in is not a change to the instance.
 *
 * `lastChanged` is the part that catches an element being rewritten in place, and LocalTest does
 * set it. Where it is missing the size still catches most edits, and the worst case is a render
 * served from the cache when a rewrite happened to keep the byte count: Render again is there for
 * that, and it is the reason the button is offered at all rather than the cache being silent.
 */
export function fingerprintInstance(inputs: FingerprintInputs): string | null {
    if (!inputs.process && inputs.dataElements.length === 0) return null;

    const elements = inputs.dataElements
        .map((element) => `${element.id}:${element.lastChanged ?? ""}:${element.size ?? ""}`)
        .sort()
        .join("|");
    return `${elements}#${inputs.process?.currentTask ?? ""}:${inputs.process?.ended ?? ""}`;
}

/**
 * Where the held pdf stands against the instance now.
 *
 * An instance that cannot be fingerprinted counts as stale rather than current. Not knowing whether
 * a document is out of date is the same as knowing it might be, and the cost of being wrong the
 * other way is showing someone a pdf of something they have since changed.
 */
export function pdfStand(held: string | null, now: string | null): PdfStand {
    if (held === null) return "none";
    if (now === null || held !== now) return "stale";
    return "current";
}
