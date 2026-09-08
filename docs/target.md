---
title: Target
nav_order: 5
---

# Target

Enter an org and app and the tool reads the app itself. `/api/v1/applicationmetadata` fills the data type picker, and `/api/v1/parties?allowedToInstantiateFilter=true` fills the party picker with subunits flattened, so you do not have to guess a party id that would return 403. A **Will call** line shows the exact URL that is about to be requested.

There is no button for it. Both are reads, and `allowedToInstantiateFilter=true` filters the list of parties rather than instantiating anything, so nothing is created and there is nothing to decide: it happens once there is a token and a target. The badge in the panel header says how many data types came back.

The read is debounced, because org and app are typed a character at a time and `et-v4` would otherwise be five requests. It is attempted once per token and target, so an app that is not running does not get retried forever. A failure shows the app's own reason with a **Try again** next to it, which is what you want when the app was simply not up yet.

A result belongs to one org and app, so changing either drops it and reads the new target instead.

There is deliberately no link to the app root here. Altinn instantiates from it, so opening it left a new empty instance behind every time, which is rarely what anyone wanted from a link called "open app". To open an instance you actually have, use **Open** on its row in [Instances](reading-data-back.md#instances), or the link on its run log entry. The api still reports the app's url as `appUrl` on `/api/app/metadata` for a caller that wants it.

## Known apps

`server/src/appCatalogue.ts` lists 25 known org and app pairs together with the data type each app uses for its form data, generated from the same `altinnStudioApps` registry. Picking an app from the **Known app** dropdown fills in org, app, and the main data type at once, and the app's subform data types become suggestions on any elements you add.

The catalogue is only a convenience. Once you probe an app, its own `applicationmetadata` takes over.

## Instance owner party

A select, above the destination, since everything below depends on it: what the instance list asks about, and who a new instance belongs to.

It offers the parties the app says this token may instantiate for, with subunits flattened out of Altinn's nesting, so a party that would return 403 is not on the list. There is no field to type one into. The party prefilled from the token's `urn:altinn:partyid` claim is offered too, marked as coming from the token, because it is not always among the instantiable ones and the select would otherwise show no selection at all.

Choosing a party drops the selected instance, since it belonged to the previous one.

## Destination

A switch: a new instance, or one you already have. Described in [Posting](posting.md).

There is no guid field. For the existing instance destination you pick the instance by its row in [Instances](reading-data-back.md#instances), which sits directly below, and the switch says which one is currently selected. The party comes with it, since a listing is per party and a row knows its own.

## Instance template

Not offered here. Altinn takes a `dueBefore` and a `visibleAfter` when an instance is created, and the api still accepts those and anything else Altinn allows through `instanceTemplate` on `/api/runs`, see [API](api.md). The UI had two fields for them and they earned their space: a deadline and a visibility date are not what a test run is usually about, and a `visibleAfter` in the future hides the instance you just made, including from the listing in this tool.
