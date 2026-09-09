import { altinnFetch, isTextual } from "./altinnClient.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";
import { storageDataUrl } from "./urls.js";
import { diffXml, type XmlDiff } from "./xmlDiff.js";

export interface CompareRequest {
    instanceOwnerPartyId: string;
    instanceGuid: string;
    dataGuid: string;
    /** The XML as written: an example file, or what is in the payload editor. */
    left: string;
}

export interface CompareResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    dataGuid: string;
    /** What storage said the blob is, which for form data is the type it was stored under. */
    storedContentType: string | null;
    /** The stored XML itself, so the two can be read side by side. */
    stored: string | null;
    diff: XmlDiff | null;
}

/**
 * Compares the XML as written against the XML Altinn stored.
 *
 * Reading a form data element through the app gives the model as JSON, because Altinn serves a
 * data type with `appLogic` through its model class. The blob itself only comes from storage,
 * which LocalTest serves, so that is where the right-hand side comes from.
 *
 * What this is for: a field the model has no place for is dropped on the way in, and a value the
 * model formats its own way is rewritten, both without complaint. `xmlDiff.ts` reports those and
 * ignores the differences that carry no meaning.
 */
export async function compareStored(token: string, request: CompareRequest): Promise<CompareResult> {
    const recorder = new StepRecorder();
    const url = storageDataUrl(request.instanceOwnerPartyId, request.instanceGuid, request.dataGuid);

    const response = await recorder.run("Read the stored data element", "GET", url, () =>
        altinnFetch({ url, token, accept: "*/*", binaryResponse: true })
    );

    const failed = (reason: string): CompareResult => ({
        ok: false,
        steps: recorder.steps,
        failedAt: reason,
        dataGuid: request.dataGuid,
        storedContentType: response.contentType,
        stored: null,
        diff: null
    });

    if (!response.ok) {
        return failed(
            "Could not read the stored data element from LocalTest's storage api. A 403 usually means this token may not act " +
                "for that party, rather than that the element is missing."
        );
    }
    if (!isTextual(response.contentType)) {
        return failed(`The stored element is ${response.contentType ?? "of an unknown type"}, which is not text to compare.`);
    }

    const stored = response.bytes?.toString("utf8") ?? "";

    let diff: XmlDiff;
    try {
        diff = diffXml(request.left, stored);
    } catch (error) {
        // Both sides have to parse. The message names which end and where.
        return {
            ...failed(`Could not compare: ${error instanceof Error ? error.message : String(error)}`),
            stored
        };
    }

    return {
        ok: true,
        steps: recorder.steps,
        failedAt: null,
        dataGuid: request.dataGuid,
        storedContentType: response.contentType,
        stored,
        diff
    };
}
