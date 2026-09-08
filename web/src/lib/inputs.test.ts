import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitPastedInstanceId } from "./inputs";

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
