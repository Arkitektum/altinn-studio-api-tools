import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitPastedInstanceId } from "./instanceId";

const GUID = "99d0632c-5917-448c-8ab6-a5d3b681376b";

describe("splitPastedInstanceId", () => {
    it("splits the party id off a pasted instance id", () => {
        assert.deepEqual(splitPastedInstanceId(`510001/${GUID}`), { partyId: "510001", guid: GUID });
    });

    it("takes a bare guid as just a guid, for the party already chosen", () => {
        assert.deepEqual(splitPastedInstanceId(GUID), { guid: GUID });
    });

    it("trims whitespace either side, which pasting tends to bring", () => {
        assert.deepEqual(splitPastedInstanceId(`  510001/${GUID}  `), { partyId: "510001", guid: GUID });
        assert.deepEqual(splitPastedInstanceId(`  ${GUID}\n`), { guid: GUID });
    });

    it("leaves a non-numeric prefix alone rather than calling it a party", () => {
        // Only a run of digits is a party id, so this stays one string and Altinn rejects it,
        // which says more than silently posting to a guid that was never meant.
        assert.deepEqual(splitPastedInstanceId(`dibk/${GUID}`), { guid: `dibk/${GUID}` });
    });

    it("gives an empty guid for an empty field, which selects nothing", () => {
        assert.deepEqual(splitPastedInstanceId("   "), { guid: "" });
    });
});
