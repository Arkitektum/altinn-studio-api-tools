import type { DataElementInput } from "../types";
import type { Identity } from "./identity";

/**
 * Writing the test user's identity into the form, so the submission is from whoever the token is.
 *
 * A DIBK form names several parties and only one of them is the sender. Which one differs by form
 * and by whether you are acting as yourself or for a company, so the answer is a priority list:
 * the first of these the form has is the one that is you.
 *
 * The edit is made in the text rather than through a parser and a serializer. A round trip would
 * reformat the whole document, and the whole document is what you are looking at in the editor and
 * what the comparison with the stored xml is about. Everything except the values being set comes
 * out byte for byte as it went in.
 */

/** Acting as yourself. */
export const PERSON_PARTIES = ["ansvarligSoeker", "plankonsulent", "tiltakshaver", "forslagsstiller"];

/** Acting for a company, where the sender is more often a role than the applicant. */
export const ORGANISATION_PARTIES = ["ansvarligForetak", "kommune", "plankonsulent", "ansvarligSoeker", "tiltakshaver", "forslagsstiller"];

const PARTY_NAMES = [...new Set([...PERSON_PARTIES, ...ORGANISATION_PARTIES])];

/** The usual order of the children being set, for one that has to be put in rather than replaced. */
const CHILD_ORDER = ["partstype", "foedselsnummer", "organisasjonsnummer", "navn"];

/**
 * What the party calls itself.
 *
 * A person is a private person whatever the form. An organisation is an `Organisasjon` except in
 * the forms a company files as a company, where it is a `Foretak`, and in the hearing form, which
 * a municipality files as a public authority. Matched on the data type exactly, so the uttalelse
 * that answers a hearing is an ordinary organisation.
 */
export function partstypeFor(identity: Identity, dataType: string): string {
    if (identity.kind === "person") return "Privatperson";
    if (["AN", "SA", "KO"].includes(dataType)) return "Foretak";
    if (dataType === "HoeringOgOffentligEttersyn") return "Offentlig myndighet";
    return "Organisasjon";
}

interface Tag {
    name: string;
    kind: "open" | "close" | "self";
    start: number;
    end: number;
}

/** Every element tag in document order. Comments, CDATA, declarations and doctypes are stepped over. */
function tagsIn(xml: string): Tag[] {
    const found: Tag[] = [];
    let at = 0;

    while (at < xml.length) {
        const open = xml.indexOf("<", at);
        if (open === -1) break;

        const past = (marker: string): number => {
            const found = xml.indexOf(marker, open);
            return found === -1 ? xml.length : found + marker.length;
        };
        if (xml.startsWith("<!--", open)) {
            at = past("-->");
            continue;
        }
        if (xml.startsWith("<![CDATA[", open)) {
            at = past("]]>");
            continue;
        }
        if (xml.startsWith("<?", open)) {
            at = past("?>");
            continue;
        }
        if (xml.startsWith("<!", open)) {
            at = past(">");
            continue;
        }

        // The end of the tag, ignoring a ">" that sits inside an attribute value.
        let end = -1;
        let quote = "";
        for (let scan = open + 1; scan < xml.length; scan += 1) {
            const char = xml[scan] as string;
            if (quote) {
                if (char === quote) quote = "";
            } else if (char === '"' || char === "'") {
                quote = char;
            } else if (char === ">") {
                end = scan + 1;
                break;
            }
        }
        if (end === -1) break;

        const name = /^<\/?\s*([^\s/>]+)/.exec(xml.slice(open, end))?.[1];
        if (name) {
            found.push({ name, kind: xml[open + 1] === "/" ? "close" : xml[end - 2] === "/" ? "self" : "open", start: open, end });
        }
        at = end;
    }

    return found;
}

interface Element {
    name: string;
    /** The whole element, opening tag through closing tag. */
    start: number;
    end: number;
    /** What sits between the tags, an empty span for one that closes itself. */
    innerStart: number;
    innerEnd: number;
    /** The end of the opening tag, which is the whole tag for one that closes itself. */
    openEnd: number;
    selfClosing: boolean;
}

function spanning(open: Tag, close: Tag): Element {
    const selfClosing = open === close;
    return {
        name: open.name,
        start: open.start,
        end: close.end,
        innerStart: selfClosing ? open.end : open.end,
        innerEnd: selfClosing ? open.end : close.start,
        openEnd: open.end,
        selfClosing
    };
}

/** The first element with this name, at any depth. */
function findElement(tags: Tag[], name: string): Element | null {
    for (let i = 0; i < tags.length; i += 1) {
        const tag = tags[i] as Tag;
        if (tag.name !== name) continue;
        if (tag.kind === "self") return spanning(tag, tag);
        if (tag.kind === "close") continue;

        let depth = 0;
        for (let j = i; j < tags.length; j += 1) {
            const next = tags[j] as Tag;
            if (next.kind === "self") continue;
            depth += next.kind === "open" ? 1 : -1;
            if (depth === 0) return spanning(tag, next);
        }
    }
    return null;
}

/** The elements one level inside this one. */
function childrenOf(tags: Tag[], parent: Element): Element[] {
    const found: Element[] = [];
    let depth = 0;
    let open: Tag | null = null;

    for (const tag of tags) {
        if (tag.start < parent.innerStart || tag.end > parent.innerEnd) continue;
        if (tag.kind === "self") {
            if (depth === 0) found.push(spanning(tag, tag));
            continue;
        }
        if (tag.kind === "open") {
            if (depth === 0) open = tag;
            depth += 1;
            continue;
        }
        depth -= 1;
        if (depth === 0 && open) {
            found.push(spanning(open, tag));
            open = null;
        }
    }

    return found;
}

function escaped(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Where a child that is not there yet belongs, learned from the document rather than assumed.
 *
 * These forms do not agree on the order: one has `foedselsnummer` after `partstype` and another
 * has it after `navn`, and an xml schema counts the order as part of being valid. Another party
 * element in the same form is the same type as this one, so where it keeps the child is where the
 * child goes. Nothing in the form to learn from falls back to the order most of them use.
 */
function orderFor(xml: string, tags: Tag[], child: string, fallback: string[]): string[] {
    for (const name of PARTY_NAMES) {
        const party = findElement(tags, name);
        if (!party) continue;
        const names = childrenOf(tags, party).map((element) => element.name);
        if (names.includes(child) && names.length > 1) return names;
    }
    return fallback;
}

/** The indentation an existing sibling sits on, so an inserted line lands under it. */
function indentOf(xml: string, element: Element): string {
    const line = xml.lastIndexOf("\n", element.start);
    return line === -1 ? "" : xml.slice(line, element.start);
}

/**
 * Sets a child's text, putting the element in when the form does not have one.
 *
 * A value of nothing only clears what is there. There is a difference between a form that says the
 * organisation number is empty and one that does not carry the field at all, and inventing the
 * second is not this function's business.
 */
function setChild(xml: string, parent: Element, child: string, value: string, order: string[]): string {
    const tags = tagsIn(xml);
    const children = childrenOf(tags, parent);
    const existing = children.find((element) => element.name === child);

    if (existing) {
        if (existing.selfClosing) {
            // `<foedselsnummer xsi:nil="true" />` is already blank, and is no place to put a value:
            // nil and content cannot both be true, so the element is written out afresh.
            if (!value) return xml;
            return xml.slice(0, existing.start) + `<${child}>${escaped(value)}</${child}>` + xml.slice(existing.end);
        }
        // Nil says there is no value, which stops being true the moment there is one.
        const opening = xml.slice(existing.start, existing.openEnd).replace(/\s+xsi:nil="true"/, "");
        return xml.slice(0, existing.start) + opening + escaped(value) + xml.slice(existing.innerEnd);
    }

    if (!value) return xml;

    const wanted = order.indexOf(child);
    const placed = children.filter((element) => order.includes(element.name));
    const after = wanted === -1 ? undefined : [...placed].reverse().find((element) => order.indexOf(element.name) < wanted);
    const before = wanted === -1 ? undefined : placed.find((element) => order.indexOf(element.name) > wanted);
    const anchor = after ?? before ?? placed[0];
    if (!anchor) return xml;

    const line = `<${child}>${escaped(value)}</${child}>`;
    return after
        ? xml.slice(0, anchor.end) + indentOf(xml, anchor) + line + xml.slice(anchor.end)
        : xml.slice(0, anchor.start) + line + indentOf(xml, anchor) + xml.slice(anchor.start);
}

export interface Injection {
    xml: string;
    /** The party element that was rewritten, or null when the form has none of them. */
    party: string | null;
}

/**
 * Writes the identity into the first party element the form has, by the priority for its kind.
 *
 * The number goes in the field for its kind and the other one is cleared, so a form that came with
 * an organisation in it does not keep the organisation number next to a person's name. Which of
 * `Privatperson`, `Foretak`, `Organisasjon` and `Offentlig myndighet` the party is called follows
 * the kind and the data type, not what the form said before.
 */
export function injectIdentity(xml: string, identity: Identity, dataType: string): Injection {
    const priority = identity.kind === "person" ? PERSON_PARTIES : ORGANISATION_PARTIES;
    const tags = tagsIn(xml);

    // A party element that closes itself has no children to set and no schema to place them by.
    const name = priority.find((candidate) => {
        const element = findElement(tags, candidate);
        return element !== null && !element.selfClosing;
    });
    if (!name) return { xml, party: null };

    const partstype = partstypeFor(identity, dataType);
    const person = identity.kind === "person";

    const values: [string[], string][] = [
        [["partstype", "kodeverdi"], partstype],
        [["partstype", "kodebeskrivelse"], partstype],
        [["foedselsnummer"], person ? identity.number : ""],
        [["organisasjonsnummer"], person ? "" : identity.number],
        [["navn"], identity.name]
    ];

    let next = xml;
    for (const [path, value] of values) {
        // Found again for each value, since setting the last one moved everything after it. The
        // documents are a few thousand characters and this is five passes, not a loop worth
        // keeping offsets in step by hand for.
        const found = tagsIn(next);
        const party = findElement(found, name);
        if (!party) break;

        const [head, tail] = path;
        if (tail) {
            const group = childrenOf(found, party).find((element) => element.name === head);
            // Nothing to hang a kodeverdi off, and a partstype written from nothing would be a
            // guess at where it goes as well as what it says.
            if (group && !group.selfClosing) next = setChild(next, group, tail, value, ["kodeverdi", "kodebeskrivelse"]);
            continue;
        }
        next = setChild(next, party, head as string, value, orderFor(next, found, head as string, CHILD_ORDER));
    }

    return { xml: next, party: name };
}

/**
 * The payload with the identity written into every element still holding a shipped example.
 *
 * An example is data to work from, and writing the test user into it is part of loading it. Text
 * you typed or a file you picked is yours, and the `example` marker is what tells them apart: an
 * edit clears it, and the tool stops writing into that element from then on.
 *
 * The same list comes back when there is nothing to do, which is what lets this run on every
 * change without the change it makes counting as another one.
 */
export function withIdentity(elements: DataElementInput[], identity: Identity | null): DataElementInput[] {
    if (!identity) return elements;

    const next = elements.map((element) => {
        // Base64 is a file, not a form, and an empty element has nothing to write into yet.
        if (!element.example || element.encoding === "base64" || !element.content) return element;

        const { xml, party } = injectIdentity(element.content, identity, element.dataType);
        if (!party || (xml === element.content && element.identityIn === party)) return element;
        return { ...element, content: xml, identityIn: party };
    });

    return next.some((element, index) => element !== elements[index]) ? next : elements;
}
