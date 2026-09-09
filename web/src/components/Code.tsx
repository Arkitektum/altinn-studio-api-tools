import { Fragment, useMemo } from "react";
import { detectLanguage, tokenize, type Language } from "../lib/highlight";

interface PaintedProps {
    text: string;
    language: Language | null;
}

/**
 * The text as coloured spans. Whatever else is around it, this is the only thing that turns tokens
 * into DOM, so the view and the editor's paint layer cannot drift apart.
 *
 * A "text" token is emitted bare rather than in a span. It is the commonest kind by far, being
 * element content and every run of whitespace, and it needs no colour of its own.
 */
export function Painted({ text, language }: PaintedProps) {
    const tokens = useMemo(() => tokenize(text, language), [text, language]);

    return (
        <>
            {tokens.map((token, index) =>
                token.kind === "text" ? (
                    <Fragment key={index}>{token.text}</Fragment>
                ) : (
                    <span key={index} className={`tok tok--${token.kind}`}>
                        {token.text}
                    </span>
                )
            )}
        </>
    );
}

/** Resolves the language once, so a caller can pass a content type or nothing at all. */
export function languageOf(text: string, contentType?: string | null, language?: Language | null): Language | null {
    return language !== undefined ? language : detectLanguage(text, contentType);
}
