# altinn-studio-api-tools

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest. It fetches a test user token from LocalTest, targets an org and app, posts one or more data elements, and shows the full request and response log for every call it made. It reads data back as well, so an instance can be inspected, validated, previewed as a pdf, edited and reposted, or deleted.

Everything is addressed relative to `ALTINN_APP_HOST`, so it only talks to a local Altinn. It has no knowledge of tt02 or production.

**[Documentation](https://arkitektum.github.io/altinn-studio-api-tools/)** for everything in detail. This page is the overview.

## Quick start

You need Node 22.12 or later, and localtest running with apps on `local.altinn.cloud:8000` and LocalTest on `localhost:5101`.

```bash
npm install
npm run dev
```

- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:4000/api

No configuration is needed if your localtest uses the default ports. Otherwise copy `server/.env.example` to `server/.env` and adjust `ALTINN_APP_HOST` and `ALTINN_LOCALTEST_URL`. The header shows a status dot for the app host, for whether LocalTest is answering, and for the active token.

## Using it

The interface has three columns: the test user on the left, the target app, payload and fetch controls in the middle, and the validation results and run log on the right. Panels appear as they become usable rather than sitting there dead, so a cold start shows only the two you can act on.

The quickest path to a full submission, where the user id is the only thing you type:

1. Pick a test user and press **Get token**. The party id is filled in from the token's claim.
2. Pick `dibk/et-v4` from **Application**, which fills in the org, the app and the main data type.
3. Nothing to press: the app is read for you, so the data type and party pickers come from the app itself.
4. The first payload element already holds the ET example. Press **+ Add data element**, choose the Gjennomføringsplan subform, and its example loads too.
5. **New instance** is already selected in Instances, so press **Post**.

The instance is then read back and validated automatically, with every request in the run log. From there you can read a data element, load it into the payload editor and post it again, advance the process, preview the receipt pdf, or delete the instance.

For an app the catalogue does not list, pick **Other application** and type the org and app. Everything after that is the same. If the post button is disabled, the line above it says what is missing.

## What it can do

|                                                                                                                              |                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Test user](https://arkitektum.github.io/altinn-studio-api-tools/test-user/)                                                 | Tokens from LocalTest's own user list, any user id by hand, renew in place, or paste a token |
| [Target](https://arkitektum.github.io/altinn-studio-api-tools/target/)                                                       | 25 applications to pick from or one you type, read for its data types and parties            |
| [Payload](https://arkitektum.github.io/altinn-studio-api-tools/payload/)                                                     | One card per data element, from a shipped example, a file off disk, or by hand               |
| [Posting](https://arkitektum.github.io/altinn-studio-api-tools/posting/)                                                     | A new instance or an existing one, read back and validated after every post                  |
| [Reading data back](https://arkitektum.github.io/altinn-studio-api-tools/reading-data-back/)                                 | List a party's instances, read and validate, download, load into the payload, delete         |
| [Compare with stored](https://arkitektum.github.io/altinn-studio-api-tools/reading-data-back/#comparing-with-the-stored-xml) | What the model dropped, added or rewrote when it stored your xml                             |
| [Process](https://arkitektum.github.io/altinn-studio-api-tools/process/)                                                     | Where the instance stands, and advancing it                                                  |
| [Validation and the run log](https://arkitektum.github.io/altinn-studio-api-tools/validation-and-log/)                       | Issues by severity, every request with both bodies, and copy as curl                         |
| [API](https://arkitektum.github.io/altinn-studio-api-tools/api/)                                                             | The backend on its own, for scripting a data load                                            |

73 example XML files and 23 dummy attachments ship in `examples/`, or point `ALTINN_EXAMPLE_DATA_DIR` at your own. See [Example data](https://arkitektum.github.io/altinn-studio-api-tools/example-data/).

## Scripts

| Command                           |                                                          |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Both servers with prefixed output                        |
| `npm test`                        | Server and web tests, stubbed Altinn, no network         |
| `npm run typecheck`               | Both workspaces                                          |
| `npm run build`                   | Compile the server and bundle the UI                     |
| `npm run format`                  | Format everything with Prettier                          |
| `npm run gaps --workspace server` | Which content types your apps declare that have no dummy |

## Working on it

- [ARCHITECTURE.md](ARCHITECTURE.md) for why there is a server at all, how a request flows through it, and where state lives.
- [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop, the test approach and the house style.
- [SECURITY.md](SECURITY.md) for how test tokens are handled and what the browser stores.
