/**
 * Which action advances a task.
 *
 * Altinn authorises `PUT process/next` against an action, and the action depends on the task the
 * instance sits in: a data task is written, a signing task is signed. The request carries it as
 * `{"action":"sign"}`, and an empty body leaves Altinn to work it out from the task type instead.
 *
 * Naming it is the better default. It is what the app's policy is written against, so an app that
 * grants the specific action gets a body it recognises, and the log then shows which action was
 * asked for rather than an empty object that says nothing.
 *
 * The map is Altinn's own task types. Feedback is left out on purpose: a feedback task is advanced
 * by the app, not by a caller.
 */
const ACTION_BY_TASK_TYPE: Record<string, string> = {
    data: "write",
    confirmation: "confirm",
    signing: "sign",
    payment: "pay"
};

export function actionForTaskType(taskType: string | null | undefined): string | null {
    if (!taskType) return null;
    return ACTION_BY_TASK_TYPE[taskType.trim().toLowerCase()] ?? null;
}

/**
 * Body for `PUT process/next`.
 *
 * A task type we do not recognise sends `{}` rather than a guess: naming an action the app's
 * policy does not grant is a 403, where saying nothing lets Altinn pick the one it would have
 * picked anyway.
 */
export function advanceBody(taskType: string | null | undefined): string {
    const action = actionForTaskType(taskType);
    return action ? JSON.stringify({ action }) : "{}";
}

/**
 * The task type out of an instance body, or out of a bare process state, since `process/next`
 * answers with the latter. Altinn calls it `altinnTaskType` and puts it on the current task.
 */
export function taskTypeOf(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const nested = record["process"];
    const process = (nested && typeof nested === "object" ? nested : record) as Record<string, unknown>;
    const task = process["currentTask"];
    if (!task || typeof task !== "object") return null;
    const taskType = (task as Record<string, unknown>)["altinnTaskType"];
    return typeof taskType === "string" && taskType.trim() ? taskType : null;
}
