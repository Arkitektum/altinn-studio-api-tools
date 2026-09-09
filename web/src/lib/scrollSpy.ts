/** Where an anchored panel sits, relative to the viewport top. */
export interface AnchorPosition {
    anchor: string;
    /** Its top edge, as `getBoundingClientRect().top` gives it. */
    top: number;
}

/**
 * Which anchored panel you are looking at: the last one to have reached the line under the
 * sticky header, since that is the one filling the screen below it.
 *
 * Before the first one gets there, which is the case at the top of the page, the first is
 * current: nothing has been scrolled past, so the answer is where you started.
 */
export function currentAnchor(positions: AnchorPosition[], offset: number): string | null {
    if (positions.length === 0) return null;

    // A few pixels of slack, so a panel sitting exactly on the line counts as reached rather
    // than flickering between two answers as the page moves by fractions.
    const line = offset + 4;
    let current: string | null = null;
    for (const position of positions) {
        if (position.top <= line) current = position.anchor;
    }
    return current ?? positions[0]?.anchor ?? null;
}
