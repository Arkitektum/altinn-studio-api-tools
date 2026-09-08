import { config } from "./config.js";
import { HttpError } from "./httpError.js";
import { storeToken, type StoredToken } from "./tokenStore.js";

export interface LocaltestUser {
    userId: string;
    /** The person's name where LocalTest gives one, otherwise the id. */
    label: string;
}

export interface LocaltestUsers {
    /** Where the list came from, so the UI can say when it is guessing. */
    source: "api" | "page" | "none";
    users: LocaltestUser[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** First string among the given keys, looked up case-insensitively on the first letter. */
function pick(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        for (const candidate of [key, key.charAt(0).toUpperCase() + key.slice(1)]) {
            const value = record[candidate];
            if (typeof value === "string" && value.trim()) return value.trim();
            if (typeof value === "number") return String(value);
        }
    }
    return null;
}

/**
 * Reads a user list out of whatever json LocalTest hands back. Versions differ in casing and in
 * where the name sits, so this stays loose: an id is required and a name is a bonus.
 */
export function parseTestUsersJson(body: unknown): LocaltestUser[] {
    const rows = Array.isArray(body) ? body : Array.isArray(asRecord(body)?.["users"]) ? (asRecord(body)?.["users"] as unknown[]) : [];
    const users: LocaltestUser[] = [];
    for (const row of rows) {
        const record = asRecord(row);
        if (!record) continue;
        const userId = pick(record, ["userId", "id"]);
        if (!userId) continue;
        const party = asRecord(record["party"] ?? record["Party"]);
        const label = (party ? pick(party, ["name"]) : null) ?? pick(record, ["partyName", "name", "userName"]) ?? `Test user ${userId}`;
        users.push({ userId, label });
    }
    return users;
}

/**
 * Reads the user dropdown off LocalTest's front page.
 *
 * LocalTest has no documented endpoint for its user list, so the page it already renders is the
 * next best source. Only numeric option values are taken, which leaves out the placeholder and
 * the app dropdown's org/app values.
 */
export function parseTestUsersHtml(html: string): LocaltestUser[] {
    const users = new Map<string, string>();
    for (const match of html.matchAll(/<option\b[^>]*\bvalue="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi)) {
        const userId = match[1];
        // Tags inside the option, and entities, would otherwise land in the label.
        const label = (match[2] ?? "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
            .replace(/\s+/g, " ")
            .trim();
        if (userId && !users.has(userId)) users.set(userId, label || `Test user ${userId}`);
    }
    return [...users].map(([userId, label]) => ({ userId, label }));
}

/**
 * The test users LocalTest knows about, best effort.
 *
 * There is no documented list endpoint, so this tries the json one some versions serve and
 * otherwise reads the front page's dropdown. Either way the UI still lets a user id be typed,
 * which is the path that does not depend on any of this.
 */
export async function listTestUsers(): Promise<LocaltestUsers> {
    const get = async (path: string): Promise<Response | null> => {
        try {
            return await fetch(`${config.localtestUrl}${path}`, { signal: AbortSignal.timeout(3_000) });
        } catch {
            return null;
        }
    };

    const api = await get("/Home/GetTestUsers");
    if (api?.ok && api.headers.get("content-type")?.includes("json")) {
        const users = parseTestUsersJson(await api.json().catch(() => null));
        if (users.length > 0) return { source: "api", users };
    }

    const page = await get("/");
    if (page?.ok) {
        const users = parseTestUsersHtml(await page.text());
        if (users.length > 0) return { source: "page", users };
    }

    return { source: "none", users: [] };
}

/**
 * Fetch a test user token from the LocalTest project:
 *   GET {localtest}/Home/GetTestUserToken/{userId}
 * The response is the bare JWT as text, signed with LocalTest's key so the locally running
 * apps accept it.
 */
export async function createTestUserToken(userId: string, label?: string): Promise<StoredToken> {
    const url = `${config.localtestUrl}/Home/GetTestUserToken/${encodeURIComponent(userId)}`;

    let response: Response;
    try {
        response = await fetch(url, {
            headers: { accept: "text/plain" },
            signal: AbortSignal.timeout(config.requestTimeoutMs)
        });
    } catch (error) {
        throw new HttpError(
            502,
            `Could not reach LocalTest at ${config.localtestUrl}. Is it running? ` + `(${error instanceof Error ? error.message : String(error)})`
        );
    }

    const text = (await response.text()).trim();

    if (response.status === 404) {
        throw new HttpError(
            404,
            `LocalTest has no test user "${userId}" (404 from ${url}). Check the user id against the ` + "LocalTest front page."
        );
    }
    if (!response.ok) {
        throw new HttpError(response.status, `LocalTest returned ${response.status} for ${url}.`, {
            body: text.slice(0, 1000)
        });
    }

    // Strip an accidental JSON quoting, then sanity-check it looks like a JWT rather than the
    // HTML login page LocalTest serves when the route is wrong.
    const token = text.replace(/^"|"$/g, "").trim();
    if (!token || token.split(".").length < 2) {
        throw new HttpError(
            502,
            `LocalTest did not return a JWT for user "${userId}". It replied with ` +
                `${token.startsWith("<") ? "an HTML page" : "unexpected content"}. Check ` +
                `ALTINN_LOCALTEST_URL (currently ${config.localtestUrl}).`,
            { body: token.slice(0, 300) }
        );
    }

    return storeToken({
        kind: "test-user",
        label: label?.trim() || `Test user ${userId}`,
        token
    });
}
