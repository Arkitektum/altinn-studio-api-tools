import { altinnFetch } from "./altinnClient.js";
import { config } from "./config.js";

/**
 * The FtPB testmotor, which is where the main form examples come from.
 *
 * It serves the copy of the example data the DIBK test team maintains, out of an Azure file share,
 * and it does one thing on the way out that a file in this repo cannot: it stamps the date fields
 * an app cares about with a date a few days ahead, on every request. A ferdigattest example is
 * only valid while its dates fall inside the window the rules insist on, so a copy committed here
 * is right on the day it is committed and wrong a fortnight later. That is the whole reason the
 * main form examples are read from here rather than kept on disk.
 *
 * Two endpoints are used, both open. `GET /api/altinn-app` lists the apps it holds data for, and
 * `GET /api/xml/{appId}` answers that app's example files, contents and all. No token is sent:
 * `altinnFetch` attaches a bearer only when handed one, and it is handed none here.
 */

/** One example file as the testmotor answers it. */
export interface TestmotorXmlFile {
    /**
     * The file's stem with its ordering prefix stripped, so "01_Maksimumsversjon.xml" on the share
     * arrives as "Maksimumsversjon". There is no extension and no prefix left to sort on, which is
     * why the order the testmotor answers in is the order that gets kept.
     */
    name: string;
    contents: string;
}

/** An app the testmotor holds example data for, as much of it as this tool needs. */
export interface TestmotorApp {
    appId: string;
    /** Altinn data type id of the app's main form, e.g. "FA". What the examples are keyed by here. */
    mainFormId: string;
}

/**
 * How long an answer is reused. The testmotor caches its own reads of the share for five minutes,
 * so asking more often than this mostly re-reads its cache, and the dates it stamps only move from
 * one day to the next.
 */
const CACHE_MS = 5 * 60_000;

interface Cached<T> {
    at: number;
    value: Promise<T>;
}

/**
 * The promise is cached rather than the value, so the burst of calls a single page load makes
 * shares one request instead of racing several. A rejection is evicted immediately: caching a
 * failure for five minutes would let a moment of the host being down outlast the outage.
 */
function memo<T>(store: Map<string, Cached<T>>, key: string, load: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

    const value = load();
    store.set(key, { at: Date.now(), value });
    value.catch(() => {
        if (store.get(key)?.value === value) store.delete(key);
    });
    return value;
}

const appCache = new Map<string, Cached<TestmotorApp[]>>();
const xmlCache = new Map<string, Cached<TestmotorXmlFile[]>>();

/** Forgets everything read so far. Only the tests need this. */
export function clearTestmotorCache(): void {
    appCache.clear();
    xmlCache.clear();
}

/** Whether the testmotor is switched on at all. Emptying TESTMOTOR_URL switches it off. */
export function testmotorConfigured(): boolean {
    return Boolean(config.testmotorUrl);
}

async function getJson(path: string): Promise<unknown> {
    const url = `${config.testmotorUrl}${path}`;
    const response = await altinnFetch({ url });
    if (!response.ok) {
        const detail = typeof response.body === "string" ? response.body.slice(0, 200) : JSON.stringify(response.body).slice(0, 200);
        throw new Error(`${url} answered ${response.status} ${response.statusText}: ${detail}`);
    }
    return response.body;
}

/** The apps the testmotor holds example data for. */
export async function fetchTestmotorApps(): Promise<TestmotorApp[]> {
    return memo(appCache, "apps", async () => {
        const body = await getJson("/api/altinn-app");
        if (!Array.isArray(body)) throw new Error(`${config.testmotorUrl}/api/altinn-app did not answer a list.`);

        return body
            .map((entry) => entry as { appId?: unknown; mainFormId?: unknown })
            .filter((entry) => typeof entry.appId === "string" && typeof entry.mainFormId === "string")
            .map((entry) => ({ appId: entry.appId as string, mainFormId: entry.mainFormId as string }));
    });
}

/**
 * One app's example form files, in the order the testmotor answers them.
 *
 * Not sorted here. The stems arrive with their ordering prefix already stripped, so sorting them
 * would put "Maksimumsversjon" before "Minimumsversjon" by accident rather than by intent, and the
 * order the share is read in is the order the testmotor's own UI offers. Files it could not name
 * are dropped: a file with no name cannot be asked for again.
 */
export async function fetchTestmotorFormXml(appId: string): Promise<TestmotorXmlFile[]> {
    return memo(xmlCache, appId, async () => {
        const body = await getJson(`/api/xml/${encodeURIComponent(appId)}`);
        if (!Array.isArray(body)) throw new Error(`${config.testmotorUrl}/api/xml/${appId} did not answer a list.`);

        return body
            .map((entry) => entry as { name?: unknown; contents?: unknown })
            .filter((entry): entry is TestmotorXmlFile => typeof entry.name === "string" && entry.name !== "" && typeof entry.contents === "string")
            .map((entry) => ({ name: entry.name, contents: entry.contents }));
    });
}
