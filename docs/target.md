---
title: Target
nav_order: 5
---

# Target

Enter org and app, then press **Probe app**. This reads `/api/v1/applicationmetadata` to fill the data type picker, and `/api/v1/parties?allowedToInstantiateFilter=true` to fill the party picker with subunits flattened, so you do not have to guess a party id that would return 403. A **Will call** line shows the exact URL that is about to be requested.

A probe result belongs to one org and app, so changing either drops it.

## Known apps

`server/src/appCatalogue.ts` lists 25 known org and app pairs together with the data type each app uses for its form data, generated from the same `altinnStudioApps` registry. Picking an app from the **Known app** dropdown fills in org, app, and the main data type at once, and the app's subform data types become suggestions on any elements you add.

The catalogue is only a convenience. Once you probe an app, its own `applicationmetadata` takes over.

## Party

The party id is prefilled from the token's claim. Once the app has been probed, the picker above the field lists the parties that token is allowed to instantiate for, with subunits flattened out of Altinn's nesting. A party typed by hand is left alone when you switch token.

## Destination

Three destinations, described in [Posting](posting.md). The **Instance guid** field appears for the existing instance destination, and pasting a full `510001/99d0632c-…` pair into it splits the party id out for you.

## Instance template

Two optional fields, **Due before** and **Visible after**, for the cases where an instance needs a deadline or a date before which it is not visible. Both are local wall clock in the input and go out as UTC.

Leaving them empty is the normal case and sends no template at all, which keeps the simpler request with the party in the query string. Setting either moves the party into the instance body, because the query string form carries nothing else. The **Will call** line says which of the two it will be.

A visible after date in the future warns, since it hides the instance you just made, including from the instance listing in this tool. The fields are not offered for the existing instance destination, where Altinn ignores them.

Altinn's instance template takes more than these two. The api accepts any of it through `instanceTemplate` on `/api/runs`, see [API](api.md), and the UI offers the two that a test run has a use for.
