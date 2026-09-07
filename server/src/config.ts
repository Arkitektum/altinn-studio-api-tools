import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/src (tsx) or server/dist (compiled) → repo root
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const config = {
    port: Number(process.env.PORT ?? 4000),
    /** Origin allowed through CORS. The Vite dev server proxies /api, so this only matters if you serve the UI elsewhere. */
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000),

    /** Where the locally running Altinn apps are served (Altinn Studio localtest proxy). */
    appHost: (process.env.ALTINN_APP_HOST ?? "http://local.altinn.cloud:8000").replace(/\/+$/, ""),

    /** The LocalTest project itself, which mints test user tokens. */
    localtestUrl: (process.env.ALTINN_LOCALTEST_URL ?? "http://localhost:5101").replace(/\/+$/, ""),

    /**
     * Example form data, laid out as {dir}/forms/{dataType}/*.xml and
     * {dir}/subforms/{dataType}/*.xml. Point this at your canonical copy to avoid a second
     * copy drifting out of date.
     */
    exampleDataDir: process.env.ALTINN_EXAMPLE_DATA_DIR ? path.resolve(process.env.ALTINN_EXAMPLE_DATA_DIR) : path.join(repoRoot, "examples")
} as const;
