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

## Application

A select, which is the only way to choose one. `server/src/appCatalogue.ts` lists 25 org and app pairs together with the data type each uses for its form data, generated from the same `altinnStudioApps` registry. Picking one fills in the org, the app and the main data type at once, and that app's subform data types become suggestions on any elements you add.

**Other application** reveals an org and an app field, for an app the catalogue has never heard of, which is the case for one you have just started building. The read happens as soon as both are filled in, so it costs nothing beyond the typing. What you lose is the catalogue's data type suggestions, which is only a head start: the app's own `applicationmetadata` takes over the moment it is read, catalogued or not.

Whether the fields are showing is worked out rather than remembered, so an app that is in the catalogue does not look hand-typed just because the catalogue had not loaded yet when the page did.

## Instance owner party

A select, since everything below depends on it: what the instance list asks about, and who a new instance belongs to.

It offers the parties the app says this token may instantiate for, with subunits flattened out of Altinn's nesting, so a party that would return 403 is not on the list. There is no field to type one into. The party prefilled from the token's `urn:altinn:partyid` claim is offered too, marked as coming from the token, because it is not always among the instantiable ones and the select would otherwise show no selection at all.

Choosing a party drops the selected instance, since it belonged to the previous one.

## Where a post goes

Not here. Posting follows whatever is selected in [Instances](reading-data-back.md#instances), directly below: its **New instance** row, one of the party's instances, or **Other instance** for one the list does not hold. The **Will call** line at the bottom of this panel shows the URL either way, and says which of the two it is.

## Instance template

Not offered here. Altinn takes a `dueBefore` and a `visibleAfter` when an instance is created, and the api still accepts those and anything else Altinn allows through `instanceTemplate` on `/api/runs`, see [API](api.md). The UI had two fields for them and they earned their space: a deadline and a visibility date are not what a test run is usually about, and a `visibleAfter` in the future hides the instance you just made, including from the listing in this tool.
