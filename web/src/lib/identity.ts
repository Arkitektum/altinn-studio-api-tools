import type { AppParty, PublicToken } from "../types";

/**
 * Who the test user is acting as, which is one question with one answer.
 *
 * Altinn calls it the party the instance is for, the validation service calls it
 * `authenticatedSubmitter`, and a DIBK form calls it the organisation number or person number of
 * whichever party it is that submits, `ansvarligSoeker` on a building application. All three have
 * to agree or the submission is refused, so all three read this.
 */
export interface Identity {
    kind: "person" | "organization";
    /** The fødselsnummer or the organisasjonsnummer, whichever the kind says it is. */
    number: string;
    name: string;
}

/**
 * The identity as one string, for a caller that has to know whether it is the one it already acted
 * on. `identityFor` builds a fresh object whenever the parties or the token move, so the objects
 * cannot be compared; what was written into a form is the three values, so they are what says it.
 */
export function identityKey(identity: Identity): string {
    return `${identity.kind}:${identity.number}:${identity.name}`;
}

/**
 * The party's person number, whole.
 *
 * Newer apps mask it in their party list ("12345678901" comes back as "123456*****"), so a masked
 * one is filled in from the token's, which LocalTest serves whole, where the token's fits every
 * digit the app left. Where it does not, the party is someone other than the person behind the
 * token, and there is no whole number to be had: null, rather than the stars written into a form.
 */
function wholePersonNumber(partySsn: string, token: PublicToken | null): string | null {
    if (!partySsn.includes("*")) return partySsn;
    const whole = token?.ssn;
    if (!whole || whole.length !== partySsn.length) return null;
    return [...partySsn].every((digit, index) => digit === "*" || digit === whole[index]) ? whole : null;
}

/**
 * The party being acted for, read off the app's own party list.
 *
 * An organisation number makes it an organisation, since a party that has one is one. Failing
 * that a person number does, from the party or, when the app has not been read for its parties
 * yet, from the token's own claim. The token has no name to offer beyond the label it was made
 * with, which is what LocalTest called the user. See wholePersonNumber for a party whose number
 * the app masked.
 */
export function identityFor(parties: AppParty[], partyId: string, token: PublicToken | null): Identity | null {
    // Subunits are nested under their parent, so the flat list is the one to search.
    const flat = parties.flatMap((party) => [party, ...(party.childParties ?? [])]);
    const party = flat.find((entry) => String(entry.partyId) === partyId);

    if (party?.orgNumber) return { kind: "organization", number: party.orgNumber, name: party.name ?? "" };
    if (party?.ssn) {
        const number = wholePersonNumber(party.ssn, token);
        return number ? { kind: "person", number, name: party.name ?? token?.label ?? "" } : null;
    }
    if (token?.ssn) return { kind: "person", number: token.ssn, name: token.label };
    return null;
}
