import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { Painted, languageOf } from "./Code";
import { Modal } from "./Modal";

interface DumpProps {
    /** "Request" or "Response". Also the title of the maximized window. */
    label: string;
    text: string;
    /** Content type where one is known, so the language is not guessed from the first character. */
    contentType?: string | null;
}

/**
 * A request or response body: coloured, copyable, and openable in a window of its own.
 *
 * The log column is 480px wide, which is not enough for a form's XML. Rather than make the column
 * wider for the one case that needs it, the body opens over the tool at full size.
 */
export function Dump({ label, text, contentType }: DumpProps) {
    const [maximized, setMaximized] = useState(false);
    const language = languageOf(text, contentType);

    return (
        <>
            <div className="dump__label">
                {label}
                <CopyButton label="Copy" text={text} />
                <button type="button" className="btn btn--ghost" onClick={() => setMaximized(true)}>
                    Maximize
                </button>
            </div>
            <pre className="dump">
                <Painted text={text} language={language} />
            </pre>

            {maximized && (
                <Modal title={label} aside={<CopyButton label="Copy" text={text} />} bodyClassName="modal__code" onClose={() => setMaximized(false)}>
                    <pre className="dump dump--full">
                        <Painted text={text} language={language} />
                    </pre>
                </Modal>
            )}
        </>
    );
}
