## What this changes

<!-- What it does now that it did not before, or does differently. -->

## Why

<!--
Whatever is not obvious from the diff: the failure that prompted it, the decision behind a choice
that could have gone another way, or what you tried first and dropped. This is the part a reader
in six months cannot reconstruct.
-->

## Checks

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run format`
- [ ] Behaviour that changed is documented: the relevant page under `docs/`, and the README if it is in the overview or the walkthrough
- [ ] A pure decision landed in `web/src/lib/` with a test, rather than inline in a component
- [ ] A new call to Altinn goes through `altinnFetch` and, if it acts on an instance, `StepRecorder`, so it shows up in the run log

CI runs the first three anyway. The rest are the ones a green build cannot tell you about, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Anything left

<!-- Known gaps, follow-ups worth their own issue, or a decision you would rather have reviewed. -->
