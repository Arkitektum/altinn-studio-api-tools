import type { ReactNode } from "react";

/**
 * Which surface the panel sits on. One per panel in the column you work down, see the `--panel-*`
 * block in styles.css. The two in the sidebar have none: a column of its own is separation enough.
 */
export type PanelTone = "user" | "target" | "instances" | "payload" | "element" | "pdf" | "process";

interface PanelProps {
    title: string;
    /** For the chain strip to scroll to, on the panels a chain link is set in. */
    id?: string;
    /**
     * Its own surface, a hue apart from its neighbours at the same lightness. The panels were the
     * page colour inside a hairline, which left a column of them reading as one field.
     */
    tone?: PanelTone;
    aside?: ReactNode;
    children: ReactNode;
}

export function Panel({ title, id, tone, aside, children }: PanelProps) {
    return (
        <section className={`panel${tone ? ` panel--${tone}` : ""}`} id={id}>
            <div className="panel__head">
                <h2>{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}
