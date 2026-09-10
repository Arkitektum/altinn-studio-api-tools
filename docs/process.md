---
title: Process
nav_order: 10
---

# Process

Where the instance stands, and the button that moves it on. The panel shows the current task and its Altinn task type, when the process started, and when it ended together with the end event once it has. The badge in the header repeats the same thing in one line, so a folded glance is enough.

The state comes out of the instance read rather than from a request of its own, so the panel appears as soon as an instance is selected or a post has created one, and it says nothing until then. Selecting another instance clears it, since it described the one you just left.

## Advancing

The button says what the move does to the form rather than what it does to the process. Out of a data task that is **Sign and submit**, which is what moving a form on from its data task is: the same step as pressing send in the app. A signing task reads **Sign**, a confirmation task **Confirm**, a payment task **Pay**, and a task type the tool does not know promises only the move itself, **Advance to the next task**. The run log names the same thing in the past tense, so a submission reads "Signed and submitted" rather than "Advanced process".

Underneath it is one call, `PUT .../instances/{party}/{guid}/process/next`, the same one the post flow's checkbox makes.

The body names the action for the task the instance sits in, so a signing task is advanced with `{"action":"sign"}` and a data task with `{"action":"write"}`. Altinn authorises `process/next` against that action, which is what the app's policy is written against, so naming it means an app that grants only the specific action gets a body it recognises, and the log then shows which action was asked for rather than an empty object that says nothing. The panel prints the body under the URL, so you can see what is about to be sent.

| Task type      | Action    | Button          |
| -------------- | --------- | --------------- |
| `data`         | `write`   | Sign and submit |
| `confirmation` | `confirm` | Confirm         |
| `signing`      | `sign`    | Sign            |
| `payment`      | `pay`     | Pay             |

The task type comes from the process the tool has already read, so naming the action costs no extra request. A task type not in the table, `feedback` among them since the app advances those itself, sends `{}` instead: naming an action the policy does not grant is a 403, where saying nothing lets Altinn pick the one it would have picked anyway.

A successful move is followed by a `GET` of the instance, folded into the same log entry the way a post folds in its follow-ups. Advancing changes more than the task: an app can add data elements on the way out of one, a generated pdf among them, and the panels below would otherwise be showing the list from before the move. The read is the later of the two answers, so the task it reports is the one shown. A read that fails leaves the advance standing, with its own step in the log.

The data element selected before the move stays selected where it survived it, since the panels below are about that element, and otherwise the first of whatever the instance holds now is picked.

The app validates before it moves, so a refusal here is usually validation talking, and it lands in the run log with the app's own reason rather than as an error that hides it. The move answers with the process it landed in, so the panel updates without another read, and a refused move leaves the task the instance is still in on screen rather than blanking it.

An ended process hides the button, since there is nowhere left to go. Post to a new instance to walk it again.

Advancing is not reversible. It submits the current task.

## Task types

The task type is Altinn's `altinnTaskType` for the current task: `data`, `confirmation`, `feedback`, `signing` or `payment`. It tells you what the app expects next, which is often why an advance was refused.
