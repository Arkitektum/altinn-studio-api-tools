import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityFor } from "./identity";
import type { AppParty, PublicToken } from "../types";

const parties: AppParty[] = [
    { partyId: 510001, name: "PENGELENS PARTNER AS", orgNumber: "312949555" },
    { partyId: 510002, name: "Kari Nordvik", orgNumber: null, ssn: "01899699552" },
    { partyId: 500000, name: "Parent", orgNumber: "999999999", childParties: [{ partyId: 510003, name: "Sub unit", orgNumber: "888888888" }] }
];

const token = { label: "Sophie Salt", ssn: "14026319852" } as PublicToken;

describe("identityFor", () => {
    it("is the organisation when the party has a number", () => {
        assert.deepEqual(identityFor(parties, "510001", token), { kind: "organization", number: "312949555", name: "PENGELENS PARTNER AS" });
    });

    it("is the person when the party is one", () => {
        assert.deepEqual(identityFor(parties, "510002", token), { kind: "person", number: "01899699552", name: "Kari Nordvik" });
    });

    it("finds a subunit, which Altinn nests under its parent", () => {
        assert.equal(identityFor(parties, "510003", token)?.number, "888888888");
    });

    it("falls back to the token's own claim before the app has been read", () => {
        assert.deepEqual(identityFor([], "510001", token), { kind: "person", number: "14026319852", name: "Sophie Salt" });
    });

    it("is nothing when nothing knows, rather than a guess", () => {
        assert.equal(identityFor([], "510001", null), null);
        assert.equal(identityFor([], "510001", { label: "Raw", ssn: null } as PublicToken), null);
    });
});
