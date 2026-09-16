/** Where the tool is pointed, as the panels need to print it. */
export interface TargetUrls {
    /** The app's own root, `http://local.altinn.cloud:8000/dibk/et-v4`. */
    base: string;
    /** The instance owner party id. */
    party: string;
    /** The selected instance's guid. */
    guid: string;
    /** The selected instance under `base`, which is the prefix almost every url shares. */
    instance: string;
}

/**
 * The urls a panel shows for the request it would make.
 *
 * Every panel that names a request prints the url it would call, and every one of them has to say
 * something where a field has not been filled in yet. A brace-wrapped name is that something, and
 * it reads as a template rather than as a url with a hole in it: `{org}` is recognisably the shape
 * of the thing you are about to type, where an empty string would make `//instances` look like a
 * url the tool intends to call.
 *
 * Built in one place because four panels were each building it, and a convention written four times
 * is a convention that will eventually be written three ways.
 */
export function targetUrls(appHost: string, org: string, app: string, party: string, instanceGuid: string): TargetUrls {
    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const shownParty = party || "{partyId}";
    const shownGuid = instanceGuid || "{instanceGuid}";

    return {
        base,
        party: shownParty,
        guid: shownGuid,
        instance: `${base}/instances/${shownParty}/${shownGuid}`
    };
}
