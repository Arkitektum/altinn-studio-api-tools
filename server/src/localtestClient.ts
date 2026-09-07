import { config } from "./config.js";
import { HttpError } from "./httpError.js";
import { storeToken, type StoredToken } from "./tokenStore.js";

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
