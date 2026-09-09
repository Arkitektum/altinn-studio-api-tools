---
title: API
nav_order: 12
---

# API

The backend is usable on its own, which is useful for scripting a data load.

| Method   | Path                                   | Notes                                                                            |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                          |                                                                                  |
| `GET`    | `/api/config`                          | Resolved `appHost` and `localtestUrl`                                            |
| `GET`    | `/api/localtest/status`                | Whether LocalTest is reachable                                                   |
| `GET`    | `/api/localtest/users`                 | Its test users, with `source` naming where the list came from                    |
| `GET`    | `/api/catalogue`                       | Known org and app pairs with their data types and subforms                       |
| `GET`    | `/api/examples`                        | Example files grouped by data type                                               |
| `GET`    | `/api/examples/file`                   | `?kind=form\|subform&dataType=ET&name=01_Maksimumsversjon.xml`                   |
| `POST`   | `/api/tokens/test-user`                | Takes `{userId}` and calls `/Home/GetTestUserToken/{userId}`                     |
| `POST`   | `/api/tokens/raw`                      | Takes `{token}` to store a token you already have                                |
| `GET`    | `/api/tokens`                          | Claims only, never the bearer token                                              |
| `DELETE` | `/api/tokens/:id`                      |                                                                                  |
| `GET`    | `/api/app/metadata`                    | `?tokenId&org&app`                                                               |
| `GET`    | `/api/app/parties`                     | `?tokenId&org&app`                                                               |
| `POST`   | `/api/runs`                            | The orchestrator, described below                                                |
| `GET`    | `/api/instances/active`                | List a party's instances. `?tokenId&org&app&instanceOwnerPartyId`                |
| `GET`    | `/api/instances`                       | Get an instance. `?tokenId&org&app&instanceOwnerPartyId&instanceGuid`            |
| `GET`    | `/api/instances/data-element`          | Get one data element. Same query plus `&dataGuid`                                |
| `GET`    | `/api/instances/validate`              | Validate an instance. Same query as `/api/instances`                             |
| `GET`    | `/api/instances/data-element/validate` | Validate one data element. Same query plus `&dataGuid`                           |
| `GET`    | `/api/instances/pdf-preview`           | Render the receipt pdf. Same query as `/api/instances`                           |
| `POST`   | `/api/instances/data-element/compare`  | The stored xml against `left`. Body: the query fields plus `dataGuid` and `left` |
| `DELETE` | `/api/instances`                       | Delete an instance. Same query plus `&hard=true` for a hard delete               |
| `PUT`    | `/api/instances/process/next`          | Advance an existing instance. Same body as `/api/instances`'s query              |

## Scripting a data load

```bash
TOKEN_ID=$(curl -s localhost:4000/api/tokens/test-user \
  -H 'content-type: application/json' -d '{"userId":"1001"}' | jq -r .id)

# create an instance for party 510001 and post ET into it
curl -s localhost:4000/api/runs -H 'content-type: application/json' -d "{
  \"tokenId\": \"$TOKEN_ID\",
  \"org\": \"dibk\",
  \"app\": \"et-v4\",
  \"instanceOwnerPartyId\": \"510001\",
  \"dataElements\": [{ \"dataType\": \"ET\", \"content\": \"<ET><a>1</a></ET>\" }],
  \"validate\": true
}" | jq '{ok, instanceGuid, steps: [.steps[] | "\(.method) \(.status) \(.name)"]}'

# post another data element onto an instance that already exists
curl -s localhost:4000/api/runs -H 'content-type: application/json' -d "{
  \"tokenId\": \"$TOKEN_ID\",
  \"org\": \"dibk\", \"app\": \"et-v4\",
  \"instanceOwnerPartyId\": \"510001\",
  \"mode\": \"existing\",
  \"instanceGuid\": \"99d0632c-5917-448c-8ab6-a5d3b681376b\",
  \"dataElements\": [{ \"dataType\": \"vedlegg\", \"content\": \"...\" }]
}" | jq
```

## The run request

`mode` is `sequential` by default, and can also be `multipart` or `existing`. `instanceGuid` is required for `existing` and ignored otherwise.

A data element takes `dataType` and `content`, plus optionally `encoding` (`utf8` or `base64`), `contentType` and `filename`. Base64 content is decoded before the request goes to Altinn, and `filename` becomes the data element's `Content-Disposition` name, which only attachments want.

`instanceTemplate` is merged into the instance body when creating one, so anything Altinn accepts there can be set, `dueBefore` and `visibleAfter` included. The UI offers none of it, deliberately, so this is the only way to reach it. `validate` and `advanceProcess` are booleans that add a validation call and a `process/next` call after the upload.

## Failures are results

A request that fails still returns `200`, with `ok` set to `false`, a `failedAt` reason, and the step log up to the point of failure. This applies to `/api/runs`, to every read endpoint and to `/api/instances/process/next`, and keeps the whole log available instead of collapsing it into one error.

Malformed requests return `400` with the offending field paths. An unknown `tokenId` returns `404` and an expired one `410`, since neither has a log worth preserving.

Every response that made Altinn calls carries a `steps` array: name, method, url, status, ok, durationMs, the request preview and the response body. It is the same shape the UI renders, so a script can print it as a progress log.
