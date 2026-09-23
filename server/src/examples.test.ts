import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { listExamples, readExample } from "./examples.js";
import { HttpError } from "./httpError.js";
import { clearTestmotorCache } from "./testmotorClient.js";

/** The two testmotor endpoints, answered from a map of path to body. A path with no entry 500s. */
function stubTestmotor(bodies: Record<string, unknown>): { paths: string[]; restore: () => void } {
    const original = globalThis.fetch;
    const paths: string[] = [];

    globalThis.fetch = (async (input: unknown) => {
        const { pathname } = new URL(String(input));
        paths.push(pathname);
        if (!(pathname in bodies)) return new Response("not found", { status: 500, statusText: "Server Error" });
        return new Response(JSON.stringify(bodies[pathname]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    return { paths, restore: () => (globalThis.fetch = original) };
}

/** What the testmotor answers for an-v2: stems with the ordering prefix and extension already off. */
const AN_APPS = [
    { appId: "an-v2", name: "Erklæring om ansvarsrett", mainFormId: "AN" },
    { appId: "fa-v5", name: "Søknad om ferdigattest", mainFormId: "FA" }
];
const AN_XML = [
    { name: "maksimum_ansvarserklaering_direkte_V2", contents: '<?xml version="1.0" encoding="utf-8"?>\n<ansvarsrett>æøå</ansvarsrett>' },
    { name: "minimum_ansvarserklaering_direkte_V2", contents: '<?xml version="1.0" encoding="utf-8"?>\n<ansvarsrett />' }
];

describe("main form examples from the testmotor", () => {
    afterEach(() => clearTestmotorCache());

    it("offers an app's main form under the data type the testmotor files it by", async () => {
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS, "/api/xml/an-v2": AN_XML });
        try {
            const { groups, remote } = await listExamples("an-v2");

            assert.deepEqual(remote, { url: "https://app-ftpb-testmotor.azurewebsites.net", app: "an-v2", error: null });

            const an = groups.find((group) => group.key === "AN");
            assert.ok(an, "expected an AN group");
            assert.equal(an.kind, "form");
            // The extension is put back, because that is what the name is looked up and typed by.
            assert.deepEqual(
                an.files.map((file) => file.name),
                ["maksimum_ansvarserklaering_direkte_V2.xml", "minimum_ansvarserklaering_direkte_V2.xml"]
            );
            assert.equal(an.files[0]?.label, "maksimum_ansvarserklaering_direkte_V2");
            assert.equal(an.files[0]?.contentType, "application/xml");
            assert.equal(an.files[0]?.encoding, "utf8");
            assert.equal(an.files[0]?.sizeBytes, Buffer.byteLength(AN_XML[0]!.contents, "utf8"));
        } finally {
            stub.restore();
        }
    });

    it("carries the reason on the remote source when the testmotor answers an error", async () => {
        // Requests go out through altinnFetch, which answers an envelope rather than throwing, so this is also what
        // proves that envelope still reaches the caller as a readable error rather than an empty list.
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS });
        try {
            const { groups, remote } = await listExamples("an-v2");

            assert.equal(remote?.app, "an-v2");
            assert.match(remote?.error ?? "", /\/api\/xml\/an-v2 answered 500 Server Error/);
            // The disk examples are unaffected by the testmotor being unhappy.
            assert.ok(groups.length > 0, "expected the disk groups to survive");
        } finally {
            stub.restore();
        }
    });

    it("keeps the order the testmotor answers in", async () => {
        // The stems arrive with their ordering prefix stripped, so sorting them here would put
        // Minimum before Maksimum by accident. The share's own order is the one the app shows.
        const reversed = [...AN_XML].reverse();
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS, "/api/xml/an-v2": reversed });
        try {
            const { groups } = await listExamples("an-v2");
            assert.deepEqual(
                groups.find((group) => group.key === "AN")?.files.map((file) => file.label),
                reversed.map((file) => file.name)
            );
        } finally {
            stub.restore();
        }
    });

    it("reads a file back verbatim, contents and all", async () => {
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS, "/api/xml/an-v2": AN_XML });
        try {
            const loaded = await readExample("form", "AN", "maksimum_ansvarserklaering_direkte_V2.xml", "an-v2");

            assert.equal(loaded.content, AN_XML[0]!.contents);
            assert.match(loaded.content, /^<\?xml version="1\.0"/);
            assert.equal(loaded.contentType, "application/xml");
            assert.equal(loaded.encoding, "utf8");
            // sizeBytes is the UTF-8 length, which exceeds the character count because of æøå.
            assert.equal(loaded.sizeBytes, Buffer.byteLength(loaded.content, "utf8"));
            assert.ok(loaded.content.length < loaded.sizeBytes, "expected multi-byte characters");
        } finally {
            stub.restore();
        }
    });

    it("404s for a file the testmotor does not have, rather than looking on disk", async () => {
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS, "/api/xml/an-v2": AN_XML });
        try {
            await assert.rejects(
                () => readExample("form", "AN", "nope.xml", "an-v2"),
                (error: unknown) => error instanceof HttpError && error.status === 404
            );
        } finally {
            stub.restore();
        }
    });

    it("reports a testmotor it cannot reach instead of throwing the whole listing away", async () => {
        const stub = stubTestmotor({});
        try {
            const { groups, remote } = await listExamples("an-v2");

            assert.ok(remote?.error, "expected the failure to be reported");
            assert.match(remote.error, /500/);
            // The attachment dummies and the subforms are still worth having.
            assert.ok(groups.some((group) => group.kind === "attachment"));
            assert.ok(groups.some((group) => group.kind === "subform"));
            assert.equal(
                groups.find((group) => group.key === "AN"),
                undefined
            );
        } finally {
            stub.restore();
        }
    });

    it("502s when a file is asked for and the testmotor cannot be reached", async () => {
        const stub = stubTestmotor({});
        try {
            await assert.rejects(
                () => readExample("form", "AN", "maksimum_ansvarserklaering_direkte_V2.xml", "an-v2"),
                (error: unknown) => error instanceof HttpError && error.status === 502
            );
        } finally {
            stub.restore();
        }
    });

    it("leaves an app it does not hold to the disk, and says nothing went wrong", async () => {
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS });
        try {
            // hoeringettersynuttalelse-v2 is one of the apps the testmotor has no data for.
            const { groups, remote } = await listExamples("hoeringettersynuttalelse-v2");

            assert.equal(remote?.error, null);
            const uttalelse = groups.find((group) => group.key === "HoeringOgOffentligEttersynUttalelse");
            assert.ok(uttalelse, "expected the disk group to still be offered");

            const loaded = await readExample("form", "HoeringOgOffentligEttersynUttalelse", "uttalelse.xml", "hoeringettersynuttalelse-v2");
            assert.match(loaded.content, /^<HoeringOgOffentligEttersynUttalelse[\s>]/);
            // Only the app list was asked for. There is no point asking for files it has none of.
            assert.deepEqual(new Set(stub.paths), new Set(["/api/altinn-app"]));
        } finally {
            stub.restore();
        }
    });

    it("asks once and reuses the answer, however many elements want an example", async () => {
        const stub = stubTestmotor({ "/api/altinn-app": AN_APPS, "/api/xml/an-v2": AN_XML });
        try {
            await Promise.all([
                listExamples("an-v2"),
                listExamples("an-v2"),
                readExample("form", "AN", "minimum_ansvarserklaering_direkte_V2.xml", "an-v2")
            ]);

            assert.deepEqual(stub.paths.sort(), ["/api/altinn-app", "/api/xml/an-v2"]);
        } finally {
            stub.restore();
        }
    });

    it("does not reach for the testmotor when no app is selected", async () => {
        const stub = stubTestmotor({});
        try {
            const { remote } = await listExamples();
            assert.equal(remote, null);
            assert.deepEqual(stub.paths, []);
        } finally {
            stub.restore();
        }
    });
});

describe("example data still on disk", () => {
    it("groups the xml files that stayed here by data type", async () => {
        const { groups } = await listExamples();

        // The main forms moved to the testmotor. What is left under forms/ is the one form it does
        // not hold, which is exactly why it is still a file.
        const uttalelse = groups.find((group) => group.key === "HoeringOgOffentligEttersynUttalelse");
        assert.ok(uttalelse, "expected the uttalelse group");
        assert.equal(uttalelse.kind, "form");
        assert.equal(uttalelse.files[0]?.contentType, "application/xml");
        assert.equal(uttalelse.files[0]?.encoding, "utf8");
        assert.ok((uttalelse.files[0]?.sizeBytes ?? 0) > 0);

        const subform = groups.find((group) => group.key === "GjennomfoeringsplanDataV7");
        assert.ok(subform, "expected the subform group");
        assert.equal(subform.kind, "subform");
    });

    it("labels a file by its stem and looks it up by its full name", async () => {
        const { groups } = await listExamples();
        const subform = groups.find((group) => group.key === "GjennomfoeringsplanDataV7");
        assert.ok(subform);

        const file = subform.files[0];
        assert.ok(file);
        assert.equal(file.label, file.name.replace(/\.[^.]+$/, "").replace(/^\d+[_-]\s*/, ""));

        const loaded = await readExample("subform", "GjennomfoeringsplanDataV7", file.name);
        assert.ok(loaded.content.length > 0);
    });

    it("reads an example verbatim, down to the line endings it was written with", async () => {
        const loaded = await readExample("form", "HoeringOgOffentligEttersynUttalelse", "uttalelse.xml");
        assert.match(loaded.content, /^<HoeringOgOffentligEttersynUttalelse[\s>]/);
        assert.ok(loaded.content.includes("\r\n"), "expected the file's own CRLF endings to survive");
        // sizeBytes is UTF-8 on disk, and the string is shorter because of æøå.
        assert.equal(Buffer.byteLength(loaded.content, "utf8"), loaded.sizeBytes);
        assert.ok(loaded.content.length < loaded.sizeBytes, "expected multi-byte characters");
    });

    it("404s for a file that does not exist", async () => {
        await assert.rejects(
            () => readExample("form", "HoeringOgOffentligEttersynUttalelse", "nope.xml"),
            (error: unknown) => error instanceof HttpError && error.status === 404
        );
    });

    it("refuses path traversal out of the example root", async () => {
        for (const [dataType, name] of [
            ["..", "../../package.json"],
            ["ET/../../..", "passwd.xml"],
            ["../subforms", "x.xml"]
        ] as [string, string][]) {
            await assert.rejects(
                () => readExample("form", dataType, name),
                (error: unknown) => error instanceof HttpError && error.status === 400,
                `expected ${dataType}/${name} to be rejected`
            );
        }
    });

    it("refuses non-xml files", async () => {
        await assert.rejects(
            () => readExample("form", "HoeringOgOffentligEttersynUttalelse", "secrets.env"),
            (error: unknown) => error instanceof HttpError && error.status === 400
        );
    });
});

describe("attachment examples", () => {
    it("groups the dummy attachments by the content type their extension implies", async () => {
        const { groups } = await listExamples();
        const attachments = groups.filter((group) => group.kind === "attachment");

        const byKey = new Map(attachments.map((group) => [group.key, group]));
        for (const contentType of [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "text/plain",
            "text/csv",
            "application/json",
            "application/xml",
            "image/svg+xml"
        ]) {
            assert.ok(byKey.has(contentType), `expected a dummy for ${contentType}`);
        }
    });

    it("reads a binary attachment as base64 that decodes to the file on disk", async () => {
        const loaded = await readExample("attachment", "", "dummy.png");

        assert.equal(loaded.encoding, "base64");
        assert.equal(loaded.contentType, "image/png");
        const bytes = Buffer.from(loaded.content, "base64");
        assert.equal(bytes.length, loaded.sizeBytes);
        // PNG signature, so what we hand over really is a PNG.
        assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });

    it("reads the pdf dummy as base64 with a pdf header", async () => {
        const loaded = await readExample("attachment", "", "dummy.pdf");
        assert.equal(loaded.encoding, "base64");
        assert.equal(loaded.contentType, "application/pdf");
        const bytes = Buffer.from(loaded.content, "base64");
        assert.ok(bytes.subarray(0, 8).toString("latin1").startsWith("%PDF-"));
        assert.ok(bytes.toString("latin1").trimEnd().endsWith("%%EOF"));
    });

    it("reads a text attachment as utf8", async () => {
        const loaded = await readExample("attachment", "", "dummy.txt");
        assert.equal(loaded.encoding, "utf8");
        assert.equal(loaded.contentType, "text/plain");
        assert.match(loaded.content, /Dummy vedlegg/);
    });

    it("does not use the group as a path for attachments", async () => {
        const viaEmpty = await readExample("attachment", "", "dummy.txt");
        const viaGarbage = await readExample("attachment", "whatever", "dummy.txt");
        assert.equal(viaEmpty.content, viaGarbage.content);
        // An unsupported content type falls back to the file's canonical one.
        assert.equal(viaGarbage.contentType, "text/plain");
    });

    it("posts a file as the aliased content type the app asked for", async () => {
        const canonical = await readExample("attachment", "application/xml", "dummy.xml");
        const alias = await readExample("attachment", "text/xml", "dummy.xml");

        assert.equal(canonical.contentType, "application/xml");
        assert.equal(alias.contentType, "text/xml");
        // Same bytes either way, only the declared content type differs.
        assert.equal(canonical.content, alias.content);
    });

    it("offers one group per content type alias", async () => {
        const { groups } = await listExamples();
        const keys = groups.filter((group) => group.kind === "attachment").map((group) => group.key);

        for (const alias of ["application/xml", "text/xml", "application/zip", "application/x-zip-compressed"]) {
            assert.ok(keys.includes(alias), `expected a group for ${alias}`);
        }
        // The same dummy backs both spellings.
        const byKey = new Map(groups.map((group) => [group.key, group]));
        assert.equal(byKey.get("application/xml")?.files[0]?.name, "dummy.xml");
        assert.equal(byKey.get("text/xml")?.files[0]?.name, "dummy.xml");
    });

    it("covers every format it ships a dummy for", async () => {
        const { groups } = await listExamples();
        const keys = new Set(groups.filter((group) => group.kind === "attachment").map((group) => group.key));

        for (const contentType of [
            "application/pdf",
            "application/rtf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.spreadsheet",
            "application/zip",
            "application/octet-stream",
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/bmp",
            "image/webp",
            "image/tiff",
            "image/svg+xml",
            "text/plain",
            "text/csv",
            "text/html",
            "text/markdown",
            "application/json",
            "application/xml",
            "application/gml+xml",
            "application/geo+json"
        ]) {
            assert.ok(keys.has(contentType), `expected a dummy for ${contentType}`);
        }
    });

    it("hands over office packages as real zip archives", async () => {
        for (const [name, marker] of [
            ["dummy.docx", "word/document.xml"],
            ["dummy.xlsx", "xl/workbook.xml"],
            ["dummy.odt", "content.xml"]
        ] as [string, string][]) {
            const loaded = await readExample("attachment", "", name);
            const bytes = Buffer.from(loaded.content, "base64");
            // Local file header of a zip, then the part name should appear in the listing.
            assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b], `${name} is not a zip`);
            assert.ok(bytes.toString("latin1").includes(marker), `${name} is missing ${marker}`);
        }
    });

    it("still refuses to escape the example root", async () => {
        // The group is ignored for attachments, so the file name is the only way in.
        for (const name of ["../forms/HoeringOgOffentligEttersynUttalelse/uttalelse.xml", "../../package.json", "/etc/hosts.txt"]) {
            await assert.rejects(
                () => readExample("attachment", "", name),
                (error: unknown) => error instanceof HttpError && error.status === 400,
                `expected ${name} to be rejected`
            );
        }
    });

    it("refuses an extension it has no format for", async () => {
        await assert.rejects(
            () => readExample("attachment", "", "dummy.exe"),
            (error: unknown) => error instanceof HttpError && error.status === 400
        );
    });
});

describe("geodata attachments", () => {
    it("keeps the byte order mark on the gml, since it is part of the file", async () => {
        const loaded = await readExample("attachment", "application/gml+xml", "dummy.gml");

        assert.equal(loaded.encoding, "utf8");
        assert.equal(loaded.contentType, "application/gml+xml");
        assert.equal(loaded.content.charCodeAt(0), 0xfeff, "expected a leading BOM");
        assert.match(loaded.content, /<gml:FeatureCollection/);
        // sizeBytes is the UTF-8 length on disk, which exceeds the character count.
        assert.equal(Buffer.byteLength(loaded.content, "utf8"), loaded.sizeBytes);
        assert.ok(loaded.content.length < loaded.sizeBytes, "expected multi-byte characters");
    });

    it("serves the geojson under both the current and the older content type", async () => {
        const current = await readExample("attachment", "application/geo+json", "dummy.geojson");
        const older = await readExample("attachment", "application/vnd.geo+json", "dummy.geojson");

        assert.equal(current.contentType, "application/geo+json");
        assert.equal(older.contentType, "application/vnd.geo+json");
        assert.equal(current.content, older.content);

        const parsed: unknown = JSON.parse(current.content);
        assert.equal((parsed as { type: string }).type, "FeatureCollection");
    });

    it("does not offer the geodata files as plain xml or json", async () => {
        const { groups } = await listExamples();
        const byKey = new Map(groups.filter((group) => group.kind === "attachment").map((g) => [g.key, g]));

        // A 949 kB GML would otherwise become the default for every xml attachment.
        assert.deepEqual(
            byKey.get("application/xml")?.files.map((f) => f.name),
            ["dummy.xml"]
        );
        assert.deepEqual(
            byKey.get("application/json")?.files.map((f) => f.name),
            ["dummy.json"]
        );
    });
});
