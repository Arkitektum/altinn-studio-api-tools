import { altinnFetch } from "./altinnClient.js";
import { config } from "./config.js";
import { StepRecorder, type RunStep } from "./stepRecorder.js";
import { mergeReports, splitSubmission, type ReportPart } from "./validationSplit.js";

/**
 * The DIBK validation service, one of the two things this tool talks to that are not on your
 * machine. The other is the testmotor the main form examples come from, `testmotorClient.ts`.
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
     * The report, exactly as the service answered, unread here.
     *
     * `unknown` rather than a type, because nothing on this side looks at it. It is passed through
     * whole: to the run log, where the raw report can be read, and to the browser, where
     * `web/src/lib/validationReport.ts` parses it into the documents a submission is missing and
     * the counts the rail colours itself by.
     *
     * Read there rather than here because the reading needs what only the browser holds: the app's
     * declared data types, to turn a name in the report into a type you can select, and what the
     * payload and the instance already have, to know which requirements are already answered. The
     * server would have to be handed all of it to do the same job.
     */
    report: unknown;
}

/**
 * One submission, asked as however many requests the service needs to be asked.
 *
 * It ignores `subForms`, so a submission with three of them was one question about the main form
 * and the subforms were never looked at. Each form goes up on its own now, and what comes back is
 * merged into one report. See validationSplit.ts for the splitting and the merging, and for why
 * every request carries the whole attachment list.
 *
 * One at a time. This is a hosted service shared with whoever else is pointed at it, and five
 * concurrent requests to answer one button press is not a reasonable way to use it.
 *
 * A form that is refused does not stop the rest. Its step says what happened, the report is short
 * by whatever that form would have said, and `ok` is false so the caller knows not to trust the
 * total. Carrying on is the better answer: the main form's findings are worth having even when a
 * subform could not be asked about.
 */
export async function fetchValidationReport(request: ValidationReportRequest, mainFormName = "the form"): Promise<ValidationReportResult> {
    const recorder = new StepRecorder();

    if (!config.validationUrl) {
        recorder.note("Prevalidate", "No validation service is configured. Set VALIDATION_URL in server/.env.");
        return { ok: false, steps: recorder.steps, failedAt: "No validation service is configured.", report: null };
    }

    const asked = splitSubmission(request, mainFormName);
    const parts: ReportPart[] = [];
    let refused: string | null = null;

    for (const { formName, main, request: body } of asked) {
        const text = JSON.stringify(body, null, 2);
        const response = await recorder.run(
            // Named for the form, since a run log holding five of these has to say which is which.
            asked.length === 1 ? "Prevalidate" : `Prevalidate ${formName}`,
            "POST",
            config.validationUrl,
            () => altinnFetch({ url: config.validationUrl, method: "POST", body: text, contentType: "application/json" }),
            // Verbatim, since what is sent is the question you are asking the service, and being
            // able to copy it as curl is how you find out whether the tool asked it properly.
            { preview: text, verbatim: true }
        );

        if (response.ok) parts.push({ formName, main, report: response.body });
        else refused ??= `The validation service would not answer about ${formName}.`;
    }

    return {
        ok: refused === null,
        steps: recorder.steps,
        failedAt: refused,
        // Whatever was answered, even when something else was not: a partial report still names
        // documents you are missing, and the step log says which form is absent from it.
        report: parts.length > 0 ? mergeReports(parts) : null
    };
}
