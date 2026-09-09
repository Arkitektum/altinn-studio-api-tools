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

    it("follows allOf, which composes a type rather than offering a choice", () => {
        const composed = {
            "@xsdRootElement": "planvarsel",
            oneOf: [{ $ref: "#/$defs/Planvarsel" }],
            $defs: {
                Planvarsel: {
                    allOf: [{ $ref: "#/$defs/Base" }, { type: "object", properties: { egen: { type: "string" } } }]
                },
                Base: {
                    type: "object",
                    properties: { planforslag: { $ref: "#/$defs/Planforslag" } }
                },
                Planforslag: {
                    type: "object",
                    properties: {
                        kommunensSaksnummer: {
                            type: "object",
                            properties: { sakssekvensnummer: { type: "integer", "@xsdType": "integer" } }
                        }
                    }
                }
            }
        };

        const types = resolveFieldTypes(composed, ["/Planvarsel/planforslag/kommunensSaksnummer/sakssekvensnummer", "/planvarsel/egen"]);
        assert.equal(types["/Planvarsel/planforslag/kommunensSaksnummer/sakssekvensnummer"], "integer");
        assert.equal(types["/planvarsel/egen"], "string");
    });

    it("says nothing when two branches of a choice disagree about a field", () => {
        const ambiguous = {
            "@xsdRootElement": "a",
            oneOf: [{ $ref: "#/$defs/One" }, { $ref: "#/$defs/Two" }],
            $defs: {
                One: { type: "object", properties: { felt: { type: "string" } } },
                Two: { type: "object", properties: { felt: { type: "integer" } } }
            }
        };
        assert.deepEqual(resolveFieldTypes(ambiguous, ["/a/felt"]), {});
    });

    it("takes a field that only one branch of a choice has", () => {
        const either = {
            "@xsdRootElement": "a",
            oneOf: [{ $ref: "#/$defs/One" }, { $ref: "#/$defs/Two" }],
            $defs: {
                One: { type: "object", properties: { bare: { type: "string" } } },
                Two: { type: "object", properties: { annet: { type: "integer" } } }
            }
        };
        const types = resolveFieldTypes(either, ["/a/bare", "/a/annet"]);
        assert.equal(types["/a/bare"], "string");
        assert.equal(types["/a/annet"], "integer");
    });

    it("says nothing for a field that is itself an object, only for the leaves under it", () => {
        assert.deepEqual(resolveFieldTypes(schema, ["/ettrinn/eiendom"]), {});
    });

    it("resolves a real path through a real schema, nullable types and all", () => {
        // Taken from dibk/varselplanoppstart-v3's Planvarsel schema: a root wrapper into $defs,
        // a chain of $refs, and `type` as a union with null, which is how a nullable field is
        // spelled. The XSD type is the one worth showing, and the union's null is not a type.
        const planvarsel = {
            type: "object",
            "@xsdRootElement": "Planvarsel",
            oneOf: [{ $ref: "#/$defs/PlanvarselType" }],
            $defs: {
                PlanvarselType: {
                    type: ["object", "null"],
                    properties: { planforslag: { $ref: "#/$defs/PlanforslagType" } }
                },
                PlanforslagType: {
                    type: ["object", "null"],
                    properties: { kommunensSaksnummer: { $ref: "#/$defs/SaksnummerType" } }
                },
                SaksnummerType: {
                    type: ["object", "null"],
                    properties: {
                        sakssekvensnummer: { "@xsdType": "integer", type: ["integer", "null"], "@xsdMinOccurs": 0, "@xsdMaxOccurs": 1 },
                        saksaar: { type: ["integer", "null"] }
                    }
                }
            }
        };

        const types = resolveFieldTypes(planvarsel, [
            "/Planvarsel/planforslag/kommunensSaksnummer/sakssekvensnummer",
            "/Planvarsel/planforslag/kommunensSaksnummer/saksaar"
        ]);

        assert.equal(types["/Planvarsel/planforslag/kommunensSaksnummer/sakssekvensnummer"], "integer");
        // No @xsdType on this one, so the nullable union has to be read instead.
        assert.equal(types["/Planvarsel/planforslag/kommunensSaksnummer/saksaar"], "integer");
    });

    it("says nothing for a union of two real types, which is not a definite answer", () => {
        const union = {
            "@xsdRootElement": "a",
            oneOf: [{ $ref: "#/$defs/A" }],
            $defs: { A: { type: "object", properties: { felt: { type: ["string", "integer"] } } } }
        };
        assert.deepEqual(resolveFieldTypes(union, ["/a/felt"]), {});
    });

    it("takes the schema as text, which is how Altinn serves it", () => {
        // The endpoint answers text/plain, so the body arrives verbatim rather than parsed.
        assert.equal(resolveFieldTypes(JSON.stringify(schema), ["/ettrinn/dato"])["/ettrinn/dato"], "date");
    });

    it("matches the root element whatever case Studio gave it", () => {
        // Studio's root element is the xsd's, so it is Planvarsel in one app and ettrinn in another.
        const capitalised = { ...schema, "@xsdRootElement": "Ettrinn" };
        assert.equal(resolveFieldTypes(capitalised, ["/ettrinn/dato"])["/ettrinn/dato"], "date");
        assert.equal(resolveFieldTypes(schema, ["/Ettrinn/dato"])["/Ettrinn/dato"], "date");
    });

    it("copes with something that is not a schema at all", () => {
        assert.deepEqual(resolveFieldTypes(null, ["/ettrinn/dato"]), {});
        assert.deepEqual(resolveFieldTypes("<html>", ["/ettrinn/dato"]), {});
        assert.deepEqual(resolveFieldTypes("{not json", ["/ettrinn/dato"]), {});
        assert.deepEqual(resolveFieldTypes({ oneOf: [{ $ref: "#/nowhere" }] }, ["/ettrinn/dato"]), {});
    });
});
