import { altinnFetch, isTextual } from "./altinnClient.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";
import { resolveFieldTypes } from "./schemaTypes.js";
import { schemaUrl, storageDataUrl } from "./urls.js";
import { diffXml, type XmlDiff, type XmlDifference } from "./xmlDiff.js";

export interface CompareRequest {
    org: string;
    app: string;
    /** Which data type the element is, so its schema can be read for the field types. */
    dataType?: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    dataGuid: string;
    /** The XML as written: an example file, or what is in the payload editor. */
    left: string;
}

/** A difference, with the field's declared type where the schema had one for that path. */
export interface AnnotatedDifference extends XmlDifference {
    type: string | null;
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
    diff: { same: boolean; differences: AnnotatedDifference[] } | null;
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

    /**
     * The field types, best effort and after the comparison, so a schema that will not load costs
     * the report nothing. Recorded as a step like any other call, so the log says it happened.
     */
    const annotate = async (differences: XmlDifference[]): Promise<AnnotatedDifference[]> => {
        if (!request.dataType) return differences.map((difference) => ({ ...difference, type: null }));

        const url = schemaUrl(request.org, request.app, request.dataType);
        const schema = await recorder.run("Read the model schema", "GET", url, () => altinnFetch({ url, token }));
        const types = schema.ok
            ? resolveFieldTypes(
                  schema.body,
                  differences.map((difference) => difference.path)
              )
            : {};
        return differences.map((difference) => ({ ...difference, type: types[difference.path] ?? null }));
    };

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

    const differences = await annotate(diff.differences);

    return {
        ok: true,
        steps: recorder.steps,
        failedAt: null,
        dataGuid: request.dataGuid,
        storedContentType: response.contentType,
        stored,
        diff: { same: diff.same, differences }
    };
}
