/** Normalising what was typed or pasted into a field, before anything acts on it. */

/**
 * Most repeats you can ask for in one go. High enough to build a pile of test instances, low
 * enough that a fat-fingered extra digit does not run for minutes against localtest.
 */
export const MAX_REPEAT = 50;

/** A repeat count that can be trusted: whole, at least one, and no more than the cap. */
export function clampRepeat(value: number): number {
    return Math.min(Math.max(Math.round(value) || 1, 1), MAX_REPEAT);
}

/** Accepts "510001/99d0632c-..." as well as a bare guid, so an instance id can be pasted whole. */
export function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
    const match = /^(\d+)\/(.+)$/.exec(value.trim());
    if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
    return { guid: value.trim() };
}
