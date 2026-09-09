import { useRef, useState } from "react";
import { Painted, languageOf } from "./Code";
import { Modal } from "./Modal";
import type { Language } from "../lib/highlight";

interface SurfaceProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    language: Language | null;
    /** Fill the height available, which is what the maximized window wants. */
    tall?: boolean;
}

/**
 * The editable surface: a coloured copy of the text with a transparent textarea over it.
 *
 * The textarea stays a real textarea, so typing, undo, selection, spellcheck and the caret are
 * all the browser's, and only the colour is ours. What that costs is keeping the two layers
 * pixel-aligned: identical font, size, line height, padding, border and wrapping, which the
 * stylesheet declares in one rule for both, and the scroll position, synced here.
 */
function Surface({ id, value, onChange, placeholder, language, tall }: SurfaceProps) {
    const paint = useRef<HTMLPreElement>(null);

    return (
        <div className={`editor${tall ? " editor--tall" : ""}`}>
            <pre className="editor__paint" ref={paint} aria-hidden="true">
                <Painted text={value} language={language} />
                {/*
                 * A trailing newline, so the painted layer is as tall as the textarea when the
                 * text ends in one, and the last line can be scrolled fully into view.
                 */}
                {"\n"}
            </pre>
            <textarea
                id={id}
                className="editor__input"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onScroll={(event) => {
                    const layer = paint.current;
                    if (!layer) return;
                    layer.scrollTop = event.currentTarget.scrollTop;
                    layer.scrollLeft = event.currentTarget.scrollLeft;
                }}
                placeholder={placeholder}
                spellCheck={false}
            />
        </div>
    );
}

interface CodeEditorProps {
    id: string;
    /** Its own label, so the maximize button can share the label's line rather than take one. */
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    contentType?: string | null;
}

export function CodeEditor({ id, label, value, onChange, placeholder, contentType }: CodeEditorProps) {
    const [maximized, setMaximized] = useState(false);
    const language = languageOf(value, contentType);

    return (
        <>
            <div className="editor__bar">
                <label htmlFor={id}>{label}</label>
                <span className="spacer" />
                {/* Says what it is colouring, and says nothing when it is not colouring at all. */}
                {language && <span className="badge">{language}</span>}
                <button type="button" className="btn btn--ghost" onClick={() => setMaximized(true)}>
                    Maximize
                </button>
            </div>

            <Surface id={id} value={value} onChange={onChange} placeholder={placeholder} language={language} />

            {/*
             * The same editor, larger. It edits the same state, so what is typed here is there on
             * close, and the panel behind needs no reconciling.
             */}
            {maximized && (
                <Modal title={label} bodyClassName="modal__code" onClose={() => setMaximized(false)}>
                    <Surface id={`${id}-maximized`} value={value} onChange={onChange} placeholder={placeholder} language={language} tall />
                </Modal>
            )}
        </>
    );
}
