import { useRef } from "react";
import { requestChain, type ChainInputs, type ChainState, type ChainStep } from "../lib/chain";
import { useScrollSpy } from "../lib/useScrollSpy";

/**
 * The glyph for a step's state.
 *
 * Drawn here rather than taken from an icon set, which would be a dependency for five shapes, and
 * chosen so each says what a word would otherwise have to: a tick for done, a ring for the one you
 * are on, a dot for one still out of reach. They carry the state on their own, which is the test
 * for whether a glyph belongs at all.
 *
 * `currentColor` throughout, so the state's colour is set once on the row and the glyph follows.
 */
function Glyph({ state }: { state: ChainState }) {
    if (state === "done") {
        return (
            <svg className="rail__glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    if (state === "next") {
        return (
            <svg className="rail__glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
            </svg>
        );
    }
    return (
        <svg className="rail__glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="2.5" fill="currentColor" />
        </svg>
    );
}

/** What the glyph means, for anyone the shape does not reach. */
const SAID: Record<ChainState, string> = {
    done: "done",
    next: "next to fill in",
    waiting: "not reachable yet"
};

/**
 * The chain down the left: a user, an application, a party, an instance, a data element.
 *
 * A rail rather than the strip it was, because the tool is a wizard in the one way that matters,
 * each step needing the one before it, and a strip could show the order but not the progress. Down
 * the side there is room for a label, what it holds and where you are, all at once.
 *
 * Each row takes you to the panel that sets it. A row still out of reach is not a link: the panel
 * is on screen, but scrolling to one you cannot use yet is a worse answer than none.
 */
export function Chain(inputs: ChainInputs) {
    const steps = requestChain(inputs);
    const rail = useRef<HTMLElement>(null);
    /*
     * Which panel is on screen, so the rail reads as a position as well as a readout. The anchors
     * are deduplicated because Application and Party are both set in Target: scrolling there marks
     * them both, which is the truth rather than a rounding of it.
     */
    const here = useScrollSpy([...new Set(steps.map((step) => step.anchor))], rail);

    function go(step: ChainStep) {
        document.getElementById(step.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    return (
        <nav className="rail" aria-label="What the tool is working on" ref={rail}>
            {steps.map((step) => {
                const onScreen = step.anchor === here && step.state !== "waiting";
                const body = (
                    <>
                        <span className={`rail__mark rail__mark--${step.state}`}>
                            <Glyph state={step.state} />
                        </span>
                        <span className="rail__text">
                            <span className="rail__label">{step.label}</span>
                            <span className="rail__value">{step.value ?? "-"}</span>
                        </span>
                        <span className="sr-only">{SAID[step.state]}</span>
                    </>
                );

                return (
                    <div key={step.label} className={`rail__step rail__step--${step.state}${onScreen ? " rail__step--here" : ""}`}>
                        {step.state === "waiting" ? (
                            <span className="rail__row">{body}</span>
                        ) : (
                            <button type="button" className="rail__row rail__row--go" onClick={() => go(step)} aria-current={onScreen || undefined}>
                                {body}
                            </button>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
