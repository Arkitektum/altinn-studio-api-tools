---
title: Posting
nav_order: 8
---

# Posting

## Destinations

A switch with two positions:

| Destination           | Calls                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **New instance**      | a single multipart `POST /{org}/{app}/instances` with an `instance` part plus one part per data type |
| **Existing instance** | `POST /{org}/{app}/instances/{party}/{guid}/data?dataType={type}` per data element                   |

The api also takes `mode: "sequential"`, which creates the instance and then posts each data element in its own request. It was a third position on the switch and is not any more: it stored the same thing as multipart with a longer log, and one fewer choice is worth more than the difference. `/api/runs` still accepts it, see [API](api.md).

After a run the instance guid is carried over, so creating an instance and then posting more data onto it means flicking the switch to **Existing instance**.

## What happens after every post

Every post is followed automatically by `GET .../instances/{party}/{guid}` and `GET .../instances/{party}/{guid}/validate`, so the log always shows what Altinn actually stored and whether it validates. Those two requests are appended to the same log entry as the post, and the verdict gains a data element count, the current task and an issue summary.

The data element select in the Fetch panel is filled in at the same time, so validating or reading a single element afterwards needs no extra click. A post that fails skips both follow-ups, since there is no instance to read.

**Advance process** is the one option that applies to any run, calling `PUT .../process/next` to submit the step. It runs after the data is stored, and after validation when both are asked for.

## Max count behaviour

Altinn creates the data element for a form data type automatically when the instance is created, for any type with `maxCount: 1` and an `appLogic` block. A second POST to that data type therefore fails:

```
POST /dibk/et-v4/instances?instanceOwnerPartyId=510001     instance already has an ET element
POST /dibk/et-v4/instances/510001/{guid}/data?dataType=ET  400, max count reached
```

The tool detects the existing element and sends `PUT .../data/{dataElementId}` instead. When this happens the run log says "Replace" rather than "Add". This is what makes the round trip work: read an element back, change it, and post it to the same instance without Altinn refusing it.

## When the post button is disabled

A line above it says what is missing: a valid token, an org, an app, an instance owner party id, an instance guid for the existing instance destination, a data type on every element, or content on every element. An element with no content also turns amber in the payload list, so you can see which one it means.
