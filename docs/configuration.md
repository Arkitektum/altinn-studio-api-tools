---
title: Configuration
nav_order: 13
---

# Configuration

Nothing needs configuring if your localtest uses the default ports. Otherwise copy `server/.env.example` to `server/.env` and set what differs.

| Variable                  | Default                          |                                                                              |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `ALTINN_APP_HOST`         | `http://local.altinn.cloud:8000` | Where your locally running Altinn apps are served                            |
| `ALTINN_LOCALTEST_URL`    | `http://localhost:5101`          | The LocalTest project, which mints test user tokens                          |
| `ALTINN_EXAMPLE_DATA_DIR` | `examples/` in the repo          | Point it at your canonical example data, see [Example data](example-data.md) |
| `PORT`                    | `4000`                           | The api                                                                      |
| `WEB_ORIGIN`              | `http://localhost:5173`          | The single origin allowed through CORS                                       |
| `REQUEST_TIMEOUT_MS`      | `30000`                          | How long a call to Altinn may take                                           |

`API_URL` is read by the Vite dev server if you serve the api somewhere other than `http://127.0.0.1:4000`.

The resolved `appHost` and `localtestUrl` are shown in the header and available from `GET /api/config`, so you can tell at a glance which Altinn you are pointed at.

## Limits

- **Local only.** Everything is addressed relative to `ALTINN_APP_HOST`, so the tool has no knowledge of tt02 or production.
- **25 MB request bodies**, and the file picker refuses anything over 15 MB, since base64 inflates by a third on the way there.
- **30 second timeout** on calls to Altinn, `REQUEST_TIMEOUT_MS` to change it.
- **25 runs** kept in the log.
- **50 posts** per repeat.
- **Claims are decoded, never verified.** The app that receives the token does that.

## What is stored where

Tokens live in server memory and are dropped when they expire or when the server restarts. The browser holds an opaque id, never a bearer token.

Everything you typed persists in `localStorage` under the `altinn-api-tools:` prefix, including the payload content, so a refresh does not lose your work. This is a test data tool: do not paste real personal data into it. See [SECURITY.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/SECURITY.md).

## Publishing these docs

This site is the `docs/` folder of the repository, rendered by GitHub Pages. To turn it on: **Settings → Pages → Source: Deploy from a branch**, then branch `main` and folder `/docs`.

The theme is [just-the-docs](https://just-the-docs.com) pulled in as a remote theme, so there is nothing to build and no workflow to maintain. If the remote theme ever fails, replacing `remote_theme:` with `theme: jekyll-theme-primer` in `docs/_config.yml` falls back to a theme GitHub Pages ships itself. The pages are plain markdown either way, and readable in the repository without a site at all.
