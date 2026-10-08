import { useId, useState, type CSSProperties, type ReactNode } from "react";

interface ExplainedProps {
    /** The one line worth reading every time, which stays on screen. */
    lead: ReactNode;
    /** The rest of the explanation, for the first time or when something surprises you. */
    children: ReactNode;
    style?: CSSProperties;
}

/**
 * A hint whose explanation waits behind a "More".
 *
 * Several hints had grown to a paragraph of small grey text, which is worth reading once and in
 * the way every time after. The lead stays, and the rest opens in place after it as the same
 * paragraph, so opening it reads as the hint carrying on rather than as a second block. Hidden
 * rather than unmounted, so the button always has the text it controls.
 */
export function Explained({ lead, children, style }: ExplainedProps) {
    const [open, setOpen] = useState(false);
    const id = useId();

    return (
        <p className="field__hint" style={style}>
            {lead}{" "}
            <span id={id} hidden={!open}>
                {children}{" "}
            </span>
            <button
                type="button"
                className="explained__toggle"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((current) => !current)}
            >
                {open ? "Less" : "More"}
            </button>
        </p>
    );
}
