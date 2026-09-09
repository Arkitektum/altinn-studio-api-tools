/**
 * Syntax colouring for the XML and JSON this tool shows, hand written for the same reason the
 * server's xml diff is: two formats, read-only, and a highlighter library is a large dependency
 * to take on for that.
 *
 * The one hard rule is that colouring never changes the text. Every tokenizer here is a partition
 * of the input, so joining the tokens back together returns exactly what came in, and a test
 * asserts it. That matters because what gets coloured is often broken on purpose: a request
 * preview truncated at 4000 characters, or half-typed XML in the editor.
 */

export type TokenKind =
    /** Element text, whitespace, and anything not worth naming. */
    | "text"
    | "punct"
    /** Element name in XML. */
    | "tag"
    /** Attribute name in XML, object key in JSON. */
    | "attr"
    | "string"
    | "number"
    /** true, false, null. */
    | "keyword"
    /** Comment, declaration, doctype, CDATA marker. */
    | "meta";

export interface Token {
    kind: TokenKind;
    text: string;
}

export type Language = "xml" | "json";

/**
 * Above this many characters the text is left uncoloured. The GML example alone is near a
 * megabyte, and tokenizing that on every keystroke would cost more than the colour is worth.
 */
export const HIGHLIGHT_LIMIT = 200_000;

/** Whether a name character can follow, which is deliberately loose about what XML allows. */
function isNameChar(character: string): boolean {
    return /[^\s=/>"'<]/.test(character);
}

function push(tokens: Token[], kind: TokenKind, text: string): void {
    if (!text) return;
    // Runs of the same kind are merged, so the DOM gets one span where it could have had ten.
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ kind, text });
}

/** Everything from `at` to the end of `close`, or to the end of the text when it never closes. */
function until(text: string, at: number, close: string): number {
    const found = text.indexOf(close, at);
    return found < 0 ? text.length : found + close.length;
}

export function tokenizeXml(text: string): Token[] {
    const tokens: Token[] = [];
    let at = 0;

    while (at < text.length) {
        const open = text.indexOf("<", at);
        if (open < 0) {
            push(tokens, "text", text.slice(at));
            break;
        }
        push(tokens, "text", text.slice(at, open));

        // A comment, declaration or doctype is one lump: nothing inside it is code.
        if (text.startsWith("<!--", open)) {
            const end = until(text, open + 4, "-->");
            push(tokens, "meta", text.slice(open, end));
            at = end;
            continue;
        }
        if (text.startsWith("<?", open)) {
            const end = until(text, open + 2, "?>");
            push(tokens, "meta", text.slice(open, end));
            at = end;
            continue;
        }
        // CDATA keeps its markers apart from its content, which is text and often long.
        if (text.startsWith("<![CDATA[", open)) {
            const end = until(text, open + 9, "]]>");
            push(tokens, "meta", text.slice(open, open + 9));
            push(tokens, "text", text.slice(open + 9, Math.max(open + 9, end - 3)));
            push(tokens, "meta", text.slice(Math.max(open + 9, end - 3), end));
            at = end;
            continue;
        }
        if (text.startsWith("<!", open)) {
            const end = until(text, open + 2, ">");
            push(tokens, "meta", text.slice(open, end));
            at = end;
            continue;
        }

        // A start, end or empty tag. The name is coloured, the attributes are walked.
        let cursor = open + 1;
        if (text[cursor] === "/") cursor += 1;
        push(tokens, "punct", text.slice(open, cursor));

        const nameStart = cursor;
        while (cursor < text.length && isNameChar(text[cursor] as string)) cursor += 1;
        push(tokens, "tag", text.slice(nameStart, cursor));

        while (cursor < text.length && text[cursor] !== ">") {
            const character = text[cursor] as string;
            if (/\s/.test(character)) {
                const start = cursor;
                while (cursor < text.length && /\s/.test(text[cursor] as string)) cursor += 1;
                push(tokens, "text", text.slice(start, cursor));
                continue;
            }
            if (character === '"' || character === "'") {
                // An unterminated quote runs to the end, which is what a truncated preview has.
                const end = until(text, cursor + 1, character);
                push(tokens, "string", text.slice(cursor, end));
                cursor = end;
                continue;
            }
            if (character === "=" || character === "/") {
                push(tokens, "punct", character);
                cursor += 1;
                continue;
            }
            const start = cursor;
            while (cursor < text.length && isNameChar(text[cursor] as string)) cursor += 1;
            // Not a name character and not one of the above, so take it as text and move on
            // rather than looping forever on it.
            if (cursor === start) cursor += 1;
            push(tokens, "attr", text.slice(start, cursor));
        }

        if (text[cursor] === ">") {
            push(tokens, "punct", ">");
            cursor += 1;
        }
        at = cursor;
    }

    return tokens;
}

/** Whether the next thing after `at`, whitespace aside, is a colon. That makes a string a key. */
function isKeyAhead(text: string, at: number): boolean {
    let cursor = at;
    while (cursor < text.length && /\s/.test(text[cursor] as string)) cursor += 1;
    return text[cursor] === ":";
}

export function tokenizeJson(text: string): Token[] {
    const tokens: Token[] = [];
    let at = 0;

    while (at < text.length) {
        const character = text[at] as string;

        if (/\s/.test(character)) {
            const start = at;
            while (at < text.length && /\s/.test(text[at] as string)) at += 1;
            push(tokens, "text", text.slice(start, at));
            continue;
        }

        if (character === '"') {
            let cursor = at + 1;
            while (cursor < text.length) {
                if (text[cursor] === "\\") {
                    cursor += 2;
                    continue;
                }
                if (text[cursor] === '"') {
                    cursor += 1;
                    break;
                }
                cursor += 1;
            }
            const end = Math.min(cursor, text.length);
            push(tokens, isKeyAhead(text, end) ? "attr" : "string", text.slice(at, end));
            at = end;
            continue;
        }

        if (/[-\d]/.test(character)) {
            const start = at;
            at += 1;
            while (at < text.length && /[\d.eE+-]/.test(text[at] as string)) at += 1;
            push(tokens, "number", text.slice(start, at));
            continue;
        }

        if (/[a-z]/i.test(character)) {
            const start = at;
            while (at < text.length && /[a-z]/i.test(text[at] as string)) at += 1;
            const word = text.slice(start, at);
            push(tokens, word === "true" || word === "false" || word === "null" ? "keyword" : "text", word);
            continue;
        }

        push(tokens, "punct", character);
        at += 1;
    }

    return tokens;
}

/**
 * The language of some text, by its content type where there is one and by its first character
 * otherwise. Null means leave it alone: a multipart body or an attachment read back as text is
 * not something to colour as though it were code.
 */
export function detectLanguage(text: string, contentType?: string | null): Language | null {
    const type = contentType?.toLowerCase() ?? "";
    if (type.includes("json")) return "json";
    if (type.includes("xml")) return "xml";
    // A content type that says something else, multipart included, is taken at its word.
    if (type && !type.startsWith("text/plain")) return null;

    const start = text.trimStart()[0];
    if (start === "{" || start === "[") return "json";
    if (start === "<") return "xml";
    return null;
}

/** Tokens for the whole text. Over the limit, or with no language, it is one plain run. */
export function tokenize(text: string, language: Language | null): Token[] {
    if (!text) return [];
    if (!language || text.length > HIGHLIGHT_LIMIT) return [{ kind: "text", text }];
    return language === "json" ? tokenizeJson(text) : tokenizeXml(text);
}
