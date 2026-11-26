# altinn-studio-api-tools

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest. It fetches a test user token from LocalTest, targets an org and app, posts one or more data elements, and shows the full request and response log for every call it made. It reads data back as well, so an instance can be inspected, validated, previewed as a pdf, edited and reposted, or deleted.

Every Altinn call is addressed relative to `ALTINN_APP_HOST`, so it only talks to a local Altinn, never tt02 or production. Two calls go elsewhere, both hosted, both carrying no token: the DIBK validation service, which answers what a submission requires, and the FtPB testmotor, which serves the main form and subform examples. They can be switched off with `VALIDATION_URL` and `TESTMOTOR_URL`.

**[Documentation](https://arkitektum.github.io/altinn-studio-api-tools/)** for everything in detail. This page is the overview.

## Quick start

You need Node 24 or later, Yarn 4 through [Corepack](https://nodejs.org/api/corepack.html), and localtest running with apps on `local.altinn.cloud:8000` and LocalTest on `localhost:5101`.

```bash
corepack enable
yarn install
yarn dev
```

The UI is on http://127.0.0.1:5173 and the API on http://127.0.0.1:4000/api. Other ports go in `server/.env`, see [Configuration](https://arkitektum.github.io/altinn-studio-api-tools/configuration/).

[Getting started](https://arkitektum.github.io/altinn-studio-api-tools/getting-started/) walks through a full submission, and [The interface](https://arkitektum.github.io/altinn-studio-api-tools/interface/) explains the three columns.

## What it can do

|                                                                                                                              |                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Test user](https://arkitektum.github.io/altinn-studio-api-tools/test-user/)                                                 | Tokens from LocalTest's own user list, any user id by hand, and renew in place                         |
| [Target](https://arkitektum.github.io/altinn-studio-api-tools/target/)                                                       | The shared catalogue's applications to pick from, or one you type, read for its data types and parties |
| [Payload](https://arkitektum.github.io/altinn-studio-api-tools/payload/)                                                     | One card per data element, from a shipped example, a file off disk, or by hand                         |
| [Prevalidation](https://arkitektum.github.io/altinn-studio-api-tools/payload/#prevalidate)                                   | What a refused submit would have said, asked before you send it                                        |
| [Posting](https://arkitektum.github.io/altinn-studio-api-tools/posting/)                                                     | A new instance or an existing one, read back and validated after every post                            |
| [Reading data back](https://arkitektum.github.io/altinn-studio-api-tools/reading-data-back/)                                 | List a party's instances, read and validate, download, delete                                          |
| [Compare with stored](https://arkitektum.github.io/altinn-studio-api-tools/reading-data-back/#comparing-with-the-stored-xml) | What the model dropped, added or rewrote when it stored your xml                                       |
| [Process](https://arkitektum.github.io/altinn-studio-api-tools/process/)                                                     | Where the instance stands, and advancing it                                                            |
| [Validation and the run log](https://arkitektum.github.io/altinn-studio-api-tools/validation-and-log/)                       | Issues by severity, every request with both bodies, and copy as curl                                   |
| [API](https://arkitektum.github.io/altinn-studio-api-tools/api/)                                                             | The backend on its own, for scripting a data load                                                      |

Main form and subform examples come from the FtPB testmotor, which keeps the main forms current and re-dates them per request. 23 dummy attachments ship in `examples/`, or point `ALTINN_EXAMPLE_DATA_DIR` at your own. See [Example data](https://arkitektum.github.io/altinn-studio-api-tools/example-data/).

## Scripts

| Command                               |                                                               |
| ------------------------------------- | ------------------------------------------------------------- |
| `yarn dev`                            | Both servers with prefixed output                             |
| `yarn test`                           | Server and web tests, stubbed Altinn, no network              |
| `yarn typecheck`                      | Both workspaces                                               |
| `yarn build`                          | Compile the server and bundle the UI                          |
| `yarn lint`                           | oxlint                                                        |
| `yarn format`                         | Format everything with Prettier                               |
| `yarn workspace server run gaps`      | Which content types your apps declare that have no dummy      |
| `yarn workspace server run diff`      | Posts every example and reports what each app's model changed |
| `yarn workspace server run catalogue` | Where the catalogue and the testmotor have drifted apart      |

`yarn dev` is how you run the tool. `yarn build` only checks that the server compiles and the UI bundles. Nothing serves `web/dist`, and `yarn start` runs the api alone.

## Working on it

- [ARCHITECTURE.md](ARCHITECTURE.md) for why there is a server at all, how a request flows through it, and where state lives.
- [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop, the test approach and the house style.
- [SECURITY.md](SECURITY.md) for how test tokens are handled and what the browser stores.

## Licence

[MIT](LICENSE)
