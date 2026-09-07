import { randomUUID } from "node:crypto";
import { decodeJwt } from "./jwt.js";
import { HttpError } from "./httpError.js";

export type TokenKind = "test-user" | "raw";

export interface StoredToken {
    id: string;
    kind: TokenKind;
    label: string;
    token: string;
    claims: Record<string, unknown>;
    scopes: string[];
    issuedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    /** Party id from the token claims, used to prefill the instance owner. */
    partyId: string | null;
    userId: string | null;
}

/** What we are willing to send to the browser: everything except the bearer token itself. */
export type PublicToken = Omit<StoredToken, "token">;

/**
 * Tokens live in memory only. They are short-lived test credentials, and keeping them on the
 * server means the browser only ever holds an opaque id, so a stray console log or localStorage
 * dump cannot leak a usable token.
 */
const tokens = new Map<string, StoredToken>();

function isExpired(token: StoredToken): boolean {
    return token.expiresAt !== null && Date.parse(token.expiresAt) <= Date.now();
}

function pruneExpired(): void {
    for (const [id, token] of tokens) {
        if (isExpired(token)) tokens.delete(id);
    }
}

export function toPublicToken(token: StoredToken): PublicToken {
    const { token: _bearer, ...rest } = token;
    return rest;
}

function claimAsString(claims: Record<string, unknown>, name: string): string | null {
    const value = claims[name];
    if (value === undefined || value === null || value === "") return null;
    return String(value);
}

export function storeToken(input: { kind: TokenKind; label: string; token: string }): StoredToken {
    let decoded;
    try {
        decoded = decodeJwt(input.token);
    } catch (error) {
        throw new HttpError(422, `Could not decode the token: ${error instanceof Error ? error.message : String(error)}`);
    }

    const stored: StoredToken = {
        id: randomUUID(),
        kind: input.kind,
        label: input.label,
        token: input.token.trim(),
        claims: decoded.claims,
        scopes: decoded.scopes,
        issuedAt: decoded.issuedAt,
        expiresAt: decoded.expiresAt,
        createdAt: new Date().toISOString(),
        partyId: claimAsString(decoded.claims, "urn:altinn:partyid"),
        userId: claimAsString(decoded.claims, "urn:altinn:userid")
    };

    pruneExpired();
    tokens.set(stored.id, stored);
    return stored;
}

export function requireToken(id: unknown): StoredToken {
    if (typeof id !== "string" || !id) {
        throw new HttpError(400, "A tokenId is required. Get or paste a token first.");
    }
    const token = tokens.get(id);
    if (!token) {
        throw new HttpError(404, "Unknown tokenId. The token may have expired. Get a new one.");
    }
    if (isExpired(token)) {
        tokens.delete(id);
        throw new HttpError(410, `Token expired at ${token.expiresAt}. Get a new one.`);
    }
    return token;
}

export function listTokens(): PublicToken[] {
    pruneExpired();
    return [...tokens.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPublicToken);
}

export function deleteToken(id: string): boolean {
    return tokens.delete(id);
}
