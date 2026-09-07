import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exampleOptionsFor } from "./exampleOptions";
import type { ExampleGroup } from "../types";

const file = (name: string, contentType: string, encoding: "utf8" | "base64" = "utf8") => ({
    name,
    label: name.replace(/\.[^.]+$/, ""),
    sizeBytes: 100,
    contentType,
    encoding
});

const GROUPS: ExampleGroup[] = [
    { kind: "form", key: "ET", files: [file("01_Maks.xml", "application/xml")] },
    {
        kind: "subform",
        key: "GjennomfoeringsplanDataV7",
        files: [file("Gjennomfoeringsplan.xml", "application/xml")]
    },
    { kind: "attachment", key: "application/pdf", files: [file("dummy.pdf", "application/pdf", "base64")] },
    { kind: "attachment", key: "image/png", files: [file("dummy.png", "image/png", "base64")] },
    { kind: "attachment", key: "text/plain", files: [file("dummy.txt", "text/plain")] }
];

describe("exampleOptionsFor", () => {
    it("matches a form data type on its id", () => {
        const options = exampleOptionsFor(GROUPS, "ET", ["application/xml"]);
        assert.deepEqual(
            options.map((option) => [option.kind, option.group, option.name]),
            [["form", "ET", "01_Maks.xml"]]
        );
    });

    it("matches a subform data type on its id", () => {
        const options = exampleOptionsFor(GROUPS, "GjennomfoeringsplanDataV7", []);
        assert.equal(options[0]?.kind, "subform");
    });

    it("offers attachment dummies for every content type the data type allows", () => {
        const options = exampleOptionsFor(GROUPS, "vedlegg", ["application/pdf", "image/png"]);
        assert.deepEqual(
            options.map((option) => option.name),
            ["dummy.pdf", "dummy.png"]
        );
        assert.equal(options[0]?.kind, "attachment");
        assert.equal(options[0]?.group, "application/pdf");
    });

    it("follows the order the data type declares, so the first declared one auto-loads", () => {
        const options = exampleOptionsFor(GROUPS, "vedlegg", ["image/png", "application/pdf"]);
        assert.deepEqual(
            options.map((option) => option.name),
            ["dummy.png", "dummy.pdf"]
        );
    });

    it("skips content types with no dummy on disk", () => {
        const options = exampleOptionsFor(GROUPS, "vedlegg", ["application/vnd.oasis.opendocument.text", "text/plain"]);
        assert.deepEqual(
            options.map((option) => option.name),
            ["dummy.txt"]
        );
    });

    it("prefers a data type match over the content type fallback", () => {
        // An attachment data type that also happens to have its own example directory.
        const groups: ExampleGroup[] = [...GROUPS, { kind: "form", key: "vedlegg", files: [file("spesiell.xml", "application/xml")] }];
        const options = exampleOptionsFor(groups, "vedlegg", ["application/pdf"]);
        assert.deepEqual(
            options.map((option) => option.name),
            ["spesiell.xml"]
        );
    });

    it("offers nothing without a data type, or when nothing matches", () => {
        assert.deepEqual(exampleOptionsFor(GROUPS, "", ["application/pdf"]), []);
        assert.deepEqual(exampleOptionsFor(GROUPS, "ukjent", []), []);
        assert.deepEqual(exampleOptionsFor(GROUPS, "ukjent", ["image/tiff"]), []);
    });
});
