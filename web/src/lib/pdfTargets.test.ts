import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pdfPreviewQuery, pdfTargetKey, pdfTargetOptions, WHOLE_INSTANCE } from "./pdfTargets";
import type { DataElementSummary } from "../types";

const element = (id: string, dataType: string): DataElementSummary => ({
    id,
    dataType,
    contentType: "application/xml",
    filename: null,
    size: 400,
    lastChanged: null
});

const elements = [
    element("main", "ET"),
    element("plan-1", "GjennomfoeringsplanDataV7"),
    element("vedlegg", "Situasjonsplan"),
    element("plan-2", "GjennomfoeringsplanDataV7"),
    element("varsel-1", "DispensasjonsvarselDataV1")
];

const labels = (options: { label: string }[]) => options.map((option) => option.label);

describe("pdfTargetOptions", () => {
    it("offers only the whole instance until the app has said what else it can render", () => {
        assert.deepEqual(pdfTargetOptions(null, elements, ["GjennomfoeringsplanDataV7"]), [WHOLE_INSTANCE]);
    });

    it("offers the main form and each subform element its task renders, numbered per data type", () => {
        const options = pdfTargetOptions(
            { pdfTasks: ["PdfForm"], subformPdfTasks: [{ taskId: "PdfSubform", dataType: "GjennomfoeringsplanDataV7" }] },
            elements,
            ["GjennomfoeringsplanDataV7", "DispensasjonsvarselDataV1"]
        );

        assert.deepEqual(options, [
            WHOLE_INSTANCE,
            { taskId: "PdfForm", dataElementId: null, label: "Main form" },
            { taskId: "PdfSubform", dataElementId: "plan-1", label: "GjennomfoeringsplanDataV7 1" },
            { taskId: "PdfSubform", dataElementId: "plan-2", label: "GjennomfoeringsplanDataV7 2" }
        ]);
    });

    it("names the task when there is more than one main form task", () => {
        const options = pdfTargetOptions({ pdfTasks: ["PdfForm", "PdfReceipt"], subformPdfTasks: [] }, elements, []);

        assert.deepEqual(labels(options), ["Whole instance", "Main form (PdfForm)", "Main form (PdfReceipt)"]);
    });

    it("offers a task the layout sets do not place for the subforms no other task covers", () => {
        const options = pdfTargetOptions(
            {
                pdfTasks: [],
                subformPdfTasks: [
                    { taskId: "PdfPlan", dataType: "GjennomfoeringsplanDataV7" },
                    { taskId: "PdfUnplaced", dataType: null }
                ]
            },
            elements,
            ["GjennomfoeringsplanDataV7", "DispensasjonsvarselDataV1"]
        );

        assert.deepEqual(
            options.filter((option) => option.taskId === "PdfUnplaced").map((option) => option.dataElementId),
            ["varsel-1"]
        );
    });

    it("labels an element two tasks could render with the task, so the buttons differ", () => {
        const options = pdfTargetOptions(
            {
                pdfTasks: [],
                subformPdfTasks: [
                    { taskId: "PdfA", dataType: null },
                    { taskId: "PdfB", dataType: null }
                ]
            },
            elements,
            ["DispensasjonsvarselDataV1"]
        );

        assert.deepEqual(labels(options), ["Whole instance", "DispensasjonsvarselDataV1 1 (PdfA)", "DispensasjonsvarselDataV1 1 (PdfB)"]);
    });
});

describe("pdfTargetKey", () => {
    it("tells apart every target and language, and nothing else", () => {
        const plan = { taskId: "PdfSubform", dataElementId: "plan-1" };
        const keys = [
            pdfTargetKey(WHOLE_INSTANCE, "nb"),
            pdfTargetKey(WHOLE_INSTANCE, "nn"),
            pdfTargetKey({ taskId: "PdfForm", dataElementId: null }, "nb"),
            pdfTargetKey(plan, "nb"),
            pdfTargetKey({ ...plan, dataElementId: "plan-2" }, "nb")
        ];

        assert.equal(new Set(keys).size, keys.length);
        assert.equal(pdfTargetKey({ ...plan }, "nb"), pdfTargetKey(plan, "nb"));
    });
});

describe("pdfPreviewQuery", () => {
    it("carries only the parts the target has, and always the language", () => {
        assert.equal(pdfPreviewQuery(WHOLE_INSTANCE, "nb"), "?language=nb");
        assert.equal(pdfPreviewQuery({ taskId: "PdfSubform", dataElementId: "plan-1" }, "nn"), "?taskId=PdfSubform&dataElementId=plan-1&language=nn");
    });
});
