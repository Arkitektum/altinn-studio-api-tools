import { createTestmotorClient } from "@arkitektum/ftpb-testmotor-client";
import type { TestmotorApp, TestmotorXmlFile } from "@arkitektum/ftpb-testmotor-client";
import { altinnFetch } from "./altinnClient.js";
import { config } from "./config.js";

/**
 * The FtPB testmotor, which is where the main form examples come from.
 *
 * The client itself lives in `@arkitektum/ftpb-testmotor-client`, shared with altinn-studio-custom-components-api, which reads the same two endpoints and used to carry its own copy of this. See that package for which entries it drops, why the files are not sorted, and how long an answer is reused.
 *
 * What is left here is the part that is this tool's own: the requests go through `altinnFetch`, so the testmotor gets the same request timeout as everything else and a request that never lands arrives as the 502 or 504 envelope the rest of the code already understands, rather than as a thrown error.
 */

export type { TestmotorApp, TestmotorXmlFile };

const client = createTestmotorClient({
    baseUrl: config.testmotorUrl,
    fetch: async (url) => {
        const response = await altinnFetch({ url });
        return { ok: response.ok, status: response.status, statusText: response.statusText, body: response.body };
    }
});

/** Forgets everything read so far. Only the tests need this. */
export function clearTestmotorCache(): void {
    client.clearCache();
}

/** Whether the testmotor is switched on at all. Emptying TESTMOTOR_URL switches it off. */
export function testmotorConfigured(): boolean {
    return client.configured;
}

/** The apps the testmotor holds example data for. */
export function fetchTestmotorApps(): Promise<TestmotorApp[]> {
    return client.fetchApps();
}

/** One app's example form files, in the order the testmotor answers them. */
export function fetchTestmotorFormXml(appId: string): Promise<TestmotorXmlFile[]> {
    return client.fetchFormXml(appId);
}
