import type { DataElementInput } from "../types";

export interface PostBlockerInputs {
    hasToken: boolean;
    org: string;
    app: string;
    party: string;
    elements: DataElementInput[];
}

/**
 * What a post is still missing, named as things rather than instructions.
 *
 * All of them at once rather than the first, unlike the panels' own waiting reasons: those sit
 * under a heading and say what that panel is for, where this reads as one sentence under a button
 * you are about to press, and "needs a valid token, an application" is shorter than pressing twice
 * to find out about the second one.
 */
export function postBlockers(inputs: PostBlockerInputs): string[] {
    const blockers: string[] = [];
    if (!inputs.hasToken) blockers.push("a valid token");
    if (!inputs.org || !inputs.app) blockers.push("an application");
    if (!inputs.party) blockers.push("an instance owner party id");
    if (inputs.elements.some((element) => !element.dataType)) blockers.push("a data type on every element");
    if (inputs.elements.some((element) => !element.content.trim())) blockers.push("content on every element");
    return blockers;
}
