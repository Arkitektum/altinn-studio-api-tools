import type { RunMode } from "../types";

/** Normalising what was typed, pasted or restored, before anything acts on it. */

/**
 * The destination to act on, given what a previous session stored. The UI offers a new or an
 * existing instance, while the api also takes `sequential`, which posted each data element in its
 * own request and was dropped from the UI. A session that stored it lands on a new instance.
 */
export function offeredMode(stored: RunMode): RunMode {
    return stored === "existing" ? "existing" : "multipart";
}

/** Accepts "510001/99d0632c-..." as well as a bare guid, so an instance id can be pasted whole. */
export function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
    const match = /^(\d+)\/(.+)$/.exec(value.trim());
    if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
    return { guid: value.trim() };
}
