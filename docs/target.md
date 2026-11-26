---
title: Target
nav_order: 5
---

# Target

The panel waits for a token, since reading the app takes one.

Enter an org and app and the tool reads the app itself. `/api/v1/applicationmetadata` fills the data type picker, and `/api/v1/parties?allowedToInstantiateFilter=true` fills the party picker with subunits flattened, so you do not have to guess a party id that would return 403.

Both reads happen on their own once there is a token and a target. `allowedToInstantiateFilter=true` only filters the list of parties, so nothing is created. The badge in the panel header says how many data types came back.

The read is debounced, because org and app are typed a character at a time and `et-v4` would otherwise be five requests. It is attempted once per token and target, so an app that is not running does not get retried forever. A failure shows the app's own reason with a **Try again** next to it, which is what you want when the app was simply not up yet.

A result belongs to one org and app, so changing either drops it and reads the new target instead.

## Application

A select, which is the only way to choose one. The list is `@arkitektum/ftpb-app-catalogue`, the org and app pairs together with the data type each uses for its form data, shared with the components API so the two cannot drift apart. Picking one fills in the org, the app and the main data type at once, and that app's subform data types become suggestions on any elements you add.

**Other application** reveals an org and an app field, for an app the catalogue has never heard of, which is the case for one you have just started building. The read happens as soon as both are filled in, so it costs nothing beyond the typing. What you lose is the catalogue's data type suggestions, which is only a head start: the app's own `applicationmetadata` takes over the moment it is read, catalogued or not.

Whether the fields are showing is worked out rather than remembered, so an app that is in the catalogue does not look hand-typed just because the catalogue had not loaded yet when the page did.

## Instance owner party

A select, since everything below depends on it: what the instance list asks about, and who a new instance belongs to.

It offers the parties the app says this token may instantiate for, with subunits flattened out of Altinn's nesting, so a party that would return 403 is not on the list. The party prefilled from the token's `urn:altinn:partyid` claim is offered too, marked as coming from the token, because it is not always among the instantiable ones and the select would otherwise show no selection at all.

Choosing a party drops the selected instance, since it belonged to the previous one.

## Where a post goes

Posting follows whatever is selected in [Instances](reading-data-back.md#instances), directly below: its **New instance** row, one of the party's instances, or **Other instance** for one the list does not hold. The **Will call** line lives there too, under the selection that decides it, and shows the URL either way.
