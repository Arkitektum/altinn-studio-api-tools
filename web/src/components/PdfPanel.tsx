import { Panel } from "./Panel";

interface PdfPanelProps {
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    onPreviewPdf: () => void;
    busy: boolean;
    hasToken: boolean;
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
 */
export function PdfPanel({ appHost, org, app, instanceOwnerPartyId, instanceGuid, onPreviewPdf, busy, hasToken }: PdfPanelProps) {
    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    const guid = instanceGuid || "{instanceGuid}";
    const ready = hasToken && Boolean(org && app && instanceOwnerPartyId && instanceGuid);

    return (
        <Panel title="Pdf">
            <p className="field__hint" style={{ marginBottom: 10 }}>
                What the app would archive, rendered from the data as it stands. The quickest way to see what the form turns into without walking the
                process to the end. It opens in a window over the tool.
            </p>

            <button type="button" className="btn" onClick={onPreviewPdf} disabled={busy || !ready}>
                {busy && <span className="btn__spinner" />}
                Render pdf
            </button>

            <p className="field__hint" style={{ marginTop: 8 }}>
                <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/pdf/preview
            </p>
        </Panel>
    );
}
