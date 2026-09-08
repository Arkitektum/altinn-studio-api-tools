/**
 * Reading an instance id someone typed or pasted.
 *
 * Altinn writes them as "510001/99d0632c-…", party then guid, so that is what lands on the
 * clipboard when one is copied out of a log or a URL. Accepting the whole thing saves splitting
 * it by hand, and a bare guid is taken as belonging to the party already chosen.
 */
export function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
    const match = /^(\d+)\/(.+)$/.exec(value.trim());
    if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
    return { guid: value.trim() };
}
