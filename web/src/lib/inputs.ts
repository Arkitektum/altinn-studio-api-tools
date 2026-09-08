/** Normalising what was typed or pasted into a field, before anything acts on it. */

/** Accepts "510001/99d0632c-..." as well as a bare guid, so an instance id can be pasted whole. */
export function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
    const match = /^(\d+)\/(.+)$/.exec(value.trim());
    if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
    return { guid: value.trim() };
}
