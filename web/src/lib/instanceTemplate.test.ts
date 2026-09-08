import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInstanceTemplate, hidesInstance, toIsoInstant } from "./instanceTemplate";

describe("toIsoInstant", () => {
    it("reads wall clock as local time and writes it as UTC", () => {
        const iso = toIsoInstant("2026-10-01T12:00");
        // Asserted as an instant rather than as a string, since the offset is the test machine's.
        assert.equal(Date.parse(iso ?? ""), Date.parse("2026-10-01T12:00"));
        assert.equal(iso?.endsWith("Z"), true);
    });

    it("takes a value that already carries a zone", () => {
        assert.equal(toIsoInstant("2026-10-01T12:00:00Z"), "2026-10-01T12:00:00.000Z");
    });

    it("gives nothing for empty or unparseable input, meaning do not send it", () => {
        assert.equal(toIsoInstant(""), null);
        assert.equal(toIsoInstant("   "), null);
        assert.equal(toIsoInstant("whenever"), null);
    });
});

describe("buildInstanceTemplate", () => {
    it("leaves the template out entirely when neither field is set", () => {
        // The simpler request, with the party in the query string.
        assert.equal(buildInstanceTemplate({ dueBefore: "", visibleAfter: "" }), undefined);
    });

    it("sends only the field that was set", () => {
        const template = buildInstanceTemplate({ dueBefore: "2026-10-01T12:00:00Z", visibleAfter: "" });
        assert.deepEqual(template, { dueBefore: "2026-10-01T12:00:00.000Z" });
    });

    it("sends both when both are set", () => {
        const template = buildInstanceTemplate({ dueBefore: "2026-10-01T12:00:00Z", visibleAfter: "2026-09-30T08:00:00Z" });
        assert.deepEqual(template, {
            dueBefore: "2026-10-01T12:00:00.000Z",
            visibleAfter: "2026-09-30T08:00:00.000Z"
        });
    });
});

describe("hidesInstance", () => {
    const now = Date.parse("2026-09-08T10:00:00Z");

    it("is true for a date still to come, which is when the instance goes missing", () => {
        assert.equal(hidesInstance("2026-09-09T10:00:00Z", now), true);
    });

    it("is false for a date already passed, and for nothing at all", () => {
        assert.equal(hidesInstance("2026-09-07T10:00:00Z", now), false);
        assert.equal(hidesInstance("", now), false);
    });
});
