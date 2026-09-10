import { CopyButton } from "./CopyButton";
import { Painted, languageOf } from "./Code";

interface DumpProps {
    /** "Request" or "Response". */
    label: string;
    text: string;
    /** Content type where one is known, so the language is not guessed from the first character. */
    contentType?: string | null;
}

/**
 * A request or response body, coloured, inside the window its step opens.
 *
 * The copy sits in the body's own top right corner rather than on a row of its own. A row costs a
 * button's height above every body, and what the window is for is the bodies. It stays put while
 * the body scrolls under it, since it belongs to the block and not to the text.
 */
export function Dump({ label, text, contentType }: DumpProps) {
    return (
        <>
            <div className="dump__label">{label}</div>
            <div className="dump__body">
                <pre className="dump">
                    <Painted text={text} language={languageOf(text, contentType)} />
                </pre>
                <span className="dump__copy">
                    <CopyButton label="Copy" text={text} />
                </span>
            </div>
        </>
    );
}
