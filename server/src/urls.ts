import { config } from "./config.js";

/**
 * Base url of a locally running Altinn app, e.g.
 * http://local.altinn.cloud:8000/dibk/et-v4
 */
export function appBaseUrl(org: string, app: string): string {
    return `${config.appHost}/${org}/${app}`;
}

/**
 * Link a human can open to reach the app frontend. The trailing slash matters: without it the app
 * is not served, which is why this is not the same as the api base.
 */
export function appUiUrl(org: string, app: string): string {
    return `${appBaseUrl(org, app)}/`;
}

/** Deep link a human can open to inspect the instance in the app frontend. */
export function instanceUiUrl(org: string, app: string, instanceOwnerPartyId: string | number, instanceGuid: string): string {
    return `${appBaseUrl(org, app)}/#/instance/${instanceOwnerPartyId}/${instanceGuid}`;
}

/**
 * The platform storage endpoint for one data element, which LocalTest serves alongside the apps.
 *
 * Storage hands back the blob as stored, where the app serves a form data type through its model
 * and so answers with JSON. This is the only way to see the XML Altinn actually wrote.
 */
export function storageDataUrl(instanceOwnerPartyId: string | number, instanceGuid: string, dataGuid: string): string {
    return `${config.localtestUrl}/storage/api/v1/instances/${instanceOwnerPartyId}/${instanceGuid}/data/${dataGuid}`;
}
