import { Fragment, useRef } from "react";
import { requestChain, type ChainInputs, type ChainStep } from "../lib/chain";
import { useScrollSpy } from "../lib/useScrollSpy";

/**
 * The chain the tool hangs off, under the header: a user, an application, a party, an instance, a
 * data element. Each link shows what it holds and takes you to the panel that sets it.
 *
 * A readout and a way down the page. What each link is waiting for is said by the panel that is
 * waiting for it, which is where it belongs; see `lib/readiness.ts`.
 */
export function Chain(inputs: ChainInputs) {
    const steps = requestChain(inputs);
    const strip = useRef<HTMLElement>(null);
    /*
     * Which panel is on screen, so the strip reads as a position as well as a readout. The anchors
     * are deduplicated because Application and Party are both set in Target: scrolling there marks
     * them both, which is the truth rather than a rounding of it.
     */
    const here = useScrollSpy([...new Set(steps.map((step) => step.anchor))], strip);

    /** Takes you to the panel a link is set in, since knowing where it is only half the help. */
    function go(step: ChainStep) {
        document.getElementById(step.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    return (
        <nav className="chain" aria-label="What the tool is working on" ref={strip}>
            {steps.map((step, position) => {
                const text = (
                    <>
                        <span className="chain__label">{step.label}</span>
                        <span className="chain__value">{step.value ?? "-"}</span>
                    </>
                );

                const onScreen = step.anchor === here;

                return (
                    <Fragment key={step.label}>
                        {/* Outside the link, so the on-screen highlight sits on the link alone. */}
                        {position > 0 && (
                            <span className="chain__arrow" aria-hidden="true">
                                ›
                            </span>
                        )}
                        {/* Every link is reachable now that every panel is on screen, so every one
                            of them is a button. */}
                        <span className={`chain__link${onScreen ? " chain__link--here" : ""}`} aria-current={onScreen ? "true" : undefined}>
                            <button type="button" className="chain__go" onClick={() => go(step)} title={`Go to ${step.label}`}>
                                {text}
                            </button>
                        </span>
                    </Fragment>
                );
            })}
        </nav>
    );
}
