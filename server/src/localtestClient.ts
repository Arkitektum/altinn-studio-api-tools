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
 * next best source.
 *
 * Only a select whose id or name says it holds users is read. Taking any numeric option value
 * off the page picked up the authentication level dropdown instead, offering "Nivå 0" through
 * "Nivå 4" as people. A select this does not recognise yields nothing, and the UI then offers
 * the fallback pair and a typed id, which is the honest outcome.
 *
 * LocalTest's own picker offers a user and a party together, as `<optgroup label="Sophie Salt">`
 * holding one option per party she can act for, valued `1337.501337`, which is user id then
 * party id. Only the user id is taken, because that is what a token is minted for. The party
 * comes from the token's own claim, and the app's parties endpoint lists them authoritatively
 * once the app is probed, so there is nothing to gain by trusting the page for that as well.
 */
export function parseTestUsersHtml(html: string): LocaltestUser[] {
    const users = new Map<string, string>();

    for (const block of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
        const attributes = block[1] ?? "";
        if (!/\b(?:id|name)\s*=\s*"[^"]*(?:user|profile)[^"]*"/i.test(attributes)) continue;

        // Groups and options are walked in document order, so an option belongs to the group
        // above it. The group is the person's plain name, where the option text carries the
        // party as well, so the group is the better label when there is one.
        let group = "";
        const items = /<optgroup\b[^>]*\blabel="([^"]*)"[^>]*>|<option\b[^>]*\bvalue="(\d+)(?:\.\d+)?"[^>]*>([\s\S]*?)<\/option>/gi;
        for (const item of (block[2] ?? "").matchAll(items)) {
            if (item[1] !== undefined) {
                group = decodeHtmlText(item[1]);
                continue;
            }
            const userId = item[2];
            if (!userId || users.has(userId)) continue;
            users.set(userId, group || decodeHtmlText(item[3] ?? "") || `Test user ${userId}`);
        }
    }

    return [...users].map(([userId, label]) => ({ userId, label }));
}

/** The named entities worth knowing, which for these names means the Norwegian vowels. */
const ENTITIES: Record<string, string> = {
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    aring: "å",
    Aring: "Å",
    oslash: "ø",
    Oslash: "Ø",
    aelig: "æ",
    AElig: "Æ"
};

/** Option text as a person would read it: no tags, no entities, no run of whitespace. */
function decodeHtmlText(html: string): string {
    return (
        html
            .replace(/<[^>]*>/g, "")
            // Razor writes å as &#xE5;, so hex numeric entities are the common case here.
            .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
            .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name] ?? whole)
            // Last of the lot, so a doubly encoded &amp;#xE5; is left as text rather than
            // decoded twice into a character that was never in the name.
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
    );
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
