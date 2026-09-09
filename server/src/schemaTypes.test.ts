import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFieldTypes } from "./schemaTypes.js";

/**
 * The shape Altinn serves: no `properties` at the root, a `@xsdRootElement`, a single-branch
 * `oneOf` into `$defs`, and the XSD's own type kept as `@xsdType`.
 */
const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "schema.json",
    type: "object",
    "@xsdRootElement": "ettrinn",
    oneOf: [{ $ref: "#/$defs/Ettrinn" }],
    $defs: {
        Ettrinn: {
            type: "object",
            properties: {
                dato: { type: "string", format: "date", "@xsdType": "date" },
                merknad: { type: "string" },
                eiendom: { $ref: "#/$defs/Eiendom" },
                part: { type: "array", items: { $ref: "#/$defs/Part" } },
                status: { type: "string", enum: ["ny", "endret", "avlyst"] }
            }
        },
        Eiendom: {
            type: "object",
            properties: {
                areal: { type: "number", "@xsdType": "decimal" },
                kode: { type: "string", "@xsdAttribute": true },
                adresse: { $ref: "#/$defs/Adresse" }
            }
        },
        Adresse: { type: "object", properties: { vei: { type: "string" } } },
        Part: {
            type: "object",
            properties: {
                navn: { type: "string" },
                "@altinnRowId": { type: "string", format: "uuid" }
            }
        }
    }
};

describe("resolveFieldTypes", () => {
    it("prefers the XSD type, which is where a date is a date rather than a string", () => {
        const types = resolveFieldTypes(schema, ["/ettrinn/dato", "/ettrinn/eiendom/areal"]);
        assert.equal(types["/ettrinn/dato"], "date");
        assert.equal(types["/ettrinn/eiendom/areal"], "decimal");
    });

    it("falls back to the json schema type where there is no XSD one", () => {
        assert.equal(resolveFieldTypes(schema, ["/ettrinn/merknad"])["/ettrinn/merknad"], "string");
    });

    it("walks a $ref into $defs, and a nested one", () => {
        assert.equal(resolveFieldTypes(schema, ["/ettrinn/eiendom/adresse/vei"])["/ettrinn/eiendom/adresse/vei"], "string");
    });

    it("steps through items for a repeating group, whatever the row index is", () => {
        const types = resolveFieldTypes(schema, ["/ettrinn/part[2]/navn", "/ettrinn/part/navn"]);
        assert.equal(types["/ettrinn/part[2]/navn"], "string");
        assert.equal(types["/ettrinn/part/navn"], "string");
    });

    it("finds an attribute whether or not the schema prefixes it with @", () => {
        const types = resolveFieldTypes(schema, ["/ettrinn/eiendom/@kode", "/ettrinn/part[1]/@altinnRowId"]);
        assert.equal(types["/ettrinn/eiendom/@kode"], "string");
        assert.equal(types["/ettrinn/part[1]/@altinnRowId"], "uuid");
    });

    it("says when a field is an enumeration, which is often why a value was rejected", () => {
        assert.equal(resolveFieldTypes(schema, ["/ettrinn/status"])["/ettrinn/status"], "string, one of 3");
    });

    it("leaves out a path the schema has no entry for, rather than guessing", () => {
        // Which is itself the finding: no entry is why the field was dropped.
        const types = resolveFieldTypes(schema, ["/ettrinn/eiendom/festenr", "/ettrinn/ukjent/dypt/nede"]);
        assert.deepEqual(types, {});
    });

    it("says nothing about the root element itself, which has no type worth showing", () => {
        assert.deepEqual(resolveFieldTypes(schema, ["/ettrinn"]), {});
    });

    it("gives up on a schema that offers a choice, rather than picking a branch", () => {
        const ambiguous = { ...schema, oneOf: [{ $ref: "#/$defs/Ettrinn" }, { $ref: "#/$defs/Eiendom" }] };
        assert.deepEqual(resolveFieldTypes(ambiguous, ["/ettrinn/dato"]), {});
    });

    it("copes with something that is not a schema at all", () => {
        assert.deepEqual(resolveFieldTypes(null, ["/ettrinn/dato"]), {});
        assert.deepEqual(resolveFieldTypes("<html>", ["/ettrinn/dato"]), {});
        assert.deepEqual(resolveFieldTypes({ oneOf: [{ $ref: "#/nowhere" }] }, ["/ettrinn/dato"]), {});
    });
});
