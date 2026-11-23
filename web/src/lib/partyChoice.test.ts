import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partyChoice } from "./partyChoice";
import type { AppParty } from "../types";

const person: AppParty = { partyId: 510001, name: "Pengelens Partner", ssn: "01017012345" };
const company: AppParty = {
    partyId: 500000,
    name: "DDG Fitness",
    orgNumber: "910011111",
    childParties: [{ partyId: 500001, name: "DDG Fitness Bergen", orgNumber: "910022222" }]
};

describe("partyChoice", () => {
    it("offers every listed party, subunits after their parent", () => {
        const { options, unlisted } = partyChoice([person, company], "510001");
        assert.deepEqual(
            options.map((option) => option.value),
            ["510001", "500000", "500001"]
        );
        assert.equal(unlisted, false);
    });

    it("finds a subunit as a listed party", () => {
        assert.equal(partyChoice([company], "500001").unlisted, false);
    });

    it("offers nothing extra when no party is chosen", () => {
        assert.deepEqual(partyChoice([person], ""), {
            options: [{ value: "510001", label: "510001 · Pengelens Partner (01017012345)" }],
            unlisted: false
        });
    });

    it("keeps a party the app has not been asked about yet, without calling it wrong", () => {
        assert.deepEqual(partyChoice([], "510001"), { options: [{ value: "510001", label: "510001 · from the token" }], unlisted: false });
    });

    /*
     * The case behind this: a party picked for one test user stays in the field after switching to
     * another, who may not act for it, and the post comes back 403 with nothing to say why.
     */
    it("reports a party the app does not list for this user, first in the select", () => {
        const { options, unlisted } = partyChoice([person, company], "500700");
        assert.equal(unlisted, true);
        assert.deepEqual(options[0], { value: "500700", label: "500700 · not allowed for this user" });
        assert.equal(options.length, 4);
    });
});
