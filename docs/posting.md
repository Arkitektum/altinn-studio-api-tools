---
title: Posting
nav_order: 8
---

# Posting

## Where a post goes

There is no destination setting. What a post does follows from what is selected in [Instances](reading-data-back.md#instances):

| Selected             | Calls                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| **New instance**     | a single multipart `POST /{org}/{app}/instances` with an `instance` part plus one part per data type |
| An existing instance | `POST /{org}/{app}/instances/{party}/{guid}/data?dataType={type}` per data element                   |

The two used to be separate controls, a destination switch and a list, which could disagree: "existing instance" with nothing selected was a state you could be in, and the post button had to explain itself. One selection cannot contradict itself, so the switch is gone and the list carries a **New instance** row at the top instead.

The post button says which of the two it will do, and the **Will call** line in Target shows the URL.

After a post the new instance becomes the selected one, so it is what the Data element, Process and validation panels now point at, and another post would add data to it. Pick **New instance** again to make a second one.

The api also takes `mode: "sequential"`, which creates the instance and then posts each data element in its own request. It was a third position on the old switch and is not offered any more: it stored the same thing as multipart with a longer log. `/api/runs` still accepts it, see [API](api.md).

## What happens after every post

Every post is followed automatically by `GET .../instances/{party}/{guid}` and `GET .../instances/{party}/{guid}/validate`, so the log always shows what Altinn actually stored and whether it validates. Those two requests are appended to the same log entry as the post, and the verdict gains a data element count, the current task and an issue summary.

The data element select is filled in at the same time, so validating or reading a single element afterwards needs no extra click. A post that fails skips both follow-ups, since there is no instance to read.

**Sign and submit once it is posted** is the one option that applies to any run, calling `PUT .../process/next` to submit the step, with the action for the task the instance is in, read off the instance itself. See [Process](process.md#advancing). It runs after the data is stored, and after validation when both are asked for.

## Max count behaviour

Altinn creates the data element for a form data type automatically when the instance is created, for any type with `maxCount: 1` and an `appLogic` block. A second POST to that data type therefore fails:

```
POST /dibk/et-v4/instances?instanceOwnerPartyId=510001     instance already has an ET element
POST /dibk/et-v4/instances/510001/{guid}/data?dataType=ET  400, max count reached
```

The tool detects the existing element and sends `PUT .../data/{dataElementId}` instead. When this happens the run log says "Replace" rather than "Add". This is what makes posting to an instance that already has its form work: a `maxCount: 1` data type has one element from the moment the instance is created, so a post to it is a change to that element rather than a second one Altinn would refuse.

## When the post button is disabled

A line above it says what is missing: a valid token, an org, an app, an instance owner party, a data type on every element, or content on every element. An element with no content also turns amber in the payload list, so you can see which one it means.
