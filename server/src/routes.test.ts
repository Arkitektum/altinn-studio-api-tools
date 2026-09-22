import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, afterEach, before, describe, it } from "node:test";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { appCatalogue } from "./appCatalogue.js";

/**
 * The HTTP surface: what each route insists on, and what a failure turns into on the way out.
 *
 * Only the routing layer is under test here. What the services do once their input is accepted has tests of its own,
 * so everything below is either a route that needs no upstream at all, or a request that is turned away before one is
 * reached. That is also why so few of these stub `fetch`: a request that fails validation never gets that far.
 */

let server: Server;
let base: string;

before(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
    server.close();
});

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

/**
 * A token shaped like the ones LocalTest mints: three dot-separated segments, claims in the middle one. Nothing
 * verifies the signature — see jwt.ts — so "sig" is as good a signature as any.
 */
function jwt(claims: Record<string, unknown>): string {
    const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${segment({ alg: "none", typ: "JWT" })}.${segment(claims)}.sig`;
}

const inAnHour = Math.floor(Date.now() / 1000) + 3600;
const anHourAgo = Math.floor(Date.now() / 1000) - 3600;

/** Answers the profile lookup a stored token triggers, so no test depends on LocalTest being up. */
function stubProfile(identity: unknown = { party: { person: { ssn: "01017012345", name: "Ola Nordmann" } } }) {
    globalThis.fetch = (async () => new Response(JSON.stringify(identity), { headers: { "content-type": "application/json" } })) as typeof fetch;
}

interface Answer {
    status: number;
    /**
     * The parsed JSON, deliberately loose. Every assertion below reaches into a different shape — issues, claims,
     * an error string — and typing each one would describe the responses twice over, in the place least likely to
     * be kept honest. The assertions are the description.
     */
    body: any;
    headers: Headers;
}

async function call(path: string, init?: RequestInit & { json?: unknown; raw?: string }): Promise<Answer> {
    const { json, raw, ...rest } = init ?? {};
    // Deliberately the real fetch: the server runs in this process, so a stub meant for its outgoing profile lookup
    // would otherwise answer the test's own request to it and every assertion would be about the stub.
    const response = await originalFetch(`${base}${path}`, {
        ...rest,
        headers: json !== undefined || raw !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
        body: raw ?? (json !== undefined ? JSON.stringify(json) : undefined)
    });
    const text = await response.text();
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: response.status, body, headers: response.headers };
}

/** The paths a 400 complained about, so a test can name the field rather than match a whole message. */
function issuePaths(body: { issues?: { path: string }[] }): string[] {
    return (body.issues ?? []).map((issue) => issue.path).sort();
}

/**
 * Stores a pasted token and answers its id, cleaning it up when the test ends.
 *
 * The context is taken structurally rather than as `TestContext`, which `node:test` declares inside its namespace
 * and does not export by name.
 */
async function storeToken(t: { after: (fn: () => Promise<void>) => void }, claims: Record<string, unknown>): Promise<string> {
    stubProfile();
    const created = await call("/api/tokens/raw", { method: "POST", json: { token: jwt(claims), label: "Test" } });
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    t.after(async () => {
        await call(`/api/tokens/${id}`, { method: "DELETE" });
    });
    return id;
}

describe("routes that need nothing upstream", () => {
    it("answers health with an uptime", async () => {
        const { status, body } = await call("/api/health");

        assert.equal(status, 200);
        assert.equal(body.status, "ok");
        assert.equal(typeof body.uptimeSeconds, "number");
    });

    it("reports the upstreams it is configured against", async () => {
        // The header's status dot and the example picker are built from this, so it has to answer what the process is
        // actually pointed at rather than the defaults.
        const { status, body } = await call("/api/config");

        assert.equal(status, 200);
        assert.deepEqual(body, {
            appHost: config.appHost,
            localtestUrl: config.localtestUrl,
            validationUrl: config.validationUrl,
            testmotorUrl: config.testmotorUrl,
            exampleDataDir: config.exampleDataDir
        });
    });

    it("serves the app catalogue as it stands", async () => {
        const { status, body } = await call("/api/catalogue");

        assert.equal(status, 200);
        assert.equal(body.length, appCatalogue.length);
        assert.deepEqual(body[0], appCatalogue[0]);
    });
});

describe("requests that are turned away", () => {
    it("answers an unknown path under /api with JSON rather than express's HTML", async () => {
        const { status, body } = await call("/api/there-is-no-such-thing");

        assert.equal(status, 404);
        assert.deepEqual(body, { error: "Not found" });
    });

    it("answers an unknown path outside /api the same way", async () => {
        const { status, body } = await call("/nope");

        assert.equal(status, 404);
        assert.deepEqual(body, { error: "Not found" });
    });

    it("answers a preflight without reaching a route", async () => {
        const { status, headers } = await call("/api/tokens/raw", { method: "OPTIONS" });

        assert.equal(status, 204);
        assert.equal(headers.get("access-control-allow-origin"), config.webOrigin);
        assert.match(headers.get("access-control-allow-methods") ?? "", /DELETE/);
    });

    it("puts the allowed origin on an ordinary answer too", async () => {
        const { headers } = await call("/api/health");

        assert.equal(headers.get("access-control-allow-origin"), config.webOrigin);
    });
});

describe("input the schemas reject", () => {
    it("names the field that was missing", async () => {
        const { status, body } = await call("/api/tokens/raw", { method: "POST", json: {} });

        assert.equal(status, 400);
        assert.equal(body.error, "Invalid request");
        assert.deepEqual(issuePaths(body), ["token"]);
    });

    it("passes the schema's own wording through, so the reason is readable", async () => {
        const { status, body } = await call("/api/tokens/raw", { method: "POST", json: { token: "abc" } });

        assert.equal(status, 400);
        assert.equal(body.issues[0].message, "token looks too short to be a JWT");
    });

    it("rejects a test user token with no user id", async () => {
        const { status, body } = await call("/api/tokens/test-user", { method: "POST", json: {} });

        assert.equal(status, 400);
        assert.deepEqual(issuePaths(body), ["userId"]);
    });

    it("names every missing part of an app query at once, not just the first", async () => {
        const { status, body } = await call("/api/app/metadata");

        assert.equal(status, 400);
        assert.deepEqual(issuePaths(body), ["app", "org", "tokenId"]);
    });

    it("rejects an example file of a kind that does not exist", async () => {
        const { status, body } = await call("/api/examples/file?kind=nonsense&name=x");

        assert.equal(status, 400);
        assert.deepEqual(issuePaths(body), ["kind"]);
    });

    it("rejects an example file with no name, since there is nothing to read", async () => {
        const { status, body } = await call("/api/examples/file?kind=form");

        assert.equal(status, 400);
        assert.deepEqual(issuePaths(body), ["name"]);
    });
});

describe("a body express itself refuses", () => {
    it("answers malformed JSON as the caller's mistake, not the server's", async () => {
        const { status, body } = await call("/api/tokens/raw", { method: "POST", raw: "{not json" });

        assert.equal(status, 400);
        assert.match(body.error, /JSON/);
    });

    it("still reads a valid body of the wrong shape as a schema failure", async () => {
        // Parsed fine, so this must reach the schema rather than the body-parser branch.
        const { status, body } = await call("/api/tokens/raw", { method: "POST", raw: "[]" });

        assert.equal(status, 400);
        assert.equal(body.error, "Invalid request");
    });
});

describe("what the token store refuses", () => {
    it("answers an unknown token id with 404 and says why", async () => {
        const { status, body } = await call("/api/app/metadata?tokenId=does-not-exist&org=dibk&app=et-v4");

        assert.equal(status, 404);
        assert.match(body.error, /Unknown tokenId/);
    });

    it("answers an expired token with 410, and forgets it", async (t) => {
        const id = await storeToken(t, { "urn:altinn:userid": "1337", exp: anHourAgo });

        const expired = await call(`/api/app/metadata?tokenId=${id}&org=dibk&app=et-v4`);
        assert.equal(expired.status, 410);
        assert.match(expired.body.error, /expired/);

        // Dropped on the way out, so the next attempt is an unknown id rather than an expired one.
        const again = await call(`/api/app/metadata?tokenId=${id}&org=dibk&app=et-v4`);
        assert.equal(again.status, 404);
    });

    it("refuses a token it cannot decode, without storing it", async () => {
        stubProfile();
        const { status, body } = await call("/api/tokens/raw", { method: "POST", json: { token: "not-a-jwt-but-long-enough" } });

        assert.equal(status, 422);
        assert.match(body.error, /Could not decode the token/);

        const listed = await call("/api/tokens");
        assert.deepEqual(listed.body, []);
    });
});

describe("a token's round trip", () => {
    it("stores a pasted token and never hands the bearer back", async (t) => {
        // The browser is meant to hold an opaque id and nothing else — the whole reason tokens live on the server.
        stubProfile();
        const token = jwt({ "urn:altinn:userid": "1337", "urn:altinn:partyid": "510001", exp: inAnHour, scope: "altinn:instances.read" });

        const created = await call("/api/tokens/raw", { method: "POST", json: { token, label: "  Pasted  " } });
        t.after(async () => {
            await call(`/api/tokens/${created.body.id}`, { method: "DELETE" });
        });

        assert.equal(created.status, 201);
        assert.equal(created.body.token, undefined);
        assert.equal(created.body.label, "Pasted");
        assert.equal(created.body.partyId, "510001");
        assert.equal(created.body.userId, "1337");
        assert.deepEqual(created.body.scopes, ["altinn:instances.read"]);
        assert.equal(created.body.ssn, "01017012345");

        const listed = await call("/api/tokens");
        assert.equal(listed.status, 200);
        assert.equal(listed.body.length, 1);
        assert.equal(listed.body[0].token, undefined);
        assert.equal(listed.body[0].id, created.body.id);
    });

    it("answers a delete with 204, and a second one with 404", async () => {
        stubProfile();
        const created = await call("/api/tokens/raw", { method: "POST", json: { token: jwt({ exp: inAnHour }) } });

        const removed = await call(`/api/tokens/${created.body.id}`, { method: "DELETE" });
        assert.equal(removed.status, 204);

        const again = await call(`/api/tokens/${created.body.id}`, { method: "DELETE" });
        assert.equal(again.status, 404);

        assert.deepEqual((await call("/api/tokens")).body, []);
    });
});
