import { Fragment, useRef } from "react";
import { requestChain, type ChainInputs, type ChainStep } from "../lib/chain";
import { useScrollSpy } from "../lib/useScrollSpy";

/**
 * The chain the tool hangs off, under the header: a user, an application, a party, an instance, a
 * data element. Each link shows what it holds, the next one to fill in is accented and says where
 * to do it, and the ones that cannot be reached yet are faint.
 *
 * It exists because the dependencies were only ever implicit. Panels appear as they become
 * usable, which is the right behaviour and a poor explanation: an absent panel says nothing about
 * what would bring it back.
 */
export function Chain(inputs: ChainInputs) {
    const steps = requestChain(inputs);
    const strip = useRef<HTMLElement>(null);
    /*
     * Which panel is on screen, so the strip reads as a position and not only as a state. The
     * anchors are deduplicated because Application and Party are both set in Target: scrolling
     * there marks them both, which is the truth rather than a rounding of it.
     */
    const here = useScrollSpy([...new Set(steps.filter((step) => step.spy).map((step) => step.anchor))], strip);

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
                        <span className="chain__value">{step.state === "next" ? `in ${step.where}` : (step.value ?? "waiting")}</span>
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
                        <span
                            className={`chain__link chain__link--${step.state}${onScreen ? " chain__link--here" : ""}`}
                            aria-current={onScreen ? "true" : undefined}
                        >
                            {/*
                             * A waiting link stays plain text: the panel it names is not on screen
                             * yet, so there is nowhere to go and a button that did nothing would be
                             * worse than none.
                             */}
                            {step.state === "waiting" ? (
                                text
                            ) : (
                                <button type="button" className="chain__go" onClick={() => go(step)} title={`Go to ${step.where}`}>
                                    {text}
                                </button>
                            )}
                        </span>
                    </Fragment>
                );
            })}
        </nav>
    );
}
