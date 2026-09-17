import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeJwt } from "./jwt.js";

/** base64url: the two substituted characters, and no padding, which is what a real token looks like. */
function segment(claims: unknown): string {
    return Buffer.from(JSON.stringify(claims)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A token shaped like one. The signature is never looked at, so it is not a real one. */
function token(claims: unknown): string {
    return `${segment({ alg: "RS256", typ: "JWT" })}.${segment(claims)}.notasignature`;
}

describe("decodeJwt", () => {
    it("reads the claims out of the payload segment", () => {
        const decoded = decodeJwt(token({ "urn:altinn:partyid": 510001, "urn:altinn:userid": 1001, sub: "Sophie Salt" }));

        assert.equal(decoded.claims["urn:altinn:partyid"], 510001);
        assert.equal(decoded.claims["urn:altinn:userid"], 1001);
        assert.equal(decoded.claims["sub"], "Sophie Salt");
    });

    it("turns exp and iat into instants, since they arrive as seconds", () => {
        const decoded = decodeJwt(token({ iat: 1_757_000_000, exp: 1_757_003_600 }));

        assert.equal(decoded.issuedAt, "2025-09-04T15:33:20.000Z");
        assert.equal(decoded.expiresAt, "2025-09-04T16:33:20.000Z");
    });

    /* A token that says nothing about when it dies is one the tool cannot call expired. */
    it("has no instants when the claims carry none, or carry nonsense", () => {
        assert.equal(decodeJwt(token({})).expiresAt, null);
        assert.equal(decodeJwt(token({ exp: "soon", iat: null })).expiresAt, null);
    });

    /*
     * The only way a claim arrives as a number that is not a real one. JSON has no Infinity
     * literal, and `JSON.stringify` turns one into null, so this has to be written as text: a
     * number too large to represent parses to Infinity, and `new Date(Infinity).toISOString()`
     * throws rather than answering. A token cannot be allowed to crash the panel listing it.
     */
    it("has no instants for a number too large to be a date", () => {
        const raw = Buffer.from('{"exp":1e400,"iat":-1e400}').toString("base64url");

        assert.equal(JSON.parse('{"exp":1e400}').exp, Number.POSITIVE_INFINITY, "fixture must actually parse to Infinity");
        assert.equal(decodeJwt(`x.${raw}.y`).expiresAt, null);
        assert.equal(decodeJwt(`x.${raw}.y`).issuedAt, null);
    });

    it("takes scope as the space separated string it usually is", () => {
        assert.deepEqual(decodeJwt(token({ scope: "altinn:instances.read altinn:instances.write" })).scopes, [
            "altinn:instances.read",
            "altinn:instances.write"
        ]);
        // Runs of spaces must not become empty scopes.
        assert.deepEqual(decodeJwt(token({ scope: "  a   b  " })).scopes, ["a", "b"]);
    });

    it("also takes it as a list, and drops anything in one that is not a scope", () => {
        assert.deepEqual(decodeJwt(token({ scope: ["a", 7, null, "b"] })).scopes, ["a", "b"]);
    });

    it("has no scopes when the claim is missing or is neither", () => {
        assert.deepEqual(decodeJwt(token({})).scopes, []);
        assert.deepEqual(decodeJwt(token({ scope: 7 })).scopes, []);
    });

    /*
     * base64url, not base64. A payload holding the bytes that encode to + and / is the one that
     * breaks a decoder that forgot to substitute, and it is not a rare payload: any Norwegian name
     * can produce them.
     */
    it("decodes a payload that uses both substituted characters, and needs padding back", () => {
        const claims = { sub: "øæå~~~???" };
        const encoded = segment(claims);

        assert.ok(encoded.includes("-") && encoded.includes("_"), "fixture must exercise both substitutions");
        assert.ok(encoded.length % 4 !== 0, "fixture must exercise the padding");
        assert.equal(decodeJwt(`x.${encoded}.y`).claims["sub"], "øæå~~~???");
    });

    it("refuses anything that is not a token", () => {
        for (const bad of ["", "onlyonesegment", "two."]) {
            assert.throws(() => decodeJwt(bad), /Not a JWT/, `expected ${JSON.stringify(bad)} to be refused`);
        }
    });

    /* A payload that decodes to something other than an object has no claims to read. */
    it("refuses a payload that is not an object", () => {
        for (const bad of [["a"], 7, "text", null]) {
            assert.throws(() => decodeJwt(`x.${segment(bad)}.y`), /not an object/, `expected ${JSON.stringify(bad)} to be refused`);
        }
    });

    it("refuses a payload that is not json at all", () => {
        assert.throws(() => decodeJwt(`x.${Buffer.from("not json").toString("base64url")}.y`));
    });
});
