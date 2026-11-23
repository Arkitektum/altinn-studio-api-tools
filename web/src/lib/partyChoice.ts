import { partyLabel } from "./format";
import type { AppParty } from "../types";

export interface PartyChoice {
    /** What the party select offers, the current value included even when the app does not list it. */
    options: { value: string; label: string }[];
    /**
     * True when the app has listed the parties this token may instantiate for and the current one is
     * not among them. Altinn refuses such an instantiation with 403 Forbidden.
     *
     * False when the list is empty, since the tool reads a refused listing as an empty one and then
     * knows nothing either way.
     */
    unlisted: boolean;
}

/**
 * The parties the app says this token may instantiate for, flattened, since Altinn nests subunits
 * under their parent org, plus the current value when it is not among them.
 *
 * The current value has to be offered, or the select would show no selection and there is no field
 * to type it in. It is there before the app has been read, prefilled from the token claim, and it
 * stays when switching to a user who may not act for it, which is the case `unlisted` reports.
 */
export function partyChoice(parties: AppParty[], current: string): PartyChoice {
    const options = parties
        .flatMap((party) => [party, ...(party.childParties ?? [])])
        .map((entry) => ({ value: String(entry.partyId), label: partyLabel(entry) }));
    if (!current || options.some((option) => option.value === current)) {
        return { options, unlisted: false };
    }
    if (options.length === 0) {
        return { options: [{ value: current, label: `${current} · from the token` }], unlisted: false };
    }
    return { options: [{ value: current, label: `${current} · not allowed for this user` }, ...options], unlisted: true };
}
