/**
 * What the tool is aimed at. Not every request needs all of it: a probe is aimed at an app, a
 * listing at a party, a read at an instance, a fetch at one data element.
 */
export interface Selection {
    /** Null when there is no token, which is a different thing from an empty one. */
    tokenId: string | null;
    org: string;
    app: string;
    party: string;
    instanceGuid: string;
    dataGuid: string;
}

/** One key per scope, each one narrowing the last. */
export interface SelectionKeys {
    /** Token and application, which is what a probe is aimed at. */
    target: string;
    /** And the party, which is what an instance listing is aimed at. */
    party: string;
    /** And the instance, which is what a read, a validation, a pdf or an advance is aimed at. */
    instance: string;
    /** And the data element, which is what reading one is aimed at. */
    dataElement: string;
}

/**
 * Names what a request is aimed at, so a late answer can be recognised for what it is.
 *
 * Every call the tool makes describes a selection, and the selection can move while the call is in
 * flight: a probe of the app you just left, or a read of the instance you just left. Nothing here
 * cancels, so the only way to tell is to tag the request with the selection it was aimed at and
 * compare when it answers.
 *
 * The keys nest so that a scope only notices what it depends on. Picking another data element does
 * not make an instance read stale, and switching party does not invalidate the app's metadata.
 */
export function selectionKeys(selection: Partial<Selection>): SelectionKeys {
    const target = `${selection.tokenId ?? ""}:${selection.org ?? ""}/${selection.app ?? ""}`;
    const party = `${target}:${selection.party ?? ""}`;
    const instance = `${party}/${selection.instanceGuid ?? ""}`;
    return { target, party, instance, dataElement: `${instance}/${selection.dataGuid ?? ""}` };
}

/**
 * Whether the selection has moved away from what a request was aimed at, so its answer describes
 * something the tool has left. Stale state is more misleading than absent state, and pairing one
 * instance's data elements with another's guid is worse than either.
 */
export function hasMovedOn(requested: string, current: Partial<Selection>, scope: keyof SelectionKeys): boolean {
    return selectionKeys(current)[scope] !== requested;
}
