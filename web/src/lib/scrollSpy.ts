/** Where an anchored panel sits, and where it counts as arrived. */
export interface AnchorPosition {
    anchor: string;
    /** Its top edge, as `getBoundingClientRect().top` gives it. */
    top: number;
    /**
     * Where its top lands when it is scrolled to, which is its own `scroll-margin-top`.
     *
     * The panels carry one so that a link in the strip scrolls them clear of the sticky header
     * rather than under it. Measuring the strip's own edge instead left the two disagreeing by
     * exactly that margin: clicking a link put the panel a few pixels below the line, so it never
     * counted as reached and the strip marked the panel above the one that had just been asked
     * for. Comparing against the number the browser scrolls to cannot drift from it.
     */
    reachedAt: number;
}

/**
 * Which anchored panel you are looking at: the last one to have arrived, since that is the one
 * filling the screen below the header.
 *
 * Before the first one gets there, which is the case at the top of the page, the first is
 * current: nothing has been scrolled past, so the answer is where you started.
 */
export function currentAnchor(positions: AnchorPosition[], atBottom = false): string | null {
    if (positions.length === 0) return null;

    /*
     * At the end of the page nothing below can arrive, however short the last panel is, so the
     * last one is the answer. Without this, clicking the last link scrolled as far as the page
     * goes and left the strip marking whatever happened to be above it.
     */
    if (atBottom) return positions[positions.length - 1]?.anchor ?? null;

    let current: string | null = null;
    for (const position of positions) {
        // A few pixels of slack, so a panel sitting exactly on its line counts as arrived rather
        // than flickering between two answers as the page moves by fractions.
        if (position.top <= position.reachedAt + 4) current = position.anchor;
    }
    return current ?? positions[0]?.anchor ?? null;
}
