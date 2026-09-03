import { config } from './config.js';

/**
 * Base url of a locally running Altinn app, e.g.
 * http://local.altinn.cloud:8000/dibk/et-v4
 */
export function appBaseUrl(org: string, app: string): string {
  return `${config.appHost}/${org}/${app}`;
}

/** Deep link a human can open to inspect the instance in the app frontend. */
export function instanceUiUrl(
  org: string,
  app: string,
  instanceOwnerPartyId: string | number,
  instanceGuid: string,
): string {
  return `${appBaseUrl(org, app)}/#/instance/${instanceOwnerPartyId}/${instanceGuid}`;
}
