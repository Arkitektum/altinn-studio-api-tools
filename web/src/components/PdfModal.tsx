import { Modal } from "./Modal";

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
 * The window itself is `Modal`, shared with a maximized code block.
 */
export function PdfModal({ preview, onClose }: PdfModalProps) {
    return (
        <Modal
            title="Pdf"
            aside={
                <>
                    <span className="badge">
                        {describeSize(preview.size)} · {preview.at}
                    </span>
                    <a href={preview.url} target="_blank" rel="noreferrer" className="btn btn--ghost">
                        Open in new tab
                    </a>
                </>
            }
            bodyClassName="modal__frame"
            onClose={onClose}
        >
            {/* The browser's own pdf viewer, pointed at the blob. Nothing is written to disk. */}
            <iframe src={preview.url} title="Pdf" />
        </Modal>
    );
}
