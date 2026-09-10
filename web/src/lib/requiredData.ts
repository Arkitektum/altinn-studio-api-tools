import { dataTypeKindOf, HIDDEN_DATA_TYPE_IDS } from "./dataTypeGroups";
import type { AppDataType, ApplicationMetadata } from "../types";
import type { DataTypeKind } from "./dataTypeGroups";

/**
 * What an app insists on having before a task can be completed, read off its own metadata.
 *
 * Altinn binds each data type to a task and gives it a `minCount`. Completing that task requires
 * at least that many data elements of the type, and `process/next` refuses while one is short.
 * That is a real answer, and it is free: the tool already reads applicationmetadata when it probes.
 *
 * It is only the answer at the data element level. Whether the xml inside a form is complete is
 * the model and the app's own validators talking, and nothing in the metadata knows it. That is
 * what the validate call is for, and why this never claims an instance will pass, only that
 * nothing it can count is missing.
 */
export interface RequiredType {
    dataType: string;
    /** How many the app wants. */
    minCount: number;
    kind: DataTypeKind | null;
    /** Altinn makes this one itself when the instance is created, empty. */
    autoCreated: boolean;
}

export interface MissingType extends RequiredType {
    /** In the payload, plus what the selected instance already holds. */
    have: number;
    /** What is short, always at least one. */
    missing: number;
}

export interface RequiredSummary {
    /** The task the counts are for, or null when nothing said which. */
    task: string | null;
    required: RequiredType[];
    missing: MissingType[];
}

export interface RequiredInputs {
    dataTypes: AppDataType[];
    metadata: ApplicationMetadata | null;
    /** The task the selected instance sits in, or null when the post would create one. */
    currentTask: string | null;
    /** Data types in the payload as it stands. */
    payload: string[];
    /** And the ones the selected instance already holds. */
    onInstance: string[];
}

/**
 * Which task the counts are about.
 *
 * The instance says so once there is one. Without one there is no instance to ask, and metadata
 * does not name the first task of the process either, so the main form's own task stands in for
 * it: a new instance starts where its form does.
 */
export function taskInPlay(inputs: Pick<RequiredInputs, "dataTypes" | "metadata" | "currentTask">): string | null {
    if (inputs.currentTask) return inputs.currentTask;
    const mainId = inputs.metadata?.mainFormDataType;
    const main = inputs.dataTypes.find((type) => type.id === mainId) ?? inputs.dataTypes.find((type) => type.appLogic && type.maxCount === 1);
    return main?.taskId ?? null;
}

/**
 * What that task requires.
 *
 * A type bound to another task is left out, since it is not what this step is waiting for. One
 * bound to no task at all is kept: nothing said it belongs elsewhere. The types the app produces
 * itself are left out too, the same list the picker hides, because a receipt pdf the app writes at
 * the end of the process is not something to add to a payload.
 */
export function requiredFor(inputs: RequiredInputs, task: string | null): RequiredType[] {
    const hidden = new Set(HIDDEN_DATA_TYPE_IDS);
    return inputs.dataTypes
        .filter((type) => (type.minCount ?? 0) >= 1)
        .filter((type) => !hidden.has(type.id))
        .filter((type) => !task || !type.taskId || type.taskId === task)
        .map((type) => ({
            dataType: type.id,
            minCount: type.minCount ?? 1,
            kind: dataTypeKindOf(inputs.dataTypes, inputs.metadata, type.id),
            autoCreated: type.appLogic?.autoCreate === true
        }));
}

function count(ids: string[], dataType: string): number {
    return ids.filter((id) => id === dataType).length;
}

/**
 * What the app requires, and what is short of it.
 *
 * An element on the instance counts as much as one in the payload: Altinn counts data elements,
 * and it makes no difference to the count whether this tool is about to post one or posted it an
 * hour ago. An auto-created form data element counts too, which is the truth and not the whole
 * truth: it is there and it is empty, and only the app's validation can say the second part.
 */
export function requiredSummary(inputs: RequiredInputs): RequiredSummary {
    const task = taskInPlay(inputs);
    const required = requiredFor(inputs, task);

    const missing = required
        .map((type) => {
            const have = count(inputs.payload, type.dataType) + count(inputs.onInstance, type.dataType);
            return { ...type, have, missing: type.minCount - have };
        })
        .filter((type) => type.missing > 0);

    return { task, required, missing };
}

/** The data types to append, one entry per element short, in the order the app declares them. */
export function elementsToAdd(missing: MissingType[]): string[] {
    return missing.flatMap((type) => Array.from({ length: type.missing }, () => type.dataType));
}
