import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampRepeat, MAX_REPEAT, splitPastedInstanceId } from "./inputs";

describe("clampRepeat", () => {
    it("keeps a sensible count as it is", () => {
        assert.equal(clampRepeat(1), 1);
        assert.equal(clampRepeat(10), 10);
        assert.equal(clampRepeat(MAX_REPEAT), MAX_REPEAT);
    });

    it("holds the line at one, so a run always posts at least once", () => {
        assert.equal(clampRepeat(0), 1);
        assert.equal(clampRepeat(-5), 1);
        assert.equal(clampRepeat(Number.NaN), 1);
    });

    it("caps a fat-fingered extra digit", () => {
        assert.equal(clampRepeat(500), MAX_REPEAT);
        assert.equal(clampRepeat(Number.POSITIVE_INFINITY), MAX_REPEAT);
    });

    it("rounds, since half a post is not a thing", () => {
        assert.equal(clampRepeat(2.4), 2);
        assert.equal(clampRepeat(2.6), 3);
    });
});

describe("splitPastedInstanceId", () => {
    const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";

    it("splits the party id off a pasted instance id", () => {
        assert.deepEqual(splitPastedInstanceId(`510001/${GUID}`), { partyId: "510001", guid: GUID });
    });

    it("takes a bare guid as just a guid", () => {
        assert.deepEqual(splitPastedInstanceId(GUID), { guid: GUID });
    });

    it("trims whitespace either side, which pasting tends to bring", () => {
        assert.deepEqual(splitPastedInstanceId(`  510001/${GUID}  `), { partyId: "510001", guid: GUID });
        assert.deepEqual(splitPastedInstanceId(`  ${GUID}\n`), { guid: GUID });
    });

    it("leaves a non-numeric prefix alone rather than calling it a party", () => {
        // Only a run of digits is a party id, so this stays one string to be rejected as a guid.
        assert.deepEqual(splitPastedInstanceId(`dibk/${GUID}`), { guid: `dibk/${GUID}` });
    });
});
