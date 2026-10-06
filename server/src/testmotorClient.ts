import { createTestmotorClient } from "@arkitektum/ftpb-testmotor-client";
import type { TestmotorApp, TestmotorXmlFile } from "@arkitektum/ftpb-testmotor-client";
import { altinnFetch } from "./altinnClient.js";
import { config } from "./config.js";

/**
 * The FtPB testmotor, which is where the main form and subform examples come from.
 *
 * The client itself lives in `@arkitektum/ftpb-testmotor-client`, shared with altinn-studio-custom-components-api, which reads the same endpoints and used to carry its own copy of this. See that package for which entries it drops, why the files are not sorted, and how long an answer is reused.
 *
 * What is left here is the part that is this tool's own: the requests go through `altinnFetch`, so the testmotor gets the same request timeout as everything else and a request that never lands arrives as the 502 or 504 envelope the rest of the code already understands, rather than as a thrown error.
 *
 * A subform download needs two things from the transport. The `fileName` header, which is how the testmotor tells the files of one data type apart, and the body as the whole text. `altinnFetch` cuts an ordinary text body off at 200,000 characters for the log's sake, which would hand back a broken XML file without a word, so a download asks for the bytes instead, which are never cut.
 */

export type { TestmotorApp, TestmotorXmlFile };

const client = createTestmotorClient({
    baseUrl: config.testmotorUrl,
    fetch: async (url, request) => {
        const asText = request?.accept === "text";
        const response = await altinnFetch({ url, headers: request?.headers, binaryResponse: asText, accept: asText ? "*/*" : undefined });
        // Decoded as Response.text() decodes, which is what the package's own transport uses: a leading byte order mark is dropped, where Buffer.toString keeps it as U+FEFF in front of "<?xml", and the .NET XML reader behind the app refuses a document that starts with one.
        const body = asText && response.ok && response.bytes ? new TextDecoder().decode(response.bytes) : response.body;
        return { ok: response.ok, status: response.status, statusText: response.statusText, body };
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

/** One subform's predefined example files as one app holds them, in the order the testmotor lists them. */
export function fetchTestmotorSubformXml(appId: string, dataType: string): Promise<TestmotorXmlFile[]> {
    return client.fetchSubformXml(appId, dataType);
}
