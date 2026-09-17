import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/src (tsx) or server/dist (compiled) → repo root
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const config = {
    port: Number(process.env.PORT ?? 4000),
    /**
     * Loopback, so the api answers this machine and nothing else. It holds live test tokens and
     * will post with them for anyone who asks, and CORS does not help: it restrains browsers, not
     * curl. Set `HOST=0.0.0.0` to reach it from elsewhere, knowing what that hands out.
     */
    host: process.env.HOST ?? "127.0.0.1",
    /** Origin allowed through CORS. The Vite dev server proxies /api, so this only matters if you serve the UI elsewhere. */
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000),

    /** Where the locally running Altinn apps are served (Altinn Studio localtest proxy). */
    appHost: (process.env.ALTINN_APP_HOST ?? "http://local.altinn.cloud:8000").replace(/\/+$/, ""),

    /** The LocalTest project itself, which mints test user tokens. */
    localtestUrl: (process.env.ALTINN_LOCALTEST_URL ?? "http://localhost:5101").replace(/\/+$/, ""),

    /**
     * The DIBK validation service, the one thing here that is not on your machine.
     *
     * It answers what a submission actually requires, which `applicationmetadata` does not: the
     * `minCount` an app declares is not what the validation insists on. No token is sent with the
     * request. Empty it to switch the feature off.
     */
    validationUrl: (process.env.VALIDATION_URL ?? "https://validering.ft-test.dibk.no/api/validationReport").replace(/\/+$/, ""),

    /**
     * The FtPB testmotor, which holds the main form examples.
     *
     * They are read from here rather than kept in this repo because it re-stamps their date fields
     * on every request, so an example whose rules insist on a date within the next fortnight is in
     * that window whenever it is asked for. No token is sent with the request. Empty it to switch
     * the feature off, which leaves only the examples still on disk: subforms, the uttalelse forms
     * and the attachment dummies.
     */
    testmotorUrl: (process.env.TESTMOTOR_URL ?? "https://app-ftpb-testmotor.azurewebsites.net").replace(/\/+$/, ""),

    /**
     * Example data that stays on disk, laid out as {dir}/forms/{dataType}/*.xml,
     * {dir}/subforms/{dataType}/*.xml and {dir}/attachments/*. The main forms are not here; see
     * `testmotorUrl` above.
     */
    exampleDataDir: process.env.ALTINN_EXAMPLE_DATA_DIR ? path.resolve(process.env.ALTINN_EXAMPLE_DATA_DIR) : path.join(repoRoot, "examples")
} as const;
