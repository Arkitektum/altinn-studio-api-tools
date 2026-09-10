import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
    title: string;
    /** A modifier on the window itself, for one that holds a form rather than a document. */
    className?: string;
    /** Between the title and Close: a size, a time, a copy button. */
    aside?: ReactNode;
    /** Called once the dialog has closed, however it was closed. */
    onClose: () => void;
    /** Class for the body, since a pdf fills it as an iframe and code scrolls inside it. */
    bodyClassName: string;
    children: ReactNode;
}

/**
 * A window over the tool rather than a panel inside it, for something you look at and dismiss.
 *
 * A native `<dialog>` rather than a hand-rolled overlay: Escape, the backdrop, the top layer and
 * keeping focus inside all come from the browser. One implementation, so the pdf preview and a
 * maximized code block behave the same way.
 */
export function Modal({ title, className, aside, onClose, bodyClassName, children }: ModalProps) {
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        dialog.current?.showModal();
    }, []);

    return (
        <dialog
            ref={dialog}
            className={`modal${className ? ` ${className}` : ""}`}
            // Escape and the close button both end up here, so whatever the caller holds is
            // released exactly once.
            onClose={onClose}
            // Clicking the backdrop targets the dialog itself, since the content is a child of it.
            onClick={(event) => {
                if (event.target === dialog.current) dialog.current?.close();
            }}
        >
            <div className="modal__head">
                <h2>{title}</h2>
                <span className="spacer" />
                {aside}
                <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
                    Close
                </button>
            </div>
            <div className={bodyClassName}>{children}</div>
        </dialog>
    );
}
