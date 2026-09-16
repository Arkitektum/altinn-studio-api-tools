import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildValidationRequest, contentBytes, sameSubmission, submitterFor } from "./validationRequest";
import type { AppDataType, AppParty, ApplicationMetadata, DataElementInput, PublicToken } from "../types";

const dataTypes: AppDataType[] = [
    { id: "ET", maxCount: 1, appLogic: { classRef: "Et" } },
    { id: "GjennomfoeringsplanDataV7", maxCount: 0, appLogic: { classRef: "Gjp" } },
    { id: "vedlegg", maxCount: 0 }
];

const metadata: ApplicationMetadata = {
    id: "dibk/et-v4",
    org: "dibk",
    mainFormDataType: "ET",
    subFormDataTypes: ["GjennomfoeringsplanDataV7"],
    dataTypes
};

const parties: AppParty[] = [
    { partyId: 510001, name: "Pengelens Partner", orgNumber: "312949555" },
    { partyId: 510002, name: "Kari Nordvik", orgNumber: null, ssn: "01899699552" },
    { partyId: 500000, name: "Parent", orgNumber: "999999999", childParties: [{ partyId: 510003, name: "Sub unit", orgNumber: "888888888" }] }
];

const elements: DataElementInput[] = [
    { dataType: "ET", content: "<ettrinn />", contentType: "application/xml" },
    { dataType: "GjennomfoeringsplanDataV7", content: "<gjennomfoeringsplan />", contentType: "application/xml" },
    { dataType: "vedlegg", content: "AAAA", encoding: "base64", contentType: "application/pdf", filename: "dummy.pdf" }
];

const token = { label: "Sophie Salt", ssn: "01899699552" } as PublicToken;
const inputs = { elements, dataTypes, metadata, parties, partyId: "510001", token };

describe("submitterFor", () => {
    it("takes the number of the party being submitted for", () => {
        assert.equal(submitterFor(parties, "510001", null), "312949555");
        assert.equal(submitterFor(parties, "510002", null), "01899699552");
    });

    it("falls back to the token's claim, and is empty when nothing knows", () => {
        assert.equal(submitterFor(parties, "999", token), "01899699552");
        assert.equal(submitterFor([], "510001", null), "");
    });
});

describe("contentBytes", () => {
    it("counts what base64 stands for, not what it is written as", () => {
        // "AAAA" is four characters and three bytes.
        assert.equal(contentBytes({ dataType: "v", content: "AAAA", encoding: "base64" }), 3);
        assert.equal(contentBytes({ dataType: "v", content: "AAAAAA==", encoding: "base64" }), 4);
    });

    it("counts text as utf-8, since a Norwegian vowel is two bytes and one character", () => {
        assert.equal(contentBytes({ dataType: "ET", content: "abc" }), 3);
        assert.equal(contentBytes({ dataType: "ET", content: "dørmmehuset" }), 12);
    });
});

describe("buildValidationRequest", () => {
    it("sends the form, its subforms by data type, and the rest as attachments", () => {
        const { request, blockedBy } = buildValidationRequest(inputs);

        assert.equal(blockedBy, null);
        assert.equal(request?.authenticatedSubmitter, "312949555");
        assert.equal(request?.formData, "<ettrinn />");
        assert.deepEqual(request?.subForms, [{ formName: "GjennomfoeringsplanDataV7", subFormData: "<gjennomfoeringsplan />" }]);
        assert.deepEqual(request?.attachments, [{ attachmentTypeName: "vedlegg", filename: "dummy.pdf", fileSize: 3 }]);
    });

    it("leaves out an element with nothing in it", () => {
        const empty = [...elements, { dataType: "valgfritt", content: "   " }];
        assert.deepEqual(buildValidationRequest({ ...inputs, elements: empty }).request?.attachments.length, 1);
    });

    it("has nothing to ask about without a form", () => {
        const noForm = elements.filter((element) => element.dataType !== "ET");
        const { request, blockedBy } = buildValidationRequest({ ...inputs, elements: noForm });
        assert.equal(request, null);
        assert.match(blockedBy ?? "", /no main form element/);
    });

    it("names an attachment by its filename, then by where it came from, then by its type", () => {
        const named: DataElementInput[] = [
            elements[0]!,
            { dataType: "vedlegg", content: "AAAA", encoding: "base64" },
            { dataType: "vedlegg2", content: "<x/>", exampleName: "01_Skjema.xml" }
        ];
        const { request } = buildValidationRequest({ ...inputs, elements: named });
        assert.deepEqual(
            request?.attachments.map((attachment) => attachment.filename),
            ["vedlegg", "01_Skjema.xml"]
        );
    });

    it("counts an unplaced type as an attachment rather than dropping it", () => {
        // An app that has not been read yet places nothing, and an attachment the service does not
        // recognise beats one it was never told about.
        const unread = buildValidationRequest({
            ...inputs,
            dataTypes: [],
            metadata: null,
            elements: [
                { dataType: "ET", content: "<ettrinn />", contentType: "application/xml" },
                { dataType: "noe", content: "<x/>" }
            ]
        });
        // With nothing read, the form fallback is a single-instance form data type, which there is
        // none of, so there is no form to send.
        assert.equal(unread.request, null);
    });
});

describe("sameSubmission", () => {
    const { request } = buildValidationRequest(inputs);

    it("is the same submission when nothing was touched", () => {
        assert.equal(sameSubmission(request, buildValidationRequest(inputs).request), true);
    });

    it("is another one after a character in the form", () => {
        const edited = elements.map((element) => (element.dataType === "ET" ? { ...element, content: `${element.content} ` } : element));
        assert.equal(sameSubmission(request, buildValidationRequest({ ...inputs, elements: edited }).request), false);
    });

    it("is another one after an attachment is added", () => {
        const added = [...elements, { dataType: "vedlegg", content: "AAAA", encoding: "base64" as const }];
        assert.equal(sameSubmission(request, buildValidationRequest({ ...inputs, elements: added }).request), false);
    });

    it("is another one after a character in a subform", () => {
        const edited = elements.map((element) =>
            element.dataType === "GjennomfoeringsplanDataV7" ? { ...element, content: `${element.content} ` } : element
        );
        assert.equal(sameSubmission(request, buildValidationRequest({ ...inputs, elements: edited }).request), false);
    });

    it("is another one after a subform is added", () => {
        const added = [...elements, { dataType: "GjennomfoeringsplanDataV7", content: "<gjennomfoeringsplan><to /></gjennomfoeringsplan>" }];
        assert.equal(sameSubmission(request, buildValidationRequest({ ...inputs, elements: added }).request), false);
    });

    /*
     * The documents are compared apart from the rest, so the two halves are worth a test each: a
     * change outside them has to count as much as a character inside one.
     */
    it("is another one when only the submitter moved, the documents being untouched", () => {
        const asAnother = buildValidationRequest({ ...inputs, partyId: "510002" }).request;
        assert.equal(asAnother?.formData, request?.formData, "the form is meant to be the same string here");
        assert.equal(sameSubmission(request, asAnother), false);
    });

    it("is another one when only an attachment's name moved", () => {
        const renamed = elements.map((element) => (element.dataType === "vedlegg" ? { ...element, filename: "annet.pdf" } : element));
        assert.equal(sameSubmission(request, buildValidationRequest({ ...inputs, elements: renamed }).request), false);
    });

    it("is not the same as nothing", () => {
        assert.equal(sameSubmission(request, null), false);
    });

    it("is the same as itself, for the report that has not been asked again", () => {
        assert.equal(sameSubmission(request, request), true);
        assert.equal(sameSubmission(null, null), true);
    });
});
