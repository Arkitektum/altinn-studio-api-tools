import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { HttpError } from "./httpError.js";
import { fetchTestmotorApps, fetchTestmotorFormXml, testmotorConfigured, type TestmotorXmlFile } from "./testmotorClient.js";

export type ExampleKind = "form" | "subform" | "attachment";

/** Directory name on disk for each kind. */
const KIND_DIRS: Record<ExampleKind, string> = {
    form: "forms",
    subform: "subforms",
    attachment: "attachments"
};

export type ExampleEncoding = "utf8" | "base64";

interface FormatInfo {
    /**
     * Content types this file can be posted as. The first is the canonical one. Aliases matter
     * because apps declare whichever spelling they prefer, such as text/xml over application/xml.
     */
    contentTypes: string[];
    encoding: ExampleEncoding;
}

/**
 * How each example file extension is posted. Binary formats travel as base64 and are decoded
 * again before the request goes to Altinn. Dropping a new file into the examples directory is
 * enough to offer it, as long as its extension is listed here.
 */
const FORMATS: Record<string, FormatInfo> = {
    // Text formats
    xml: { contentTypes: ["application/xml", "text/xml"], encoding: "utf8" },
    json: { contentTypes: ["application/json", "text/json"], encoding: "utf8" },
    txt: { contentTypes: ["text/plain"], encoding: "utf8" },
    csv: { contentTypes: ["text/csv", "application/csv"], encoding: "utf8" },
    html: { contentTypes: ["text/html"], encoding: "utf8" },
    md: { contentTypes: ["text/markdown"], encoding: "utf8" },
    svg: { contentTypes: ["image/svg+xml"], encoding: "utf8" },

    // Geodata. Registered under their own content types rather than as plain xml or json, so a
    // large GML does not become the default for every xml attachment.
    gml: { contentTypes: ["application/gml+xml"], encoding: "utf8" },
    geojson: {
        contentTypes: ["application/geo+json", "application/vnd.geo+json"],
        encoding: "utf8"
    },
    rtf: { contentTypes: ["application/rtf", "text/rtf"], encoding: "utf8" },

    // Documents
    pdf: { contentTypes: ["application/pdf"], encoding: "base64" },
    docx: {
        contentTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        encoding: "base64"
    },
    xlsx: {
        contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        encoding: "base64"
    },
    odt: { contentTypes: ["application/vnd.oasis.opendocument.text"], encoding: "base64" },
    ods: { contentTypes: ["application/vnd.oasis.opendocument.spreadsheet"], encoding: "base64" },

    // Images
    png: { contentTypes: ["image/png"], encoding: "base64" },
    jpg: { contentTypes: ["image/jpeg"], encoding: "base64" },
    jpeg: { contentTypes: ["image/jpeg"], encoding: "base64" },
    gif: { contentTypes: ["image/gif"], encoding: "base64" },
    bmp: { contentTypes: ["image/bmp", "image/x-ms-bmp"], encoding: "base64" },
    webp: { contentTypes: ["image/webp"], encoding: "base64" },
    tif: { contentTypes: ["image/tiff"], encoding: "base64" },
    tiff: { contentTypes: ["image/tiff"], encoding: "base64" },

    // Catch-alls
    zip: { contentTypes: ["application/zip", "application/x-zip-compressed"], encoding: "base64" },
    bin: { contentTypes: ["application/octet-stream"], encoding: "base64" }
};

export interface ExampleFile {
    name: string;
    /** "01_Maksimumsversjon.xml" reads as "Maksimumsversjon". */
    label: string;
    sizeBytes: number;
    contentType: string;
    encoding: ExampleEncoding;
}

export interface ExampleGroup {
    kind: ExampleKind;
    /** Data type id for forms and subforms. Content type for attachments. */
    key: string;
    files: ExampleFile[];
}

function formatOf(fileName: string): FormatInfo | null {
    const extension = fileName.toLowerCase().split(".").pop();
    return extension ? (FORMATS[extension] ?? null) : null;
}

/** Strips the numeric ordering prefix and the extension, keeping the whole stem otherwise. */
function toLabel(fileName: string): string {
    return fileName
        .replace(/\.[^.]+$/, "")
        .replace(/^\d+[_-]\s*/, "")
        .trim();
}

async function describe(dir: string, fileName: string): Promise<ExampleFile | null> {
    const format = formatOf(fileName);
    if (!format) return null;
    const info = await stat(path.join(dir, fileName));
    return {
        name: fileName,
        label: toLabel(fileName),
        sizeBytes: info.size,
        contentType: format.contentTypes[0] ?? "application/octet-stream",
        encoding: format.encoding
    };
}

async function listFiles(dir: string): Promise<ExampleFile[]> {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const files = await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => describe(dir, entry.name)));
    return files.filter((file): file is ExampleFile => file !== null).sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/** Forms and subforms are one group per data type, taken from the directory name. */
async function readFormGroups(kind: "form" | "subform"): Promise<ExampleGroup[]> {
    const root = path.join(config.exampleDataDir, KIND_DIRS[kind]);
    let dataTypeDirs: string[];
    try {
        const entries = await readdir(root, { withFileTypes: true });
        dataTypeDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }

    const groups = await Promise.all(
        dataTypeDirs.map(async (key): Promise<ExampleGroup> => ({
            kind,
            key,
            files: await listFiles(path.join(root, key))
        }))
    );
    return groups.filter((group) => group.files.length > 0).sort((a, b) => a.key.localeCompare(b.key, "nb"));
}

/**
 * Attachments live in one flat directory and are grouped by the content type their extension
 * implies, because that is what a data type's allowedContentTypes can be matched against.
 */
async function readAttachmentGroups(): Promise<ExampleGroup[]> {
    const files = await listFiles(path.join(config.exampleDataDir, KIND_DIRS.attachment));
    const byContentType = new Map<string, ExampleFile[]>();
    for (const file of files) {
        // One file lands in a group per content type it can be posted as, so an app that declares
        // text/xml is served by the same dummy as one that declares application/xml.
        for (const contentType of formatOf(file.name)?.contentTypes ?? []) {
            const entry: ExampleFile = { ...file, contentType };
            const bucket = byContentType.get(contentType);
            if (bucket) bucket.push(entry);
            else byContentType.set(contentType, [entry]);
        }
    }
    return [...byContentType.entries()]
        .map(([key, groupFiles]): ExampleGroup => ({ kind: "attachment", key, files: groupFiles }))
        .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * A main form example as the testmotor answers it, described the way a file on disk would be.
 *
 * The stem arrives without its extension, so the `.xml` is put back: the name is what gets asked
 * for again, and everything downstream reads the content type off the extension.
 */
function describeRemote(file: TestmotorXmlFile): ExampleFile {
    return {
        name: `${file.name}.xml`,
        label: file.name,
        sizeBytes: Buffer.byteLength(file.contents, "utf8"),
        contentType: "application/xml",
        encoding: "utf8"
    };
}

/** The data type the testmotor files an app's main form under, or null if it does not hold the app. */
async function remoteFormDataType(app: string): Promise<string | null> {
    if (!app || !testmotorConfigured()) return null;
    const apps = await fetchTestmotorApps();
    return apps.find((entry) => entry.appId === app)?.mainFormId ?? null;
}

/** Where the main form examples came from, so a page that got none can say why. */
export interface RemoteFormSource {
    url: string;
    /** The app they were asked for. Main form examples are only main form examples of something. */
    app: string;
    /** Null when the fetch worked, including when the testmotor simply does not hold this app. */
    error: string | null;
}

export interface ExampleCatalogue {
    /** Where the examples that are still on disk are read from. */
    dir: string;
    groups: ExampleGroup[];
    /** Null when no app is selected, or when the testmotor is switched off. */
    remote: RemoteFormSource | null;
}

/**
 * Every example on offer for one app.
 *
 * Subforms and attachment dummies come off disk, keyed the way they always were. The main form
 * comes from the testmotor, which is why this takes an app at all: the testmotor is keyed by app
 * id, and it has to be, since fa-v3 and fa-v5 are both filed under the data type FA and hold
 * different data. An app the testmotor does not know, which is every subform app and the two
 * uttalelse forms, simply contributes no remote group and is served from disk as before.
 *
 * A testmotor that cannot be reached is reported rather than thrown. The attachment dummies and
 * the subforms are still worth having, and the page can say what happened to the rest.
 */
export async function listExamples(app = ""): Promise<ExampleCatalogue> {
    const [forms, subforms, attachments] = await Promise.all([readFormGroups("form"), readFormGroups("subform"), readAttachmentGroups()]);
    const disk = [...forms, ...subforms, ...attachments];

    if (!app || !testmotorConfigured()) {
        return { dir: config.exampleDataDir, groups: disk, remote: null };
    }

    const remote: RemoteFormSource = { url: config.testmotorUrl, app, error: null };
    let group: ExampleGroup | null = null;
    try {
        const dataType = await remoteFormDataType(app);
        if (dataType) {
            const files = (await fetchTestmotorFormXml(app)).map(describeRemote);
            if (files.length > 0) group = { kind: "form", key: dataType, files };
        }
    } catch (error) {
        remote.error = error instanceof Error ? error.message : String(error);
    }

    // Ahead of the disk groups, so a data type that somehow has both is served the fresh copy.
    return { dir: config.exampleDataDir, groups: group ? [group, ...disk] : disk, remote };
}

export interface ExampleContent {
    name: string;
    content: string;
    encoding: ExampleEncoding;
    contentType: string;
    sizeBytes: number;
}

/**
 * Resolve an example file, refusing anything that escapes the example root. The group and file
 * name arrive from the client, so `..` and absolute paths have to be rejected rather than merely
 * discouraged.
 *
 * `group` is the data type directory for forms and subforms. Attachments are flat, so for them
 * it is not part of the path at all, and instead names the content type to post the file as.
 *
 * `app` is what decides whether a form example is the testmotor's or the disk's. When the
 * testmotor holds the app, it is the only source asked: the disk copies of those forms were
 * removed, and falling back to one that is not there would only turn a clear error into a 404.
 */
export async function readExample(kind: ExampleKind, group: string, fileName: string, app = ""): Promise<ExampleContent> {
    if (!(kind in KIND_DIRS)) {
        throw new HttpError(400, `Unknown example kind "${kind}".`);
    }
    const format = formatOf(fileName);
    if (!format) {
        throw new HttpError(400, `Cannot read "${fileName}". Known example formats: ${Object.keys(FORMATS).join(", ")}.`);
    }

    if (kind === "form" && app && testmotorConfigured()) {
        let files: TestmotorXmlFile[] | null = null;
        try {
            files = (await remoteFormDataType(app)) ? await fetchTestmotorFormXml(app) : null;
        } catch (error) {
            throw new HttpError(
                502,
                `Could not read the examples for ${app} from the testmotor: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        if (files) {
            const file = files.find((entry) => `${entry.name}.xml` === fileName);
            if (!file) {
                throw new HttpError(404, `The testmotor has no example "${fileName}" for ${app}.`);
            }
            const described = describeRemote(file);
            return {
                name: described.name,
                content: file.contents,
                encoding: described.encoding,
                contentType: described.contentType,
                sizeBytes: described.sizeBytes
            };
        }
    }

    const root = path.resolve(config.exampleDataDir, KIND_DIRS[kind]);
    const relative = kind === "attachment" ? fileName : path.join(group, fileName);
    const target = path.resolve(root, relative);
    if (target !== path.join(root, relative) || !target.startsWith(root + path.sep)) {
        throw new HttpError(400, "Invalid example path.");
    }

    // For attachments the group is the content type asked for. Honour it when the file supports
    // it, so an app that declares text/xml gets text/xml back rather than application/xml.
    const contentType = kind === "attachment" && format.contentTypes.includes(group) ? group : (format.contentTypes[0] ?? "application/octet-stream");

    try {
        const [buffer, info] = await Promise.all([readFile(target), stat(target)]);
        return {
            name: fileName,
            content: buffer.toString(format.encoding),
            encoding: format.encoding,
            contentType,
            sizeBytes: info.size
        };
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
            throw new HttpError(404, `No example "${fileName}" for "${group || kind}".`);
        }
        throw error;
    }
}
