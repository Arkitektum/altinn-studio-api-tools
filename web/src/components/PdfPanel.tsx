import { Panel } from "./Panel";

export interface PdfPreview {
    /** Blob url of the rendered pdf, for the iframe and the new tab link. */
    url: string;
    size: number;
    /** Time it was rendered, so a stale preview is obvious. */
    at: string;
}

interface PdfPanelProps {
    preview: PdfPreview;
    onClear: () => void;
}

function describeSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfPanel({ preview, onClear }: PdfPanelProps) {
    return (
        <Panel
            title="Pdf preview"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    <a href={preview.url} target="_blank" rel="noreferrer" className="btn btn--ghost btn--tiny">
                        Open in new tab
                    </a>
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={onClear}>
                        Close preview
                    </button>
                    <span className="badge">
                        {describeSize(preview.size)} · {preview.at}
                    </span>
                </span>
            }
        >
            {/* The browser's own pdf viewer, pointed at the blob. Nothing is written to disk. */}
            <iframe className="pdf" src={preview.url} title="Pdf preview" />
        </Panel>
    );
}
