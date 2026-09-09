import { requestChain, type ChainInputs } from "../lib/chain";

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

    return (
        <nav className="chain" aria-label="What the tool is working on">
            {steps.map((step, position) => (
                <span key={step.label} className={`chain__link chain__link--${step.state}`}>
                    {position > 0 && (
                        <span className="chain__arrow" aria-hidden="true">
                            ›
                        </span>
                    )}
                    <span className="chain__label">{step.label}</span>
                    <span className="chain__value">{step.state === "next" ? `in ${step.where}` : (step.value ?? "waiting")}</span>
                </span>
            ))}
        </nav>
    );
}
