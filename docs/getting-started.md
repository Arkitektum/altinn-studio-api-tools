---
title: Getting started
nav_order: 2
---

# Getting started

## Running it

You need Node 22.12 or later, and Altinn Studio localtest running with apps served on `local.altinn.cloud:8000` and LocalTest itself on `localhost:5101`.

```bash
npm install
npm run dev
```

- UI: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:4000/api>

No configuration is needed if your localtest uses the default ports. Otherwise copy `server/.env.example` to `server/.env` and adjust, see [Configuration](configuration.md).

The header shows a status dot for the app host, for whether LocalTest is answering, and for the active token. If LocalTest is not answering, the Test user panel says so and names the URL it tried.

## The quickest path to a full submission

The user id is the only thing you type:

1. Pick a test user and press **Get token**. The party id is filled in from the token's claim.
2. Pick `dibk/et-v4` from **Application**, which fills in the org, the app and the main data type.
3. The app is read for you, so the data type picker and the party picker now come from the app itself.
4. The first payload element already holds the ET example, loaded when the data type was set. Press **+ Add data element**, choose the Gjennomføringsplan subform, and its example loads too.
5. **New instance** is selected in Instances, so press **Post**.

What you get back is the instance, read and validated automatically, with every request in the run log. Selecting any other instance reads and validates that one the same way. From there [read it back](reading-data-back.md), [advance the process](process.md), or render the pdf.

## Doing it by hand instead

1. **Test user.** Pick a user, or choose **Other user id** and type one. See [Test user](test-user.md).
2. **Target.** Pick an application, or **Other application** and type an org and app, which the tool then reads for its data types and parties. Then pick a party the token is allowed to instantiate for. See [Target](target.md).
3. **Payload.** Choose a data type, then load an example, pick a file off disk, or paste XML or JSON. See [Payload](payload.md).
4. **Post.** Pick **New instance** or an existing one in Instances, then press the post button. The line above it says what is missing if the button is disabled. See [Posting](posting.md).

## Scripts

| Command                           |                                                               |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                     | Both servers with prefixed output                             |
| `npm test`                        | Server and web tests, stubbed Altinn, no network              |
| `npm run typecheck`               | Both workspaces                                               |
| `npm run build`                   | Compile the server and bundle the UI                          |
| `npm run format`                  | Format everything with Prettier                               |
| `npm run format:check`            | Fail if anything is unformatted, for CI                       |
| `npm run gaps --workspace server` | Which content types your apps declare that have no dummy      |
| `npm run diff --workspace server` | Posts every example and reports what each app's model changed |

For the development loop in more detail, see [CONTRIBUTING.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/CONTRIBUTING.md).
