import type { ReactNode } from "react";

interface PanelProps {
    title: string;
    /** For the chain strip to scroll to, on the panels a chain link is set in. */
    id?: string;
    aside?: ReactNode;
    children: ReactNode;
}

export function Panel({ title, id, aside, children }: PanelProps) {
    return (
        <section className="panel" id={id}>
            <div className="panel__head">
                <h2>{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}
