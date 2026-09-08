---
title: Process
nav_order: 10
---

# Process

Where the instance stands, and the button that moves it on. The panel shows the current task and its Altinn task type, when the process started, and when it ended together with the end event once it has. The badge in the header repeats the same thing in one line, so a folded glance is enough.

The state comes out of the instance read rather than from a request of its own, so the panel appears as soon as an instance is selected or a post has created one, and it says nothing until then. Selecting another instance clears it, since it described the one you just left.

## Advancing

**Advance process** calls `PUT .../instances/{party}/{guid}/process/next`, the same call the post flow's advance checkbox makes.

The app validates before it moves, so a refusal here is usually validation talking, and it lands in the run log with the app's own reason rather than as an error that hides it. The move answers with the process it landed in, so the panel updates without another read, and a refused move leaves the task the instance is still in on screen rather than blanking it.

An ended process hides the button, since there is nowhere left to go. Post to a new instance to walk it again.

Advancing is not reversible. It submits the current task.

## Task types

The task type is Altinn's `altinnTaskType` for the current task: `data`, `confirmation`, `feedback`, `signing` or `payment`. It tells you what the app expects next, which is often why an advance was refused.
