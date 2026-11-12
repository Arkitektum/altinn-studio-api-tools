/**
 * Known Altinn Studio apps and the data type each one's form data lives under.
 *
 * The list lives in `@arkitektum/ftpb-app-catalogue`, shared with the components API so the two cannot disagree. Add
 * an app to the package, not here.
 *
 * This is a convenience list for the org/app picker and for guessing a data type before the app has been probed.
 * The app's own applicationmetadata is always authoritative.
 */
import { appCatalogue as sharedCatalogue } from "@arkitektum/ftpb-app-catalogue";

export interface CatalogueSubform {
    org: string;
    app: string;
    dataType: string;
}

export interface CatalogueApp {
    org: string;
    app: string;
    /** Data type of the main form data element. */
    dataType: string;
    /** Subform apps referenced by this app, each with its own data type. */
    subForms: CatalogueSubform[];
}

/**
 * The shared list, carrying only the fields this server serves.
 *
 * The package also holds the layout files a few apps name, which the components API reads and nothing here does.
 * `GET /catalogue` answers with this array as it stands, so letting a new field through would change that response
 * as a side effect of sharing the data rather than because anything asked for it.
 */
export const appCatalogue: CatalogueApp[] = sharedCatalogue.map((entry) => ({
    org: entry.org,
    app: entry.app,
    dataType: entry.dataType,
    subForms: entry.subForms
}));
