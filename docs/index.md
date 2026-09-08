---
title: Home
nav_order: 1
---

# Altinn Studio API tools

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest. It fetches a test user token from LocalTest, targets an org and app, posts one or more data elements, and shows the full request and response log for every call it made. It reads data back as well, so an instance can be inspected, validated, previewed as a pdf, edited and reposted, or deleted.

Everything is addressed relative to `ALTINN_APP_HOST`, so the tool only talks to a local Altinn. It has no knowledge of tt02 or production.

## Where to start

- [Getting started](getting-started.md) if you just want it running.
- [The interface](interface.md) for how the three columns fit together and what the colours mean.
- [API](api.md) if you want to script a data load instead of clicking.

## The panels

| Panel                                               | What it is for                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| [Test user](test-user.md)                           | Getting a token from LocalTest, or pasting one                              |
| [Target](target.md)                                 | Which app and which party                                                   |
| [Payload](payload.md)                               | The data elements to post, from an example, a file, or by hand              |
| [Posting](posting.md)                               | What a post calls, and max count behaviour                                  |
| [Instances and Fetch](reading-data-back.md)         | Listing, opening, reading, validating, downloading and deleting an instance |
| [Process](process.md)                               | Where the instance stands, and advancing it                                 |
| [Validation and the run log](validation-and-log.md) | Issues by severity, and every request the tool made                         |

Plus [Example data](example-data.md) for what ships in `examples/` and how to point the tool at your own, and [Configuration](configuration.md) for the environment variables and limits.

## About the code

- [ARCHITECTURE.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/ARCHITECTURE.md) for why there is a server at all, how a request flows through it, and where state lives.
- [CONTRIBUTING.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/CONTRIBUTING.md) for the dev loop, the test approach and the house style.
- [SECURITY.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/SECURITY.md) for how test tokens are handled and what the browser stores.
