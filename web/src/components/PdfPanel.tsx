import { useTarget } from "../session";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { PdfStand } from "../lib/pdfCache";

interface PdfPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** Where the pdf in hand stands against the instance. See lib/pdfCache.ts. */
    stand: PdfStand;
    /** Ask the app to render, whatever is held. */
    onRender: () => void;
    /** Open the pdf already in hand, without asking again. */
    onShow: () => void;
    busy: boolean;
    hasToken: boolean;
    /** A render that never reached the app. One the app refused is a step in the log instead. */
    error: unknown;
}

/**
 * The pdf the app would archive, on its own and last.
 *
 * Not called the receipt pdf, which is what Altinn calls it, because some of the forms are
 * themselves receipts and the word would then mean two things a line apart.
 *
 * A different kind of action from everything above it: those read data, and this renders a
 * document from it. It is also the one read that is still a button, since rendering a pdf on
 * every selection would be wasteful, and it opens in a window over the tool rather than filling
 * a panel.
 *
 * What the buttons offer is the whole of the cache, said out loud. A render already in hand that
 * still describes the instance is shown rather than asked for again, and the panel says so rather
 * than quietly not making a request: a tool whose whole point is the run log should not have an
 * action that sometimes logs nothing without explaining itself.
 */
export function PdfPanel({ notReady, stand, onRender, onShow, busy, hasToken, error }: PdfPanelProps) {
    const { instance, org, app, partyId, instanceGuid } = useTarget();
    const ready = hasToken && Boolean(org && app && partyId && instanceGuid);
    const current = stand === "current";

    return (
        <Panel id="panel-pdf" notReady={notReady} title="Pdf" tone="pdf">
            <p className="field__hint" style={{ marginBottom: 10 }}>
                What the app would archive, rendered from the data as it stands. The quickest way to see what the form turns into without walking the
                process to the end. It opens in a window over the tool.
            </p>

            <div className="row">
                <button type="button" className="btn btn--get" onClick={current ? onShow : onRender} disabled={busy || !ready}>
                    {busy && <span className="btn__spinner" />}
                    {current ? "Show pdf" : "Render pdf"}
                </button>

                {/* The other half of the choice, offered only where it is a different thing to do. */}
                {current && (
                    <button type="button" className="btn btn--ghost" onClick={onRender} disabled={busy || !ready}>
                        Render again
                    </button>
                )}
                {stand === "stale" && (
                    <button type="button" className="btn btn--ghost" onClick={onShow} disabled={busy}>
                        Show the last one
                    </button>
                )}
            </div>

            <p className="field__hint" style={{ marginTop: 8 }}>
                {current ? (
                    <>
                        Nothing has changed on the instance since this was rendered, so <strong>Show pdf</strong> opens the one in hand and asks the
                        app for nothing.
                        <br />
                    </>
                ) : null}
                {stand === "stale" ? (
                    <>
                        The instance has changed since the last render, so that pdf describes what it was rather than what it is.
                        <br />
                    </>
                ) : null}
                <span className="method method--get">GET</span> {instance}/pdf/preview
            </p>

            {error ? (
                <div style={{ marginTop: 10 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
