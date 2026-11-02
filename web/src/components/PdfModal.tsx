import { Modal } from "./Modal";
import type { HeldPdf } from "./PdfPanel";

export interface PdfPreview {
    /** Blob url of the rendered pdf, for the iframe and the new tab link. */
    url: string;
    size: number;
    /** Time it was rendered, so a stale preview is obvious. */
    at: string;
    /** The instance as it was when this was rendered. See lib/pdfCache.ts. */
    fingerprint: string | null;
    /** What it is a render of, so the panel knows which button it belongs to and the window can say. */
    held: HeldPdf;
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
            title={`Pdf: ${preview.held.label}`}
            className="modal--pdf"
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
            {/*
             * The browser's own pdf viewer, pointed at the blob. Nothing is written to disk.
             *
             * At 100% rather than the viewer's own choice, which is to fit the page to the frame's
             * width and so depends on the screen: an A4 page opened at 97% in a window that was
             * nearly wide enough. `zoom` is one of the pdf open parameters Chrome's and Firefox's
             * viewers both read from the fragment. The new tab keeps the viewer's choice, since it
             * has the whole window. The window is wider than the code one so the page fits at 100%,
             * see `.modal--pdf`.
             */}
            <iframe src={`${preview.url}#zoom=100`} title="Pdf" />
        </Modal>
    );
}
