import { useEffect, useRef } from "react";

export interface PdfPreview {
    /** Blob url of the rendered pdf, for the iframe and the new tab link. */
    url: string;
    size: number;
    /** Time it was rendered, so a stale preview is obvious. */
    at: string;
}

interface PdfModalProps {
    preview: PdfPreview;
    onClose: () => void;
}

function describeSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The rendered pdf, over the tool rather than under it. It is something you look at and dismiss,
 * so it does not belong in the column with the panels you work in.
 *
 * A native `<dialog>` rather than a hand-rolled overlay: Escape, the backdrop, the top layer and
 * keeping focus inside all come from the browser.
 */
export function PdfModal({ preview, onClose }: PdfModalProps) {
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        dialog.current?.showModal();
    }, []);

    return (
        <dialog
            ref={dialog}
            className="modal"
            // Escape and the close button both end up here, so the held preview is released once.
            onClose={onClose}
            // Clicking the backdrop targets the dialog itself, since the content is a child of it.
            onClick={(event) => {
                if (event.target === dialog.current) dialog.current?.close();
            }}
        >
            <div className="modal__head">
                <h2>Pdf</h2>
                <span className="spacer" />
                <span className="badge">
                    {describeSize(preview.size)} · {preview.at}
                </span>
                <a href={preview.url} target="_blank" rel="noreferrer" className="btn btn--ghost">
                    Open in new tab
                </a>
                <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
                    Close
                </button>
            </div>

            {/* The browser's own pdf viewer, pointed at the blob. Nothing is written to disk. */}
            <iframe className="modal__body" src={preview.url} title="Pdf" />
        </dialog>
    );
}
