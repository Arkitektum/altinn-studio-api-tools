/**
 * Which action advances a task, mirroring the server's own map so the panel can show the body it
 * is about to send. Kept in step with `server/src/processAction.ts`, the way the row id filter is
 * kept in step with the server's.
 *
 * Altinn authorises `PUT process/next` against an action, and the action depends on the task the
 * instance sits in: a data task is written, a signing task is signed.
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

/** Body for `PUT process/next`. An unrecognised task type sends `{}` and lets Altinn decide. */
export function advanceBody(taskType: string | null | undefined): string {
    const action = actionForTaskType(taskType);
    return action ? JSON.stringify({ action }) : "{}";
}
