/**
 * Comparing two XML documents that should say the same thing.
 *
 * The case this exists for: a form file is posted, Altinn deserialises it into the app's model
 * and serialises that model back out to storage. Anything the model does not have a place for is
 * gone, and anything it formats differently is changed, quietly. Reading the two side by side by
 * hand is slow and easy to get wrong, because they also differ in ways that mean nothing:
 * whitespace, self-closing tags, attribute order, namespace prefixes, the declaration.
 *
 * So this ignores the differences that carry no meaning and reports the ones that do.
 */

export interface XmlElement {
    /** Local name. A prefix says which namespace, not which element, so it is dropped. */
    name: string;
    attributes: Record<string, string>;
    children: XmlElement[];
    /** Non-whitespace text directly inside this element, collapsed to one string. */
    text: string;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(text: string): string {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name] ?? whole);
}

/** Prefixes name namespaces, and the two documents may well use different ones for the same one. */
function localName(name: string): string {
    const colon = name.indexOf(":");
    return colon === -1 ? name : name.slice(colon + 1);
}

/**
 * Reads XML into a tree, narrowly: elements, attributes and text, which is all Altinn form data
 * is made of. Declarations, comments, CDATA and a doctype are understood well enough to be
 * skipped or unwrapped. Processing instructions beyond the declaration, and mixed content where
 * text and elements interleave meaningfully, are not: this is a comparison tool for generated
 * form data, not a parser to build anything else on.
 */
export function parseXml(source: string): XmlElement {
    let at = 0;
    const stack: XmlElement[] = [];
    let root: XmlElement | null = null;

    const fail = (why: string): never => {
        throw new Error(`${why} at character ${at}`);
    };

    while (at < source.length) {
        const next = source.indexOf("<", at);
        if (next === -1) break;

        // Text between the previous tag and this one belongs to the element we are inside.
        if (next > at && stack.length > 0) {
            const text = decode(source.slice(at, next)).trim();
            if (text) {
                const parent = stack[stack.length - 1];
                if (parent) parent.text = parent.text ? `${parent.text} ${text}` : text;
            }
        }
        at = next;

        if (source.startsWith("<!--", at)) {
            const close = source.indexOf("-->", at);
            at = close === -1 ? source.length : close + 3;
            continue;
        }
        if (source.startsWith("<![CDATA[", at)) {
            const close = source.indexOf("]]>", at);
            const text = source.slice(at + 9, close === -1 ? source.length : close).trim();
            const parent = stack[stack.length - 1];
            if (parent && text) parent.text = parent.text ? `${parent.text} ${text}` : text;
            at = close === -1 ? source.length : close + 3;
            continue;
        }
        if (source.startsWith("<?", at) || source.startsWith("<!", at)) {
            const close = source.indexOf(">", at);
            at = close === -1 ? source.length : close + 1;
            continue;
        }

        const close = source.indexOf(">", at);
        if (close === -1) fail("Unclosed tag");
        const raw = source.slice(at + 1, close);
        at = close + 1;

        if (raw.startsWith("/")) {
            const closing = stack.pop();
            if (!closing) fail(`Closing tag </${raw.slice(1)}> with nothing open`);
            if (closing && localName(closing.name) !== localName(raw.slice(1).trim())) {
                fail(`Closing tag </${raw.slice(1).trim()}> does not match <${closing.name}>`);
            }
            continue;
        }

        const selfClosing = raw.endsWith("/");
        const body = selfClosing ? raw.slice(0, -1) : raw;
        const nameEnd = body.search(/[\s/]/);
        const element: XmlElement = {
            name: localName(nameEnd === -1 ? body : body.slice(0, nameEnd)),
            attributes: {},
            children: [],
            text: ""
        };

        // Attributes, quoted either way. xmlns declarations are about prefixes, not content.
        for (const match of (nameEnd === -1 ? "" : body.slice(nameEnd)).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
            const attribute = match[1] ?? "";
            if (attribute === "xmlns" || attribute.startsWith("xmlns:")) continue;
            element.attributes[localName(attribute)] = decode(match[3] ?? match[4] ?? "");
        }

        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(element);
        else if (root) fail("A second root element");
        else root = element;

        if (!selfClosing) stack.push(element);
    }

    if (!root) throw new Error("No element found: this does not look like XML");
    if (stack.length > 0) throw new Error(`Unclosed element <${stack[stack.length - 1]?.name}>`);
    return root;
}

export type XmlDifferenceKind = "missing" | "added" | "changed";

export interface XmlDifference {
    /** Where it is, as a path of local names: /ettrinn/eiendom[2]/adresse, or @attribute. */
    path: string;
    /** missing: in the left and not the right. added: the other way. changed: different value. */
    kind: XmlDifferenceKind;
    left: string | null;
    right: string | null;
}

/** Repeated siblings are told apart by position, and a lone one needs no index. */
function childPath(parent: string, name: string, index: number, total: number): string {
    return total > 1 ? `${parent}/${name}[${index + 1}]` : `${parent}/${name}`;
}

function groupByName(children: XmlElement[]): Map<string, XmlElement[]> {
    const groups = new Map<string, XmlElement[]>();
    for (const child of children) {
        const held = groups.get(child.name);
        if (held) held.push(child);
        else groups.set(child.name, [child]);
    }
    return groups;
}

function describe(element: XmlElement): string {
    return element.children.length > 0 ? `<${element.name}> with ${element.children.length} child element(s)` : element.text || "empty";
}

function compare(left: XmlElement, right: XmlElement, path: string, found: XmlDifference[]): void {
    if (left.text !== right.text) {
        found.push({ path, kind: "changed", left: left.text || null, right: right.text || null });
    }

    for (const [name, value] of Object.entries(left.attributes)) {
        if (!(name in right.attributes)) found.push({ path: `${path}/@${name}`, kind: "missing", left: value, right: null });
        else if (right.attributes[name] !== value) {
            found.push({ path: `${path}/@${name}`, kind: "changed", left: value, right: right.attributes[name] ?? null });
        }
    }
    for (const [name, value] of Object.entries(right.attributes)) {
        if (!(name in left.attributes)) found.push({ path: `${path}/@${name}`, kind: "added", left: null, right: value });
    }

    const leftGroups = groupByName(left.children);
    const rightGroups = groupByName(right.children);

    for (const [name, leftChildren] of leftGroups) {
        const rightChildren = rightGroups.get(name) ?? [];
        const total = Math.max(leftChildren.length, rightChildren.length);
        for (let index = 0; index < total; index++) {
            const leftChild = leftChildren[index];
            const rightChild = rightChildren[index];
            const here = childPath(path, name, index, total);
            if (leftChild && rightChild) compare(leftChild, rightChild, here, found);
            else if (leftChild) found.push({ path: here, kind: "missing", left: describe(leftChild), right: null });
            else if (rightChild) found.push({ path: here, kind: "added", left: null, right: describe(rightChild) });
        }
    }

    for (const [name, rightChildren] of rightGroups) {
        if (leftGroups.has(name)) continue;
        rightChildren.forEach((child, index) => {
            found.push({
                path: childPath(path, name, index, rightChildren.length),
                kind: "added",
                left: null,
                right: describe(child)
            });
        });
    }
}

export interface XmlDiff {
    /** True when the two say the same thing, whatever they look like. */
    same: boolean;
    differences: XmlDifference[];
}

/**
 * What the right document says differently from the left.
 *
 * Left is the file as written, right is what came back. So "missing" means the model dropped it,
 * and "added" means the model produced something the file did not have, which is usually a
 * defaulted value.
 */
export function diffXml(left: string, right: string): XmlDiff {
    const leftRoot = parseXml(left);
    const rightRoot = parseXml(right);
    const differences: XmlDifference[] = [];

    if (leftRoot.name !== rightRoot.name) {
        differences.push({ path: "/", kind: "changed", left: `<${leftRoot.name}>`, right: `<${rightRoot.name}>` });
    }
    compare(leftRoot, rightRoot, `/${leftRoot.name}`, differences);

    return { same: differences.length === 0, differences };
}

/**
 * Splits differences into the ones that mean something and a count of Altinn's row ids.
 *
 * Altinn stamps every row of a repeating group with an `altinnRowId`, so the stored xml has one
 * per row and a file written by hand has none. Left in, they are the majority of any report.
 * Mirrors `partitionDifferences` in `web/src/lib/differences.ts`, which does the same for the
 * panel, where it is a toggle rather than a rule.
 */
export function partitionRowIds<T extends XmlDifference>(differences: T[]): { meaningful: T[]; rowIds: number } {
    const meaningful = differences.filter((difference) => !difference.path.toLowerCase().endsWith("@altinnrowid"));
    return { meaningful, rowIds: differences.length - meaningful.length };
}
