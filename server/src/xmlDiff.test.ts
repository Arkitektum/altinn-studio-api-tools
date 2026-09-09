import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffXml, parseXml } from "./xmlDiff.js";

describe("parseXml", () => {
    it("reads elements, attributes and text", () => {
        const root = parseXml('<ettrinn art="søknad"><eiendom><gnr>73</gnr></eiendom></ettrinn>');

        assert.equal(root.name, "ettrinn");
        assert.deepEqual(root.attributes, { art: "søknad" });
        assert.equal(root.children[0]?.name, "eiendom");
        assert.equal(root.children[0]?.children[0]?.text, "73");
    });

    it("drops the declaration, comments and a doctype", () => {
        const root = parseXml(`<?xml version="1.0" encoding="utf-8"?>
            <!DOCTYPE ettrinn>
            <!-- generated -->
            <ettrinn><gnr>73</gnr></ettrinn>`);

        assert.equal(root.name, "ettrinn");
        assert.equal(root.children.length, 1);
    });

    it("unwraps CDATA as text", () => {
        const root = parseXml("<merknad><![CDATA[Noe <med> tegn]]></merknad>");
        assert.equal(root.text, "Noe <med> tegn");
    });

    it("decodes entities in text and in attributes", () => {
        const root = parseXml('<a note="Ola &amp; Kari">Sm&#xE5;stein &lt;3</a>');
        assert.equal(root.text, "Småstein <3");
        assert.equal(root.attributes["note"], "Ola & Kari");
    });

    it("takes a self-closing element as an element with nothing in it", () => {
        const root = parseXml('<ettrinn><signatur /><navn kode="x"/></ettrinn>');
        assert.equal(root.children.length, 2);
        assert.equal(root.children[0]?.text, "");
        assert.equal(root.children[1]?.attributes["kode"], "x");
    });

    it("drops namespace prefixes and xmlns declarations, which name namespaces and not content", () => {
        const root = parseXml('<ns2:ettrinn xmlns:ns2="http://dibk.no/et" xmlns="http://x"><ns2:gnr>73</ns2:gnr></ns2:ettrinn>');
        assert.equal(root.name, "ettrinn");
        assert.deepEqual(root.attributes, {});
        assert.equal(root.children[0]?.name, "gnr");
    });

    it("refuses what is not XML, rather than returning an empty tree", () => {
        assert.throws(() => parseXml('{"ettrinn":{}}'), /does not look like XML/);
        assert.throws(() => parseXml("<ettrinn><gnr>73</gnr>"), /Unclosed element <ettrinn>/);
        assert.throws(() => parseXml("<a><b></a></b>"), /does not match/);
    });
});

describe("diffXml", () => {
    it("calls two documents the same when only the formatting differs", () => {
        const left = `<?xml version="1.0" encoding="utf-8"?>
            <ettrinn xmlns:ns2="http://dibk.no/et">
                <eiendom>
                    <gnr>73</gnr>
                    <bnr>200</bnr>
                </eiendom>
                <signatur/>
            </ettrinn>`;
        // Same content: no declaration, another prefix, attributes in another order, one line,
        // and an empty element written out longhand.
        const right = '<ns9:ettrinn xmlns:ns9="http://dibk.no/et"><eiendom><gnr>73</gnr><bnr>200</bnr></eiendom><signatur></signatur></ns9:ettrinn>';

        const diff = diffXml(left, right);
        assert.equal(diff.same, true);
        assert.deepEqual(diff.differences, []);
    });

    it("reports what the model dropped", () => {
        // The case this tool exists for: a field the file has and the model has no place for.
        const left = "<ettrinn><eiendom><gnr>73</gnr><festenr>2</festenr></eiendom></ettrinn>";
        const right = "<ettrinn><eiendom><gnr>73</gnr></eiendom></ettrinn>";

        const diff = diffXml(left, right);
        assert.equal(diff.same, false);
        assert.deepEqual(diff.differences, [{ path: "/ettrinn/eiendom/festenr", kind: "missing", left: "2", right: null }]);
    });

    it("reports what the model added, which is usually a default", () => {
        const diff = diffXml("<ettrinn><gnr>73</gnr></ettrinn>", "<ettrinn><gnr>73</gnr><erAvlyst>false</erAvlyst></ettrinn>");
        assert.deepEqual(diff.differences, [{ path: "/ettrinn/erAvlyst", kind: "added", left: null, right: "false" }]);
    });

    it("reports a value the model reformatted", () => {
        const diff = diffXml("<ettrinn><dato>2026-09-09</dato></ettrinn>", "<ettrinn><dato>2026-09-09T00:00:00</dato></ettrinn>");
        assert.deepEqual(diff.differences, [{ path: "/ettrinn/dato", kind: "changed", left: "2026-09-09", right: "2026-09-09T00:00:00" }]);
    });

    it("tells repeated siblings apart by position", () => {
        const left = "<ettrinn><part><navn>Ola</navn></part><part><navn>Kari</navn></part></ettrinn>";
        const right = "<ettrinn><part><navn>Ola</navn></part><part><navn>Kari Nordmann</navn></part></ettrinn>";

        const diff = diffXml(left, right);
        assert.deepEqual(diff.differences, [{ path: "/ettrinn/part[2]/navn", kind: "changed", left: "Kari", right: "Kari Nordmann" }]);
    });

    it("reports a repeated sibling that did not survive, with its position", () => {
        const left = "<ettrinn><part>a</part><part>b</part><part>c</part></ettrinn>";
        const right = "<ettrinn><part>a</part><part>b</part></ettrinn>";

        const diff = diffXml(left, right);
        assert.deepEqual(diff.differences, [{ path: "/ettrinn/part[3]", kind: "missing", left: "c", right: null }]);
    });

    it("reports attributes, and a whole branch that went missing", () => {
        const left = '<ettrinn><eiendom kode="1" navn="x"><gnr>73</gnr><adresse><vei>Storgata</vei></adresse></eiendom></ettrinn>';
        const right = '<ettrinn><eiendom kode="2"><gnr>73</gnr></eiendom></ettrinn>';

        const diff = diffXml(left, right);
        assert.deepEqual(diff.differences, [
            { path: "/ettrinn/eiendom/@kode", kind: "changed", left: "1", right: "2" },
            { path: "/ettrinn/eiendom/@navn", kind: "missing", left: "x", right: null },
            // A branch is reported once, at its root, rather than leaf by leaf.
            { path: "/ettrinn/eiendom/adresse", kind: "missing", left: "<adresse> with 1 child element(s)", right: null }
        ]);
    });

    it("reports a different root outright", () => {
        const diff = diffXml("<ettrinn><a>1</a></ettrinn>", "<melding><a>1</a></melding>");
        assert.equal(diff.differences[0]?.path, "/");
        assert.equal(diff.differences[0]?.kind, "changed");
    });
});
