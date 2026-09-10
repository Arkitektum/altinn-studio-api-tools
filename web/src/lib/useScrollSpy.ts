import { useEffect, useState, type RefObject } from "react";
import { currentAnchor } from "./scrollSpy";

/**
 * Which of the anchored panels is on screen, for the chain strip to mark.
 *
 * The positions are read from the DOM on each scroll rather than watched with an observer,
 * because panels come and go as they become usable: reading the ids fresh handles a panel that
 * has just appeared or gone without any subscription to keep in step with it.
 *
 * The offset comes from the strip itself, measured, so it stays right whatever the header and the
 * strip add up to.
 */
export function useScrollSpy(anchors: string[], stripRef: RefObject<HTMLElement | null>): string | null {
    const [here, setHere] = useState<string | null>(null);
    // A string, so the effect re-runs when the set of anchors changes rather than every render.
    const key = anchors.join(",");

    useEffect(() => {
        let queued = false;

        const measure = (): void => {
            queued = false;
            // Where a panel without a scroll margin of its own would have to reach.
            const stripBottom = stripRef.current?.getBoundingClientRect().bottom ?? 0;
            const positions = key
                .split(",")
                .filter(Boolean)
                .map((anchor) => ({ anchor, element: document.getElementById(anchor) }))
                .filter((entry): entry is { anchor: string; element: HTMLElement } => entry.element !== null)
                .map((entry) => {
                    // The same number the browser uses when it scrolls this panel into view, so
                    // the strip cannot disagree with where a click actually puts it.
                    const margin = Number.parseFloat(window.getComputedStyle(entry.element).scrollMarginTop);
                    return {
                        anchor: entry.anchor,
                        top: entry.element.getBoundingClientRect().top,
                        reachedAt: Number.isFinite(margin) && margin > 0 ? margin : stripBottom
                    };
                });

            // Two pixels of tolerance, since a fractional viewport height never adds up exactly.
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            const next = currentAnchor(positions, atBottom);
            // Only on a change, or every frame of a scroll would be a render.
            setHere((current) => (current === next ? current : next));
        };

        const onScroll = (): void => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(measure);
        };

        measure();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [key, stripRef]);

    return here;
}
