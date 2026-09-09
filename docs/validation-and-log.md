---
title: Validation and the run log
nav_order: 11
---

# Validation and the run log

The right column. Both arrive with their first content and stay put afterwards, so an expired token does not hide what you already read.

## Validation

Its own panel, separate from the run log, holding one result per thing validated: the instance, and each data element you have validated. Results are grouped by target so several can be on screen at once, with the instance first and the data elements after it by name. Validating the same target again replaces its result rather than adding another, so what you see is always current.

Every result starts folded, showing its label, its worst severity and a count. Expanded issue lists run long enough to push the run log off screen, so the headers are the default view and you open the one you want. Inside an open result, issues are grouped by severity with the worst first and each group folds too. Errors start open because they are what blocks a submission, while warnings and anything else start folded with their counts still showing.

Each issue shows its code, the data type it belongs to, the description and the field path, on a severity coloured card. The `dataElementId` is resolved to a data type name when the instance read is available, so an issue says `ET` rather than a guid, and the full `source` sits in the tooltip on the code.

The panel only changes when something validates. Fetching an instance or a data element afterwards leaves the issues on screen, so they stay readable while you fix the payload. Issues describe one instance, so selecting another one clears them rather than leaving results that no longer apply, and **Clear results** empties the panel by hand. Posting creates a new instance, which likewise drops the previous instance's results.

## Run log

Every call in order with method, URL, status, duration, and both bodies, plus a link that opens the instance in the app.

That link is a deep link, `{app}/#/instance/{party}/{guid}`, and the trailing slash before the hash matters: without it the app frontend is not served. Opening it needs a LocalTest session in the browser, which the tool cannot provide because its token lives in server memory. Until you have one, Altinn bounces to LocalTest's front page with a `goto` parameter, and the fragment is lost on the way back, so **Log in to LocalTest** sits next to the link for exactly that first trip.

Runs are kept rather than replaced. Each one is a row showing what it was, how many steps it took, how long it ran and when, and the newest is open while the rest fold to a single line. Posts, fetches, validations, process moves and deletes all land here, so a fetch does not wipe the post you are looking at. **Clear history** empties it, and the last 25 runs are kept.

A post and the read and validation that follow it share one entry, because they are separate requests but one story. Their steps are renumbered across the lot so the indexes stay unique.

## Bodies

**Show bodies** on a step reveals the request as it was sent and the response as it came back, coloured the same way the payload editor is. A step that made no request has neither.

The log column is 480px wide, which is not enough for a form's XML, so each body has a **Maximize** button that opens it in a window over the tool at full size, with its own **Copy**. Widening the column for the one case that needs it would have cost the middle column the rest of the time.

A request body is coloured by the content type it went out with, so a multipart body, which is several bodies with headers between them, is left plain rather than coloured as though it were one document.

## Copy curl

Every step carries a **Copy curl** button, and each body a **Copy**, since the usual next move after a surprising log entry is handing the request to someone else. The command reads:

```bash
curl -i -X POST 'http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/{guid}/data?dataType=ET' \
  -H 'accept: application/json' \
  -H 'authorization: Bearer $TOKEN' \
  -H 'content-type: application/xml' \
  --data-binary '<ET>…</ET>'
```

The headers are the ones the request actually went out with, recorded as they were built, so a data element read carries its `accept: */*` and an upload its real content type. The bearer token is replaced with the literal `$TOKEN` at that point, which is why the browser can be given the headers at all: run `TOKEN=$(…)` first and the command works.

Two kinds of step cannot be replayed as written, because their logged body is a summary and not the payload: a base64 attachment, which is logged as a byte count, and a multipart instantiation, which is mostly boundaries. Those commands come with a comment saying so and a `--data-binary @body` for you to fill in, rather than quietly posting the summary.

## Reading a failure

A failed request is still a result. The entry shows the reason on a red notice, the steps up to the point of failure, and the app's own message on the failing step, which is usually the useful part: which validation refused, which party is not allowed, which data type hit its max count.

Status colours are by class, so 4xx is usually something about the request and 5xx is the app falling over. See [The interface](interface.md#colour-encodes-rather-than-decorates).
