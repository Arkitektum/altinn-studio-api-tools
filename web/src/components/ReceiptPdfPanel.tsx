import { Panel } from "./Panel";

interface ReceiptPdfPanelProps {
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
 * The receipt pdf, on its own and last.
 *
 * A different kind of action from everything above it: those read data, and this renders a
 * document from it. It is also the one read that is still a button, since rendering a pdf on
 * every selection would be wasteful, and it opens in a window over the tool rather than filling
 * a panel.
 */
export function ReceiptPdfPanel({ appHost, org, app, instanceOwnerPartyId, instanceGuid, onPreviewPdf, busy, hasToken }: ReceiptPdfPanelProps) {
    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    const guid = instanceGuid || "{instanceGuid}";
    const ready = hasToken && Boolean(org && app && instanceOwnerPartyId && instanceGuid);

    return (
        <Panel title="Receipt pdf">
            <p className="field__hint" style={{ marginBottom: 10 }}>
                What the app would archive, rendered from the data as it stands. The quickest way to see what the form turns into without walking the
                process to the end. It opens in a window over the tool.
            </p>

            <button type="button" className="btn" onClick={onPreviewPdf} disabled={busy || !ready}>
                {busy && <span className="btn__spinner" />}
                Render receipt pdf
            </button>

            <p className="field__hint" style={{ marginTop: 8 }}>
                <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/pdf/preview
            </p>
        </Panel>
    );
}
