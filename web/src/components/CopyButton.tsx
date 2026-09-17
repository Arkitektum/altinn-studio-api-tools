import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface CopyButtonProps {
    /** What lands on the clipboard. A function so a large body is only built when asked for. */
    text: string | (() => string);
    label: string;
    title?: string;
}

type State = "idle" | "copied" | "failed";

/**
 * Copies to the clipboard and says so for a moment. The confirmation matters here: a copy is
 * invisible otherwise, and there is no way to tell a working button from a dead one.
 */
export function CopyButton({ text, label, title }: CopyButtonProps) {
    const [state, setState] = useState<State>("idle");

    useEffect(() => {
        if (state === "idle") return;
        const timer = window.setTimeout(() => setState("idle"), 1400);
        return () => window.clearTimeout(timer);
    }, [state]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
            setState("copied");
        } catch {
            // Clipboard access can be refused, which is worth saying rather than swallowing.
            setState("failed");
        }
    }

    return (
        <button type="button" className="btn btn--ghost" onClick={() => void copy()} title={title ?? label}>
            {/* The mark answers the same question the text does, so it follows the state too. */}
            <Icon name={state === "failed" ? "cross" : state === "copied" ? "check" : "copy"} />
            {state === "idle" ? label : state === "copied" ? "Copied" : "Copy failed"}
        </button>
    );
}
