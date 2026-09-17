import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { HttpError } from "./httpError.js";
import { deleteToken, listTokens, requireToken, storeToken, toPublicToken } from "./tokenStore.js";

/** The store is one map for the process, so each test puts back what it took. */
afterEach(() => {
    for (const token of listTokens()) deleteToken(token.id);
});

function segment(claims: unknown): string {
    return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

function token(claims: Record<string, unknown> = {}): string {
    return `${segment({ alg: "RS256" })}.${segment(claims)}.notasignature`;
}

/** Seconds since the epoch, which is what an exp claim is. */
const inSeconds = (ms: number): number => Math.floor((Date.now() + ms) / 1000);

const live = (claims: Record<string, unknown> = {}) => token({ exp: inSeconds(3_600_000), ...claims });

describe("storeToken", () => {
    it("reads the party and the user out of the claims, which is what prefills the owner", () => {
        const stored = storeToken({
            kind: "test-user",
            label: "Sophie Salt",
            token: live({ "urn:altinn:partyid": 510001, "urn:altinn:userid": 1001 })
        });

        assert.equal(stored.partyId, "510001");
        assert.equal(stored.userId, "1001");
        // Numbers in, strings out: they are used to build urls and to fill a text field.
        assert.equal(typeof stored.partyId, "string");
    });

    it("has no party when the token claims none, rather than the string undefined", () => {
        const stored = storeToken({ kind: "raw", label: "Pasted", token: live() });
        assert.equal(stored.partyId, null);
        assert.equal(stored.userId, null);
    });

    /* An empty claim is a claim that says nothing, and "" in a url is worse than a missing one. */
    it("treats an empty claim as no claim", () => {
        const stored = storeToken({ kind: "raw", label: "Pasted", token: live({ "urn:altinn:partyid": "" }) });
        assert.equal(stored.partyId, null);
    });

    it("trims the token, since a pasted one usually arrives with whitespace", () => {
        const raw = live();
        const stored = storeToken({ kind: "raw", label: "Pasted", token: `  ${raw}\n` });
        assert.equal(stored.token, raw);
    });

    it("keeps the person number it was handed, which no LocalTest token carries", () => {
        const stored = storeToken({ kind: "test-user", label: "Sophie", token: live(), ssn: "01899699552" });
        assert.equal(stored.ssn, "01899699552");
        assert.equal(storeToken({ kind: "raw", label: "Other", token: live() }).ssn, null);
    });

    it("refuses something that is not a token, with a status a route can answer with", () => {
        assert.throws(
            () => storeToken({ kind: "raw", label: "Nope", token: "not a jwt" }),
            (error: unknown) => error instanceof HttpError && error.status === 422
        );
    });

    it("gives every token an id of its own", () => {
        const a = storeToken({ kind: "raw", label: "A", token: live() });
        const b = storeToken({ kind: "raw", label: "B", token: live() });
        assert.notEqual(a.id, b.id);
    });
});

describe("toPublicToken", () => {
    /*
     * The one rule the whole store exists for. The browser holds an opaque id and never a bearer,
     * so a stray console log or a localStorage dump cannot leak a usable credential.
     */
    it("keeps the bearer token on the server", () => {
        const stored = storeToken({ kind: "test-user", label: "Sophie", token: live({ "urn:altinn:partyid": 510001 }) });
        const published = toPublicToken(stored);

        assert.ok(!("token" in published), "the bearer must not be published");
        assert.ok(!JSON.stringify(published).includes(stored.token), "the bearer must not appear anywhere in the published token");
        // Everything else is the point of publishing it at all.
        assert.equal(published.id, stored.id);
        assert.equal(published.label, "Sophie");
        assert.equal(published.partyId, "510001");
    });

    it("publishes no bearer through the list either", () => {
        const stored = storeToken({ kind: "raw", label: "Pasted", token: live() });
        assert.ok(!JSON.stringify(listTokens()).includes(stored.token));
    });
});

describe("requireToken", () => {
    it("hands back the token it was asked for", () => {
        const stored = storeToken({ kind: "raw", label: "Pasted", token: live() });
        assert.equal(requireToken(stored.id).id, stored.id);
    });

    it("says a token is needed when none was named", () => {
        for (const id of ["", undefined, null, 7]) {
            assert.throws(
                () => requireToken(id),
                (error: unknown) => error instanceof HttpError && error.status === 400,
                `expected ${JSON.stringify(id)} to be refused`
            );
        }
    });

    it("404s an id it has never held", () => {
        assert.throws(
            () => requireToken("11112222-3333-4444-5555-666677778888"),
            (error: unknown) => error instanceof HttpError && error.status === 404
        );
    });

    /*
     * 410 rather than 404, because the two are different problems: one is a token that has aged
     * out and wants renewing, the other is an id the server never had.
     */
    it("410s one that has expired, and forgets it", () => {
        const stored = storeToken({ kind: "raw", label: "Old", token: token({ exp: inSeconds(-1000) }) });

        assert.throws(
            () => requireToken(stored.id),
            (error: unknown) => error instanceof HttpError && error.status === 410
        );
        // Gone now, so the second ask is a different answer.
        assert.throws(
            () => requireToken(stored.id),
            (error: unknown) => error instanceof HttpError && error.status === 404
        );
    });

    /* A token with no exp cannot be called expired, so it stays usable rather than vanishing. */
    it("keeps one that never said when it dies", () => {
        const stored = storeToken({ kind: "raw", label: "Forever", token: token({}) });
        assert.equal(requireToken(stored.id).id, stored.id);
    });
});

describe("listTokens", () => {
    it("drops the expired ones rather than listing tokens that cannot be used", () => {
        const dead = storeToken({ kind: "raw", label: "Old", token: token({ exp: inSeconds(-1000) }) });
        const alive = storeToken({ kind: "raw", label: "New", token: live() });

        const listed = listTokens().map((each) => each.id);
        assert.deepEqual(listed, [alive.id]);
        assert.ok(!listed.includes(dead.id));
    });

    it("puts the newest first, which is the one just minted", async () => {
        const first = storeToken({ kind: "raw", label: "First", token: live() });
        // createdAt has millisecond resolution, and two stores in one millisecond would tie.
        await new Promise((resolve) => setTimeout(resolve, 2));
        const second = storeToken({ kind: "raw", label: "Second", token: live() });

        assert.deepEqual(
            listTokens().map((each) => each.label),
            ["Second", "First"]
        );
        assert.equal(listTokens()[0]?.id, second.id);
        assert.equal(listTokens()[1]?.id, first.id);
    });

    it("is empty with nothing in it", () => {
        assert.deepEqual(listTokens(), []);
    });
});

describe("deleteToken", () => {
    it("says whether it had one to delete", () => {
        const stored = storeToken({ kind: "raw", label: "Pasted", token: live() });

        assert.equal(deleteToken(stored.id), true);
        assert.equal(deleteToken(stored.id), false);
        assert.deepEqual(listTokens(), []);
    });
});
