import type { DataElementInput, ExampleContent, ExampleRef, SavedElement, SavedPayload } from "../types";

/**
 * Saving and restoring a whole payload: the list of elements, under a name, for later.
 *
 * The one decision worth stating is what gets kept. An element still holding an unedited example
 * is kept as a reference to that file, not as a copy of its text, so a payload saved today posts
 * the corrected file tomorrow. That is the common case here, since the examples are the shipped
 * test data and a saved payload is usually a combination of them rather than a document. Anything
 * edited, typed or picked off disk has no file to point at, so its text is kept.
 */

/** How an example is addressed, for the map of what has been read back. */
export function refKey(ref: ExampleRef): string {
    return `${ref.kind}/${ref.group}/${ref.name}`;
}

/** Names an example the way the panel says it, for a message about one that has gone. */
export function refLabel(ref: ExampleRef): string {
    return `${ref.name} (${ref.group})`;
}

export function toSavedElement(element: DataElementInput): SavedElement {
    return {
        dataType: element.dataType,
        ...(element.contentType ? { contentType: element.contentType } : {}),
        ...(element.filename ? { filename: element.filename } : {}),
        ...(element.encoding ? { encoding: element.encoding } : {}),
        // A reference where there is one, and only then the text. Keeping both would be keeping a
        // copy that the reference exists to avoid.
        ...(element.example ? { example: element.example } : { content: element.content })
    };
}

export function toSavedPayload(input: {
    id: string;
    name: string;
    savedAt: string;
    org: string;
    app: string;
    elements: DataElementInput[];
}): SavedPayload {
    return {
        id: input.id,
        name: input.name.trim(),
        savedAt: input.savedAt,
        org: input.org,
        app: input.app,
        elements: input.elements.map(toSavedElement)
    };
}

/** The examples a saved payload has to read before it can be restored, each asked for once. */
export function neededExamples(saved: SavedPayload): ExampleRef[] {
    const seen = new Set<string>();
    const refs: ExampleRef[] = [];
    for (const element of saved.elements) {
        if (!element.example || seen.has(refKey(element.example))) continue;
        seen.add(refKey(element.example));
        refs.push(element.example);
    }
    return refs;
}

export interface Restored {
    elements: DataElementInput[];
    /** Examples the payload pointed at that are no longer on disk, named for the notice. */
    missing: string[];
}

/**
 * A saved payload as payload elements again.
 *
 * The file is authoritative for everything it knows about itself, its content type included: an
 * example that changed from `text/xml` to `application/xml` should come back as what it is now,
 * which is the whole point of keeping a reference. An example that has gone leaves its element
 * behind, empty and with its data type, rather than dropping the element: what was meant to be
 * there is a data type and a gap, and a payload one element short would post silently.
 */
export function restoreElements(saved: SavedPayload, examples: Map<string, ExampleContent>): Restored {
    const missing: string[] = [];

    const elements = saved.elements.map((element): DataElementInput => {
        // Marked, so the example picker does not load its first file into an element this payload
        // meant to leave empty.
        const base = { dataType: element.dataType, restored: true as const };
        if (!element.example) {
            return {
                ...base,
                content: element.content ?? "",
                ...(element.encoding ? { encoding: element.encoding } : {}),
                ...(element.contentType ? { contentType: element.contentType } : {}),
                ...(element.filename ? { filename: element.filename } : {})
            };
        }

        const file = examples.get(refKey(element.example));
        if (!file) {
            missing.push(refLabel(element.example));
            return { ...base, content: "", ...(element.contentType ? { contentType: element.contentType } : {}) };
        }

        return {
            ...base,
            content: file.content,
            encoding: file.encoding,
            contentType: file.contentType,
            // Altinn stores this as the data element filename, which an attachment wants and form
            // data does not, the same rule the example picker follows.
            ...(element.example.kind === "attachment" ? { filename: file.name } : {}),
            exampleName: file.name,
            example: element.example
        };
    });

    return { elements, missing };
}

/** Newest first, and one payload per name: saving over a name replaces what was there. */
export function upsertPayload(saved: SavedPayload[], payload: SavedPayload): SavedPayload[] {
    return [payload, ...saved.filter((held) => held.name !== payload.name)];
}

export function removePayload(saved: SavedPayload[], id: string): SavedPayload[] {
    return saved.filter((held) => held.id !== id);
}

/** The one this name would replace, so the button can say "Replace" rather than "Save". */
export function payloadNamed(saved: SavedPayload[], name: string): SavedPayload | null {
    const trimmed = name.trim();
    return trimmed ? (saved.find((held) => held.name === trimmed) ?? null) : null;
}

/**
 * Whether loading over what is there would throw away work. An untouched payload is one empty
 * element, and asking twice about that would be asking for nothing.
 */
export function loadingOverwrites(current: DataElementInput[]): boolean {
    return current.some((element) => element.content.trim().length > 0);
}
