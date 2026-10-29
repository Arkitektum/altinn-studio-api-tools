import type { DataElementSummary, PdfTargetsResult } from "../types";

/**
 * What the pdf preview can be pointed at, as the buttons the Pdf panel offers.
 *
 * Without a task the app renders the task the instance is in, which in these apps is the main form
 * with every subform after it. A `pdf` task renders the main form on its own, and a `subformPdf`
 * task renders one subform data element. Which tasks an app has is read from the app itself, see
 * `readPdfTargets` on the server.
 */

export type PdfLanguage = "nb" | "nn" | "en";

export const PDF_LANGUAGES: { value: PdfLanguage; label: string }[] = [
    { value: "nb", label: "Bokmål" },
    { value: "nn", label: "Nynorsk" },
    { value: "en", label: "English" }
];

export interface PdfTarget {
    taskId: string | null;
    dataElementId: string | null;
}

export interface PdfTargetOption extends PdfTarget {
    label: string;
}

export const WHOLE_INSTANCE: PdfTargetOption = { taskId: null, dataElementId: null, label: "Whole instance" };

/** One string per render that would come back different, which is the target and the language. */
export function pdfTargetKey(target: PdfTarget, language: PdfLanguage): string {
    return `${target.taskId ?? ""}/${target.dataElementId ?? ""}/${language}`;
}

/**
 * Every target on offer for the instance, the whole of it first.
 *
 * Each subform task renders the one data type the server placed it on, so each subform element gets
 * the button of the task for its type and no other. A task that could not be placed (`dataType`
 * null) gets none: offering it for every subform was a row of buttons the app refused. An element
 * two tasks could render is labelled with the task, so the buttons can be told apart. Subform
 * elements are numbered per data type, in the order the instance lists them.
 *
 * @param targets - What the app answered, or null while it has not.
 */
export function pdfTargetOptions(
    targets: Pick<PdfTargetsResult, "pdfTasks" | "subformPdfTasks"> | null,
    dataElements: DataElementSummary[]
): PdfTargetOption[] {
    if (!targets) return [WHOLE_INSTANCE];

    const mainForm = targets.pdfTasks.map((taskId) => ({
        taskId,
        dataElementId: null,
        label: targets.pdfTasks.length === 1 ? "Main form" : `Main form (${taskId})`
    }));

    const number = new Map<string, number>();
    const counted = dataElements.map((element) => {
        const n = (number.get(element.dataType) ?? 0) + 1;
        number.set(element.dataType, n);
        return { element, label: `${element.dataType} ${n}` };
    });

    const subforms = targets.subformPdfTasks.flatMap((task) => {
        return counted
            .filter(({ element }) => element.dataType === task.dataType)
            .map(({ element, label }) => ({ taskId: task.taskId, dataElementId: element.id, label }));
    });
    const tasksPerElement = new Map<string, number>();
    for (const option of subforms) tasksPerElement.set(option.dataElementId, (tasksPerElement.get(option.dataElementId) ?? 0) + 1);
    const labelled = subforms.map((option) =>
        (tasksPerElement.get(option.dataElementId) ?? 0) > 1 ? { ...option, label: `${option.label} (${option.taskId})` } : option
    );

    return [WHOLE_INSTANCE, ...mainForm, ...labelled];
}

/** Where the request goes, as the panel prints it: the url with the query it will carry. */
export function pdfPreviewQuery(target: PdfTarget, language: PdfLanguage): string {
    const query = new URLSearchParams();
    if (target.taskId) query.set("taskId", target.taskId);
    if (target.dataElementId) query.set("dataElementId", target.dataElementId);
    query.set("language", language);
    return `?${query}`;
}
