import { altinnFetch } from "./altinnClient.js";
import { config } from "./config.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";

/**
 * The DIBK validation service, which is the one thing this tool talks to that is not on your
 * machine.
 *
 * It exists here because `applicationmetadata` is not a reliable answer to "what does this
 * submission need": the `minCount` an app declares does not match what the validation actually
 * insists on. The service does know, so the payload is sent to it and the report it answers with
 * is the source.
 *
 * Two things follow from it being a hosted service. No token goes with the request: `altinnFetch`
 * attaches a bearer only when handed one, and it is handed none here, so a test token never
 * leaves the machine. And the url is configurable, `VALIDATION_URL`, so the tool can be pointed
 * at another environment or switched off by emptying it.
 */
export interface ValidationSubForm {
    /** The Altinn data type id of the subform. */
    formName: string;
    subFormData: string;
}

export interface ValidationAttachment {
    attachmentTypeName: string;
    filename: string;
    fileSize: number;
}

export interface ValidationReportRequest {
    authenticatedSubmitter: string;
    formData: string;
    subForms: ValidationSubForm[];
    attachments: ValidationAttachment[];
}

export interface ValidationReportResult {
    ok: boolean;
    steps: RunStep[];
    failedAt: string | null;
    /**
     * The report, exactly as the service answered, unread.
     *
     * Nothing here interprets it yet. What the tool wants from it is which parts of a submission
     * are required, and that reading has to be written against a real report rather than guessed
     * at, so for now the whole thing goes to the run log where it can be seen.
     */
    report: unknown;
}

export async function fetchValidationReport(request: ValidationReportRequest): Promise<ValidationReportResult> {
    const recorder = new StepRecorder();

    if (!config.validationUrl) {
        recorder.note("Prevalidate", "No validation service is configured. Set VALIDATION_URL in server/.env.");
        return { ok: false, steps: recorder.steps, failedAt: "No validation service is configured.", report: null };
    }

    const body = JSON.stringify(request, null, 2);
    const response = await recorder.run(
        "Prevalidate",
        "POST",
        config.validationUrl,
        () =>
            altinnFetch({
                url: config.validationUrl,
                method: "POST",
                body,
                contentType: "application/json"
            }),
        // Verbatim, since what is sent is the question you are asking the service, and being able
        // to copy it as curl is how you find out whether the tool asked it properly.
        { preview: body, verbatim: true }
    );

    return {
        ok: response.ok,
        steps: recorder.steps,
        failedAt: response.ok ? null : "The validation service would not answer.",
        report: response.ok ? response.body : null
    };
}
