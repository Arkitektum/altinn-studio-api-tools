import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    contentIssues,
    documentNames,
    documentsToAdd,
    isDocumentMessage,
    parseValidationReport,
    requirementsFrom,
    summarisePrevalidation
} from "./validationReport";
import type { DocumentRequirement, ReportRequirements } from "./validationReport";
import type { AppDataType } from "../types";
import type { ReportMessage } from "./validationReport";

/**
 * Messages copied out of a real report for dibk/et-v4, unedited, including the curly quotes the
 * service writes and the two rules that name their alternatives rather than themselves.
 */
const raw = {
    errors: 10,
    warnings: 6,
    soknadtype: "ET",
    messages: [
        {
            rule: "Situasjonsplan",
            reference: "Ettrinn.Vedlegg.Situasjonsplan",
            message: "Vedlegg ‘Situasjonsplan’ mangler for valgte tiltakstyper, jfr. nasjonal sjekkliste punkt 1.73.",
            messagetype: "ERROR",
            xpathField: "/ettrinn[1]",
            preCondition: null,
            checklistReference: "1.73"
        },
        {
            rule: "SnittPlanFasadeTegninger",
            reference: "Ettrinn.Vedlegg.SnittPlanFasadeTegninger",
            message:
                "Minst én tegning med en av vedleggstypene ‘TegningEksisterendeSnitt’, ‘TegningNyttSnitt’, ‘TegningEksisterendePlan’, " +
                "‘TegningNyPlan’, ‘TegningEksisterendeFasade’ eller ‘TegningNyFasade’ må være vedlagt søknaden.",
            messagetype: "ERROR",
            xpathField: "/ettrinn[1]",
            preCondition: null,
            checklistReference: "1.80"
        },
        {
            rule: "Gjennomfoeringsplan",
            reference: "Ettrinn.Vedlegg.Gjennomfoeringsplan",
            message: "En gjennomføringsplan skal følge med søknaden.",
            messagetype: "ERROR",
            xpathField: "/ettrinn[1]",
            preCondition: "ansvarForByggesaken/kodeverdi != selvbygger || utenAnsvar",
            checklistReference: "17.11"
        },
        {
            rule: "Gyldig",
            reference: "Ettrinn.Avsender.AnsvarligSoeker.Gyldig",
            message:
                "Identiteten (organisasjonsnummeret eller fødselsnummeret) til avsender må være lik identiteten som er oppgitt for ansvarlig søker.",
            messagetype: "ERROR",
            xpathField: "/ettrinn[1]/ansvarligSoeker[1]",
            preCondition: "/ansvarligSoeker/partstype/kodeverdi",
            checklistReference: null
        },
        {
            rule: "Kvitteringnabovarsel",
            reference: "Ettrinn.Vedlegg.Varsling.FritattNabovarsling.Kvitteringnabovarsel",
            message: "Når nabovarsling kreves for søknaden, må vedlegget ‘Kvittering for nabovarsel’ eller ‘GjenpartNabovarselData’ legges ved.",
            messagetype: "ERROR",
            xpathField: "/ettrinn[1]/varsling[1]/fritattFraNabovarsling[1]",
            preCondition: "/varsling/fritattFraNabovarsling=false",
            checklistReference: "2.2"
        },
        {
            rule: "Plantegning",
            reference: "Ettrinn.Vedlegg.Plantegning",
            message:
                "Plantegning må være vedlagt søknaden for valgte tiltakstyper, jfr. nasjonal sjekkliste punkt 1.79. Vi anbefaler at vedlegget " +
                "‘TegningNyPlan’ legges ved. Gjelder tiltaket eksisterende bygning, skal også ‘TegningEksisterendePlan’ være vedlagt.",
            messagetype: "WARNING",
            xpathField: "/ettrinn[1]",
            preCondition: null,
            checklistReference: "1.79"
        },
        {
            rule: "Prosjektnavn",
            reference: "Ettrinn.Metadata.Prosjektnavn.Utfylt",
            message: "Hvis det er et prosjektnavn på byggesøknaden, bør du oppgi dette.",
            messagetype: "WARNING",
            xpathField: "ettrinn/metadata/prosjektnavn",
            preCondition: null,
            checklistReference: null
        }
    ]
};

const dataTypes: AppDataType[] = [
    { id: "ET", minCount: 1, maxCount: 1, appLogic: { autoCreate: true, classRef: "Et" } },
    { id: "GjennomfoeringsplanDataV7", minCount: 0, maxCount: 0, appLogic: { classRef: "Gjp" } },
    { id: "Situasjonsplan", minCount: 0, maxCount: 0 },
    { id: "Gjennomfoeringsplan", minCount: 0, maxCount: 0 },
    { id: "TegningNyPlan", minCount: 0, maxCount: 0 },
    { id: "TegningNyFasade", minCount: 0, maxCount: 0 },
    { id: "GjenpartNabovarselData", minCount: 0, maxCount: 0 }
];

const inputs = { dataTypes, payload: [], onInstance: [] };
const report = parseValidationReport(raw);

function message(over: Partial<ReportMessage> = {}): ReportMessage {
    return { rule: "", reference: "", message: "", severity: "error", xpathField: null, checklistReference: null, ...over };
}

describe("parseValidationReport", () => {
    it("reads the report", () => {
        assert.equal(report?.soknadtype, "ET");
        assert.equal(report?.errors, 10);
        assert.equal(report?.warnings, 6);
        assert.equal(report?.messages.length, 7);
        assert.equal(report?.messages[0]?.severity, "error");
        assert.equal(report?.messages[5]?.severity, "warning");
        assert.equal(report?.messages[0]?.checklistReference, "1.73");
    });

    it("is nothing when the answer was not a report", () => {
        assert.equal(parseValidationReport(null), null);
        assert.equal(parseValidationReport("<html>Bad gateway</html>"), null);
        assert.equal(parseValidationReport({ error: "no" }), null);
    });

    it("survives a report missing what it was expected to have", () => {
        const thin = parseValidationReport({ messages: [{ rule: "Situasjonsplan" }, null, 7] });
        assert.equal(thin?.messages.length, 1);
        assert.equal(thin?.messages[0]?.message, "");
        assert.equal(thin?.messages[0]?.checklistReference, null);
        // No counts of its own, so they are counted.
        assert.equal(thin?.errors, 0);
    });

    it("counts an unknown severity as the milder one", () => {
        const odd = parseValidationReport({ messages: [{ messagetype: "INFO" }] });
        assert.equal(odd?.messages[0]?.severity, "warning");
    });
});

describe("isDocumentMessage", () => {
    it("is a document when the rule sits under Vedlegg", () => {
        assert.equal(isDocumentMessage(message({ reference: "Ettrinn.Vedlegg.Varsling.ForeliggerMerknader.Nabomerknader" })), true);
    });

    it("is a document when only the field says so", () => {
        assert.equal(isDocumentMessage(message({ reference: "Ettrinn.Noe.Annet", xpathField: "ettrinn/vedlegg" })), true);
    });

    it("is not a document when the rule is about a field in the form", () => {
        assert.equal(
            isDocumentMessage(message({ reference: "Ettrinn.Avsender.AnsvarligSoeker.Gyldig", xpathField: "/ettrinn[1]/ansvarligSoeker[1]" })),
            false
        );
    });
});

describe("documentNames", () => {
    it("takes the name from the rule when the rule is the document", () => {
        assert.deepEqual(documentNames(report!.messages[0]!), ["Situasjonsplan"]);
    });

    it("takes the alternatives from the prose, ahead of the rule's own name", () => {
        assert.deepEqual(documentNames(report!.messages[1]!), [
            "TegningEksisterendeSnitt",
            "TegningNyttSnitt",
            "TegningEksisterendePlan",
            "TegningNyPlan",
            "TegningEksisterendeFasade",
            "TegningNyFasade",
            "SnittPlanFasadeTegninger"
        ]);
    });

    it("leaves the Norwegian in the prose alone", () => {
        // ‘Kvittering for nabovarsel’ is what the document is called, not a type you can select.
        assert.deepEqual(documentNames(report!.messages[4]!), ["GjenpartNabovarselData", "Kvitteringnabovarsel"]);
    });
});

describe("requirementsFrom", () => {
    const found = requirementsFrom(report, inputs);

    it("separates what it requires from what it recommends", () => {
        assert.deepEqual(
            found.required.map((requirement) => requirement.dataTypes),
            [["Situasjonsplan"], ["TegningNyPlan", "TegningNyFasade"], ["Gjennomfoeringsplan"], ["GjenpartNabovarselData"]]
        );
        assert.deepEqual(
            found.recommended.map((requirement) => requirement.dataTypes),
            [["TegningNyPlan"]]
        );
    });

    it("keeps only the alternatives the app declares", () => {
        // The rule names six drawings and this app has two of them.
        assert.equal(found.required[1]?.known, true);
        assert.deepEqual(found.required[1]?.dataTypes, ["TegningNyPlan", "TegningNyFasade"]);
    });

    it("names a document the app has no type for, and says it cannot add it", () => {
        const unknown = requirementsFrom(report, { ...inputs, dataTypes: [] });
        assert.equal(unknown.required[0]?.known, false);
        assert.deepEqual(unknown.required[0]?.dataTypes, ["Situasjonsplan"]);
    });

    it("keeps what is inside the form apart from the documents, whole rather than counted", () => {
        assert.deepEqual(
            contentIssues(found, "error").map((issue) => issue.rule),
            ["Gyldig"]
        );
        assert.deepEqual(
            contentIssues(found, "warning").map((issue) => issue.rule),
            ["Prosjektnavn"]
        );
    });

    it("marks one already in the payload, or already on the instance", () => {
        const held = requirementsFrom(report, { ...inputs, payload: ["Situasjonsplan"], onInstance: ["Gjennomfoeringsplan"] });
        assert.deepEqual(
            held.required.map((requirement) => requirement.satisfied),
            [true, false, true, false]
        );
    });

    it("is satisfied by any one of the alternatives", () => {
        const held = requirementsFrom(report, { ...inputs, payload: ["TegningNyFasade"] });
        assert.equal(held.required[1]?.satisfied, true);
    });

    it("says an error where two rules want the same document and disagree on how badly", () => {
        const both = parseValidationReport({
            messages: [
                { rule: "Situasjonsplan", reference: "Ettrinn.Vedlegg.Situasjonsplan", message: "bør", messagetype: "WARNING" },
                { rule: "Situasjonsplan", reference: "Ettrinn.Vedlegg.Situasjonsplan", message: "må", messagetype: "ERROR" }
            ]
        });
        const one = requirementsFrom(both, inputs);
        assert.deepEqual(one.recommended, []);
        assert.equal(one.required.length, 1);
        assert.equal(one.required[0]?.message, "må");
    });

    it("has nothing to say without a report", () => {
        assert.deepEqual(requirementsFrom(null, inputs).required, []);
    });
});

describe("documentsToAdd", () => {
    it("is one element per required document that is not here yet", () => {
        const { required } = requirementsFrom(report, inputs);
        assert.deepEqual(documentsToAdd(required), ["Situasjonsplan", "TegningNyPlan", "Gjennomfoeringsplan", "GjenpartNabovarselData"]);
    });

    it("leaves out what is already in the payload", () => {
        const { required } = requirementsFrom(report, { ...inputs, payload: ["Situasjonsplan", "Gjennomfoeringsplan"] });
        assert.deepEqual(documentsToAdd(required), ["TegningNyPlan", "GjenpartNabovarselData"]);
    });

    it("leaves out what it cannot select", () => {
        const { required } = requirementsFrom(report, { ...inputs, dataTypes: [] });
        assert.deepEqual(documentsToAdd(required), []);
    });
});

describe("summarisePrevalidation", () => {
    /** A requirement, built by hand rather than through a report: this is about the counting. */
    const doc = (severity: "error" | "warning", satisfied: boolean): DocumentRequirement => ({
        severity,
        dataTypes: [`${severity}-${satisfied}`],
        known: true,
        satisfied,
        rule: "rule",
        message: "message",
        checklistReference: null
    });

    /** And n findings about the form itself, which are only ever counted here. */
    const issues = (severity: "error" | "warning", n: number): ReportMessage[] =>
        Array.from({ length: n }, (_, index) => ({
            rule: `${severity}-${index}`,
            reference: "",
            message: "",
            severity,
            xpathField: null,
            checklistReference: null
        }));

    const requirements = (over: Partial<ReportRequirements> = {}): ReportRequirements => ({
        soknadtype: "ET",
        required: [],
        recommended: [],
        other: [],
        ...over
    });

    it("has not run before it has been asked", () => {
        assert.deepEqual(summarisePrevalidation(null), { run: false, stale: false, outstanding: 0, errors: 0, warnings: 0 });
    });

    it("counts everything the report found, not only the documents", () => {
        const summary = summarisePrevalidation({
            stale: false,
            requirements: requirements({
                required: [doc("error", false), doc("error", false)],
                recommended: [doc("warning", false)],
                other: [...issues("error", 3), ...issues("warning", 4)]
            })
        });

        assert.equal(summary.run, true);
        assert.equal(summary.outstanding, 2);
        // The two missing documents are errors as well, so errors is never below outstanding.
        assert.equal(summary.errors, 5);
        assert.equal(summary.warnings, 5);
    });

    /* Found once and answered since. The row says where the submission stands, not what it asked. */
    it("does not count a requirement the payload already satisfies", () => {
        const summary = summarisePrevalidation({
            stale: false,
            requirements: requirements({
                required: [doc("error", true), doc("error", false)],
                recommended: [doc("warning", true)]
            })
        });

        assert.equal(summary.outstanding, 1);
        assert.equal(summary.errors, 1);
        assert.equal(summary.warnings, 0);
    });

    it("carries the staleness through, since an answer the payload moved on from is not a finding", () => {
        const summary = summarisePrevalidation({ stale: true, requirements: requirements({ other: issues("error", 2) }) });
        assert.equal(summary.stale, true);
        assert.equal(summary.errors, 2);
    });
});
