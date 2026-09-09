import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIGHLIGHT_LIMIT, detectLanguage, tokenize, tokenizeJson, tokenizeXml, type Token } from "./highlight.js";

/** What the colouring must never do: change the text. */
function joined(tokens: Token[]): string {
    return tokens.map((token) => token.text).join("");
}

function kinds(tokens: Token[], kind: string): string[] {
    return tokens.filter((token) => token.kind === kind).map((token) => token.text);
}

describe("tokenizeXml", () => {
    const xml = `<?xml version="1.0"?>
<!-- a note -->
<planvarsel xmlns="urn:x" plan:id="7">
  <sakssekvensnummer>08062021</sakssekvensnummer>
  <tom/>
</planvarsel>`;

    it("names the parts of a document", () => {
        const tokens = tokenizeXml(xml);
        assert.deepEqual(kinds(tokens, "tag"), ["planvarsel", "sakssekvensnummer", "sakssekvensnummer", "tom", "planvarsel"]);
        assert.deepEqual(kinds(tokens, "attr"), ["xmlns", "plan:id"]);
        assert.deepEqual(kinds(tokens, "string"), ['"urn:x"', '"7"']);
        assert.deepEqual(kinds(tokens, "meta"), ['<?xml version="1.0"?>', "<!-- a note -->"]);
        // Element text is left as text, since it is content rather than syntax.
        assert.ok(kinds(tokens, "text").includes("08062021"));
    });

    it("keeps cdata markers apart from the content they wrap", () => {
        const tokens = tokenizeXml("<a><![CDATA[<not a tag>]]></a>");
        assert.deepEqual(kinds(tokens, "meta"), ["<![CDATA[", "]]>"]);
        assert.ok(kinds(tokens, "text").includes("<not a tag>"));
    });

    it("survives what a truncated preview looks like", () => {
        for (const broken of [
            "<a",
            "<a ",
            "<a b",
            '<a b="',
            '<a b="unterminated',
            "<!-- never closed",
            "<?xml",
            "<![CDATA[open",
            "</",
            "<>",
            "< a>",
            "a < b",
            "<a></a",
            "<a b=>",
            "<a ==>"
        ]) {
            assert.equal(joined(tokenizeXml(broken)), broken, broken);
        }
    });

    it("returns the text it was given, exactly", () => {
        assert.equal(joined(tokenizeXml(xml)), xml);
        assert.equal(joined(tokenizeXml("")), "");
        assert.equal(joined(tokenizeXml("no markup at all")), "no markup at all");
    });
});

describe("tokenizeJson", () => {
    const json = '{\n  "id": "510001/99d",\n  "count": -12.5e3,\n  "ok": true,\n  "gone": null,\n  "list": []\n}';

    it("tells a key from a string value", () => {
        const tokens = tokenizeJson(json);
        assert.deepEqual(kinds(tokens, "attr"), ['"id"', '"count"', '"ok"', '"gone"', '"list"']);
        assert.deepEqual(kinds(tokens, "string"), ['"510001/99d"']);
        assert.deepEqual(kinds(tokens, "number"), ["-12.5e3"]);
        assert.deepEqual(kinds(tokens, "keyword"), ["true", "null"]);
    });

    it("reads an escaped quote as part of the string, not the end of it", () => {
        const tokens = tokenizeJson('{"a": "say \\"hi\\" now", "b": 1}');
        assert.deepEqual(kinds(tokens, "string"), ['"say \\"hi\\" now"']);
        assert.deepEqual(kinds(tokens, "attr"), ['"a"', '"b"']);
    });

    it("survives what a truncated preview looks like", () => {
        for (const broken of ['{"a', '{"a"', '{"a":', '{"a": "unterminated', '{"a": tru', "{", "[,,]", '{"a": "b\\', "]}"]) {
            assert.equal(joined(tokenizeJson(broken)), broken, broken);
        }
    });

    it("returns the text it was given, exactly", () => {
        assert.equal(joined(tokenizeJson(json)), json);
        assert.equal(joined(tokenizeJson("")), "");
    });
});

describe("detectLanguage", () => {
    it("believes the content type", () => {
        assert.equal(detectLanguage("<a/>", "application/xml"), "xml");
        assert.equal(detectLanguage("{}", "application/json; charset=utf-8"), "json");
        assert.equal(detectLanguage("<a/>", "application/gml+xml"), "xml");
    });

    it("leaves alone anything the content type says is not code", () => {
        assert.equal(detectLanguage("--boundary", "multipart/form-data; boundary=x"), null);
        assert.equal(detectLanguage("id;name", "text/csv"), null);
    });

    it("falls back to the first character, since a preview carries no headers", () => {
        assert.equal(detectLanguage('\n  <?xml version="1.0"?>'), "xml");
        assert.equal(detectLanguage('  {"a": 1}'), "json");
        assert.equal(detectLanguage("[1, 2]"), "json");
        assert.equal(detectLanguage("", null), null);
        assert.equal(detectLanguage("plain words", "text/plain"), null);
    });
});

describe("tokenize", () => {
    it("leaves text with no language as one run", () => {
        assert.deepEqual(tokenize("<a/>", null), [{ kind: "text", text: "<a/>" }]);
    });

    it("leaves text over the limit uncoloured, since the colour is not worth the pass", () => {
        const huge = `<a>${"x".repeat(HIGHLIGHT_LIMIT)}</a>`;
        assert.deepEqual(tokenize(huge, "xml"), [{ kind: "text", text: huge }]);
    });

    it("colours what is under the limit", () => {
        assert.deepEqual(kinds(tokenize("<a/>", "xml"), "tag"), ["a"]);
        assert.deepEqual(kinds(tokenize('{"a":1}', "json"), "attr"), ['"a"']);
        assert.deepEqual(tokenize("", "xml"), []);
    });
});
