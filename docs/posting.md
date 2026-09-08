---
title: Posting
nav_order: 8
---

# Posting

## Destinations

| Destination                                          | Calls                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| New instance, one request per data element (default) | `POST /{org}/{app}/instances?instanceOwnerPartyId={party}`, then one request per data element        |
| New instance, all data in one request                | a single multipart `POST /{org}/{app}/instances` with an `instance` part plus one part per data type |
| Existing instance                                    | `POST /{org}/{app}/instances/{party}/{guid}/data?dataType={type}`                                    |

The first row's query string form is what you get with no instance template. With one, the party moves into a json instance body on the same URL, since the query string carries nothing but the party. The multipart row already sends an instance part, so a template just goes in it. See [Instance template](target.md#instance-template).

One request per data element gives the clearest log, since every element has its own step, status and timing. All data in one request is closer to what a real client does, and it is the only way to create an instance and its data in a single call.

After a run the instance guid is carried into the existing instance field, so creating an instance and then posting more data onto it takes two clicks.

## What happens after every post

Every post is followed automatically by `GET .../instances/{party}/{guid}` and `GET .../instances/{party}/{guid}/validate`, so the log always shows what Altinn actually stored and whether it validates. Those two requests are appended to the same log entry as the post, and the verdict gains a data element count, the current task and an issue summary.

The data element select in the Fetch panel is filled in at the same time, so validating or reading a single element afterwards needs no extra click. A post that fails skips both follow-ups, since there is no instance to read.

**Advance process** is the one option that applies to any run, calling `PUT .../process/next` to submit the step. It runs after the data is stored, and after validation when both are asked for.

## Repeat

**Repeat** next to the post button posts the same payload more than once, for building up test data without clicking the same button ten times. The posts run one after another rather than at once, so the log stays in order and localtest is not hammered, and the button counts them off as "Posting 3 of 10".

Each one is read back and validated like any other post, and a failure stops the rest instead of failing the same way another forty times. Up to 50 in one go, which is high enough to be useful and low enough that an extra digit does not run for minutes. The run log keeps the last 25 entries, so a long repeat pushes its own early runs out.

The destination decides what repeating means. Against a new instance it makes that many instances, and against an existing one it posts onto the same instance that many times, aiming each post at the instance you chose rather than at the one the previous post created.

## Max count behaviour

Altinn creates the data element for a form data type automatically when the instance is created, for any type with `maxCount: 1` and an `appLogic` block. A second POST to that data type therefore fails:

```
POST /dibk/et-v4/instances?instanceOwnerPartyId=510001     instance already has an ET element
POST /dibk/et-v4/instances/510001/{guid}/data?dataType=ET  400, max count reached
```

The tool detects the existing element and sends `PUT .../data/{dataElementId}` instead. When this happens the run log says "Replace" rather than "Add". This is what makes the round trip work: read an element back, change it, and post it to the same instance without Altinn refusing it.

## When the post button is disabled

A line above it says what is missing: a valid token, an org, an app, an instance owner party id, an instance guid for the existing instance destination, a data type on every element, or content on every element. An element with no content also turns amber in the payload list, so you can see which one it means.
