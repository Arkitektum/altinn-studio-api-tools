# Security

## What this tool is

A development tool that runs on your own machine and talks to an Altinn Studio localtest instance on the same machine. Everything it addresses is relative to `ALTINN_APP_HOST`, which defaults to `http://local.altinn.cloud:8000`, so it has no knowledge of tt02 or production and no way to reach them without being reconfigured to.

It is not built to be deployed, exposed, or shared. The considerations below are about keeping a local tool from becoming a liability, not about hardening a service.

## Test credentials

Tokens are the sensitive thing here, so they are handled deliberately:

- **Server memory only.** `tokenStore.ts` keeps them in a `Map`. Nothing is written to disk, and restarting the server drops them.
- **The browser never receives one.** It gets an opaque id, the decoded claims, and the expiry. The api has no endpoint that returns a bearer token, and `toPublicToken` strips it on the way out.
- **Expired tokens are pruned.** Listing or storing a token drops any that have expired, and `requireToken` refuses an expired one with a 410 rather than forwarding it.
- **Never logged.** `altinnFetch` reports the headers each request went out with, because the run log's copy-as-curl needs them, and it replaces the authorization value with the literal `Bearer $TOKEN` before returning it. A copied curl command is one `TOKEN=…` away from working and carries no credential. `altinnClient.test.ts` holds that in place, including on the path where the request never got through.

Claims are decoded, never verified. `jwt.ts` says so at the top. The signature is checked by the app that receives the token, which is the party that holds the key; verifying it here would prove nothing about what Altinn will accept.

## What the browser stores

`localStorage`, under the `altinn-api-tools:` prefix. Seven keys, all written by `useLocalStorage`:

| Key                   |                                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| `org`, `app`          | The target                                                                      |
| `partyId`             | The instance owner                                                              |
| `partyAutoFilledFrom` | Which party the tool filled in from a token claim, so a typed one is not undone |
| `instanceGuid`        | The selected instance                                                           |
| `advanceProcess`      | Whether a post also advances the process                                        |
| `dataElements`        | **The payload elements including their content**                                |

The last one is the only entry worth thinking about, because whatever you paste into an editor card stays on disk in your browser profile until you clear it. The destination is not stored: a post follows the selection rather than a setting of its own.

The tool is for test data. Do not paste real personal data into it, and if you already have, clear the payload elements or the site data. The screen that appears when the interface crashes offers to clear all seven, which is the same thing as clearing the site data for this origin.

No token, and no id of a token, is stored in the browser. The token list is fetched from the server again on load.

## Network exposure

Both halves bind `127.0.0.1`. The Vite dev server does, and proxies `/api` so the browser stays same-origin, which keeps token ids out of cross-origin request logs. The api does too, so it answers this machine and nothing else.

That is a decision rather than a default. Anyone who can reach port 4000 can use whatever tokens the server currently holds and post to your local apps, and CORS does not help: it restrains browsers, not `curl`. The server says which address it bound to on startup, since it is the one setting that decides who else can use those tokens.

`HOST=0.0.0.0` opens it to the network, for a container or a colleague's browser. Do that knowing what it hands out, and not on a network you do not trust.

`WEB_ORIGIN` controls the single origin allowed through CORS, defaulting to `http://localhost:5173`.

## Input handling

- **Example files are read under a guard.** `readExample` resolves the requested path against the example root and refuses anything that does not stay inside it, so a `../..` in a filename cannot read arbitrary files. The extension must also appear in `FORMATS`.
- **Request bodies are bounded.** Express parses up to 25 MB, and the file picker refuses anything over 15 MB, since base64 inflates by a third on the way there.
- **Requests to Altinn time out.** 30 seconds by default, `REQUEST_TIMEOUT_MS` to change it.
- **Every api input is parsed.** Endpoints validate with zod and answer 400 with the offending path on a mismatch.

## Destructive operations

The tool can delete instances. Soft delete marks an instance deleted and leaves it in storage; **hard delete removes it and cannot be undone**, which is why it is a checkbox you tick rather than the default reading of an absent parameter, and why delete asks twice with the instance named in the confirmation.

Advancing a process is not reversible either. It submits the current task.

Both act on whatever party id and instance guid are in the fields, against your local Altinn. There is nothing here that can reach a real submission, but there is plenty that can throw away a colleague's local test instance if you are pointed at a shared localtest.

## Reporting something

This is an internal tool with no external users, so there is no disclosure process to follow. If you find something that matters, raise it on the repository's issue tracker or tell the maintainer directly. Include what an attacker would need to be able to do, since for a tool like this the answer is often "already be on your machine", and that changes how urgent it is.
