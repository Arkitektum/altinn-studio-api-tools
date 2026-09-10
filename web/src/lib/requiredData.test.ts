import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elementsToAdd, requiredFor, requiredSummary, taskInPlay } from "./requiredData";
import type { AppDataType, ApplicationMetadata } from "../types";
import type { RequiredInputs } from "./requiredData";

const dataTypes: AppDataType[] = [
    { id: "ET", minCount: 1, maxCount: 1, taskId: "Task_1", appLogic: { autoCreate: true, classRef: "Et" } },
    { id: "GjennomfoeringsplanDataV7", minCount: 1, maxCount: 0, taskId: "Task_1", appLogic: { classRef: "Gjp" } },
    { id: "vedlegg", minCount: 2, maxCount: 0, taskId: "Task_1", allowedContentTypes: ["application/pdf"] },
    { id: "valgfrittVedlegg", minCount: 0, maxCount: 0, taskId: "Task_1" },
    { id: "signaturVedlegg", minCount: 1, maxCount: 1, taskId: "Task_2" },
    // The app writes this one itself at the end of the process.
    { id: "ref-data-as-pdf", minCount: 1, maxCount: 1, taskId: "Task_1" }
];

const metadata: ApplicationMetadata = {
    id: "dibk/et-v4",
    org: "dibk",
    mainFormDataType: "ET",
    subFormDataTypes: ["GjennomfoeringsplanDataV7"],
    dataTypes
};

const inputs: RequiredInputs = { dataTypes, metadata, currentTask: null, payload: [], onInstance: [] };

describe("taskInPlay", () => {
    it("takes the task the instance sits in", () => {
        assert.equal(taskInPlay({ ...inputs, currentTask: "Task_2" }), "Task_2");
    });

    it("stands in the main form's task for an instance that does not exist yet", () => {
        // A new instance starts where its form does, and metadata never names the first task.
        assert.equal(taskInPlay(inputs), "Task_1");
    });

    it("says nothing when nothing said", () => {
        assert.equal(taskInPlay({ ...inputs, dataTypes: [], metadata: null }), null);
    });
});

describe("requiredFor", () => {
    it("takes what the task insists on, and leaves the optional alone", () => {
        assert.deepEqual(
            requiredFor(inputs, "Task_1").map((type) => [type.dataType, type.minCount]),
            [
                ["ET", 1],
                ["GjennomfoeringsplanDataV7", 1],
                ["vedlegg", 2]
            ]
        );
    });

    it("leaves out what belongs to another task", () => {
        assert.deepEqual(
            requiredFor(inputs, "Task_2").map((type) => type.dataType),
            ["signaturVedlegg"]
        );
    });

    it("leaves out what the app produces itself", () => {
        // ref-data-as-pdf is required and is written by the app, not by anyone posting.
        assert.equal(
            requiredFor(inputs, "Task_1").some((type) => type.dataType === "ref-data-as-pdf"),
            false
        );
    });

    it("keeps a type bound to no task, since nothing said it belongs elsewhere", () => {
        const loose = [{ id: "løs", minCount: 1 }];
        assert.equal(requiredFor({ ...inputs, dataTypes: loose }, "Task_1").length, 1);
    });

    it("says which are the app's to create", () => {
        const found = requiredFor(inputs, "Task_1");
        assert.equal(found.find((type) => type.dataType === "ET")?.autoCreated, true);
        assert.equal(found.find((type) => type.dataType === "vedlegg")?.autoCreated, false);
    });

    it("names what each one is, for the badge", () => {
        const found = requiredFor(inputs, "Task_1");
        assert.deepEqual(
            found.map((type) => type.kind),
            ["main", "sub", "attachment"]
        );
    });
});

describe("requiredSummary", () => {
    it("counts what is short, by type", () => {
        const { missing } = requiredSummary({ ...inputs, payload: ["ET"] });
        assert.deepEqual(
            missing.map((type) => [type.dataType, type.have, type.missing]),
            [
                ["GjennomfoeringsplanDataV7", 0, 1],
                ["vedlegg", 0, 2]
            ]
        );
    });

    it("counts an element on the instance as much as one in the payload", () => {
        // Altinn counts data elements. Whether this tool posted it an hour ago is nothing to it.
        const { missing } = requiredSummary({ ...inputs, payload: ["GjennomfoeringsplanDataV7"], onInstance: ["ET", "vedlegg", "vedlegg"] });
        assert.deepEqual(missing, []);
    });

    it("counts two of the same type as two", () => {
        const { missing } = requiredSummary({ ...inputs, payload: ["vedlegg", "vedlegg", "ET", "GjennomfoeringsplanDataV7"] });
        assert.deepEqual(missing, []);
    });

    it("has nothing to say about an app it has not read", () => {
        const empty = requiredSummary({ dataTypes: [], metadata: null, currentTask: null, payload: [], onInstance: [] });
        assert.deepEqual(empty.required, []);
        assert.deepEqual(empty.missing, []);
    });

    it("follows the instance to a later task", () => {
        const { task, missing } = requiredSummary({ ...inputs, currentTask: "Task_2" });
        assert.equal(task, "Task_2");
        assert.deepEqual(
            missing.map((type) => type.dataType),
            ["signaturVedlegg"]
        );
    });
});

describe("elementsToAdd", () => {
    it("is one entry per element short, in the order the app declares them", () => {
        const { missing } = requiredSummary(inputs);
        assert.deepEqual(elementsToAdd(missing), ["ET", "GjennomfoeringsplanDataV7", "vedlegg", "vedlegg"]);
    });

    it("is nothing when nothing is short", () => {
        assert.deepEqual(elementsToAdd([]), []);
    });
});
