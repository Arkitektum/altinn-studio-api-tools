import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/src (tsx) or server/dist (compiled) → repo root
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Reads a whole-number setting from the environment, or its default when it is unset or empty.
 *
 * Checked here, at startup, because a bad value used to fail late and confusingly: `REQUEST_TIMEOUT_MS=30s` became
 * NaN and every Altinn call came back a 502 quoting ERR_OUT_OF_RANGE, and an empty `REQUEST_TIMEOUT_MS=` became 0,
 * so every request timed out at once.
 *
 * @param env - Where to read it, `process.env` unless a test hands in its own.
 * @param name - The variable's name, used in the error.
 * @param fallback - The value when the variable is unset or empty.
 * @param min - The smallest value allowed.
 * @param max - The largest value allowed.
 * @returns The setting.
 * @throws {Error} If the variable is set to anything but a whole number between min and max.
 */
export function readWholeNumber(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
    const raw = env[name]?.trim();
    if (!raw) {
        return fallback;
    }
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) {
        throw new Error(`${name} must be a whole number from ${min} to ${max}, but is "${env[name]}".`);
    }
    return value;
}

export const config = {
    port: readWholeNumber(process.env, "PORT", 4000, 1, 65_535),
    /**
     * Loopback, so the api answers this machine and nothing else. It holds live test tokens and
     * will post with them for anyone who asks, and CORS does not help: it restrains browsers, not
     * curl. Set `HOST=0.0.0.0` to reach it from elsewhere, knowing what that hands out.
     */
    host: process.env.HOST ?? "127.0.0.1",
    /**
     * Host names the api answers to besides `localhost` and IP addresses, comma-separated. Anything else is refused,
     * which is what stops a web page from reaching the api by pointing its own domain at this machine. Add a name here
     * to reach the api by it, for instance a container's name when `API_URL` points the web server at one.
     */
    allowedHosts: (process.env.ALLOWED_HOSTS ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    /** Origin allowed through CORS. The Vite dev server proxies /api, so this only matters if you serve the UI elsewhere. */
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    /** How long one request to Altinn may take, in milliseconds. Capped at a day, far beyond any real use. */
    requestTimeoutMs: readWholeNumber(process.env, "REQUEST_TIMEOUT_MS", 30_000, 1, 86_400_000),

    /** Where the locally running Altinn apps are served (Altinn Studio localtest proxy). */
    appHost: (process.env.ALTINN_APP_HOST ?? "http://local.altinn.cloud:8000").replace(/\/+$/, ""),

    /** The LocalTest project itself, which mints test user tokens. */
    localtestUrl: (process.env.ALTINN_LOCALTEST_URL ?? "http://localhost:5101").replace(/\/+$/, ""),

    /**
     * The DIBK validation service, one of the two things here that are not on your machine. The
     * testmotor below is the other.
     *
     * It answers what a submission actually requires, which `applicationmetadata` does not: the
     * `minCount` an app declares is not what the validation insists on. No token is sent with the
     * request. Empty it to switch the feature off.
     */
    validationUrl: (process.env.VALIDATION_URL ?? "https://validering.ft-test.dibk.no/api/validationReport").replace(/\/+$/, ""),

    /**
     * The FtPB testmotor, which holds the main form and subform examples.
     *
     * They are read from here rather than kept in this repo because it re-stamps their date fields
     * on every request, so an example whose rules insist on a date within the next fortnight is in
     * that window whenever it is asked for. No token is sent with the request. Empty it to switch
     * the feature off, which leaves only the examples still on disk: the uttalelse form and the
     * attachment dummies.
     */
    testmotorUrl: (process.env.TESTMOTOR_URL ?? "https://app-ftpb-testmotor.azurewebsites.net").replace(/\/+$/, ""),

    /**
     * Example data that stays on disk, laid out as {dir}/forms/{dataType}/*.xml and
     * {dir}/attachments/*. The main forms and the subforms are not here, see `testmotorUrl` above.
     */
    exampleDataDir: process.env.ALTINN_EXAMPLE_DATA_DIR ? path.resolve(process.env.ALTINN_EXAMPLE_DATA_DIR) : path.join(repoRoot, "examples")
} as const;
