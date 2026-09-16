import type { ReactNode } from "react";

/**
 * Which surface the panel sits on. One per panel in the column you work down, see the `--panel-*`
 * block in styles.css. The two in the sidebar have none: a column of its own is separation enough.
 */
export type PanelTone = "user" | "target" | "instances" | "payload" | "prevalidation" | "post" | "element" | "pdf" | "process";

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
    /**
     * Why this panel cannot be used yet, or null when it can.
     *
     * Rendered in place of the controls rather than beside them, so a panel that is waiting cannot
     * be half operated. One place decides how waiting looks, which is the reason this is a prop
     * here rather than each panel drawing its own.
     */
    notReady?: string | null;
    children: ReactNode;
}

export function Panel({ title, id, tone, aside, notReady, children }: PanelProps) {
    return (
        <section className={`panel${tone ? ` panel--${tone}` : ""}${notReady ? " panel--waiting" : ""}`} id={id}>
            <div className="panel__head">
                <h2>{title}</h2>
                {!notReady && aside}
            </div>
            {notReady ? <p className="panel__waiting">{notReady}</p> : children}
        </section>
    );
}
