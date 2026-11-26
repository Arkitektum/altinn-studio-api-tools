---
title: Validation and the run log
nav_order: 11
---

# Validation and the run log

The right column. Both are there from the first render, each saying what it will hold until it holds it, and they stay put afterwards, so an expired token does not hide what you already read.

## Validation

Its own panel, separate from the run log, holding one result per thing validated: the instance, and each data element you have validated. Results are grouped by target so several can be on screen at once, with the instance first and the data elements after it by name. Validating the same target again replaces its result rather than adding another, so what you see is always current.

Every result starts folded, showing its label, its worst severity and a count, so the run log stays on screen. Open a result and every issue in it is there, worst first, each run of a severity under a line naming it: "2 errors", then the two cards, then "2 warnings".

The list is indented under the result that holds it, to the width of that result's chevron.

Each issue shows its code, the data type it belongs to, the description and the field path, on a card edged in the colour of its severity. The line above the run names that severity in words, since a colour says nothing to a reader who does not see it. The `dataElementId` is resolved to a data type name when the instance read is available, so an issue says `ET` rather than a guid, and the full `source` sits in the tooltip on the code.

The panel only changes when something validates. Fetching an instance or a data element afterwards leaves the issues on screen, so they stay readable while you fix the payload. Issues describe one instance, so selecting another one clears them rather than leaving results that no longer apply, and **Clear results** empties the panel by hand. Posting creates a new instance, which likewise drops the previous instance's results.

## Run log

Every call in order with method, URL, status, duration, and both bodies.

Runs are kept rather than replaced. Each one is a row showing what it was, how many steps it took, how long it ran and when, and the newest is open while the rest fold to a single line. Posts, fetches, validations, process moves and deletes all land here, so a fetch does not wipe the post you are looking at. **Clear history** empties it, and the last 25 runs are kept.

A post and the read and validation that follow it share one entry, because they are separate requests but one story. Their steps are renumbered across the lot so the indexes stay unique.

## Bodies

A step is one target: click the block anywhere and the request opens in a window over the tool. The status and the timing sit with the title, so the body of the window starts with the url and gets to the bodies in a line or two, coloured the same way the payload editor is. Each body scrolls inside itself, so the url stays in view, and each carries its **Copy** pinned in its own top right corner. A step that made no request and carries no body is not clickable, and says so by not lighting up.

The block itself carries no controls. The log column is 640px wide, or 40% of the window where that is more, and the window gives the bodies more room than that.

A request body is coloured by the content type it went out with, so a multipart body, which is several bodies with headers between them, is left plain rather than coloured as though it were one document.

## Copy curl

**Copy curl** sits in the header of the window a step opens, and each body has its own **Copy**, since the usual next move after a surprising log entry is handing the request to someone else. The command reads:

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
