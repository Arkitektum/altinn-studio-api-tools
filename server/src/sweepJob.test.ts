import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { HttpError } from "./httpError.js";
import { cancelSweep, resetSweep, startSweep, sweepState, type SweepRunner } from "./sweepJob.js";
import type { SweepRow } from "./sweepService.js";

afterEach(() => resetSweep());

const request = { token: "t", party: "510001", targets: [], keep: false };

const row = (file: string): SweepRow => ({
    app: "dibk/et-v4",
    dataType: "ET",
    file,
    label: file,
    outcome: "identical",
    differences: 0,
    rowIds: 0,
    detail: []
});

/** Lets a test hold a sweep open, feed it rows, and decide when it lands. */
function controllable() {
    let handlers: NonNullable<Parameters<SweepRunner>[1]> = {};
    let settle: (report: Awaited<ReturnType<SweepRunner>>) => void = () => undefined;
    let fail: (error: unknown) => void = () => undefined;

    const run: SweepRunner = (_request, given = {}) => {
        handlers = given;
        return new Promise((resolve, reject) => {
            settle = resolve;
            fail = reject;
        });
    };

    return {
        run,
        plan: (total: number, skipped: string[] = []) => handlers.onPlanned?.(total, skipped),
        emit: (file: string) => handlers.onRow?.(row(file), `dibk/et-v4 ET ${file}`),
        asked: () => handlers.cancelled?.() ?? false,
        finish: (rows: SweepRow[], skipped: string[] = [], cancelled = false) => settle({ rows, skipped, cancelled }),
        throw: (error: unknown) => fail(error)
    };
}

/** The job settles on a promise callback, so the assertions come after the microtasks drain. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the sweep job", () => {
    it("has not run before it is asked to, which is a state rather than nothing", () => {
        const state = sweepState();

        assert.equal(state.running, false);
        assert.equal(state.startedAt, null);
        assert.deepEqual(state.rows, []);
        assert.deepEqual(state.progress, { done: 0, total: null, at: null });
    });

    it("answers as soon as it is started rather than when the sweep lands", () => {
        const fake = controllable();
        const state = startSweep(request, fake.run);

        assert.equal(state.running, true);
        assert.ok(state.startedAt);
        assert.equal(state.party, "510001");
        assert.equal(state.finishedAt, null);
    });

    /*
     * Two sweeps against one localtest would be posting over each other's instances, and the honest
     * answer to "start another" is that one is already going.
     */
    it("refuses a second while one is running", () => {
        startSweep(request, controllable().run);

        assert.throws(
            () => startSweep(request, controllable().run),
            (error: unknown) => error instanceof HttpError && error.status === 409
        );
    });

    it("takes the total from the plan, so progress has a denominator", () => {
        const fake = controllable();
        startSweep(request, fake.run);
        fake.plan(98, ["dibk/ts-v1: not deployed"]);

        assert.equal(sweepState().progress.total, 98);
        assert.deepEqual(sweepState().skipped, ["dibk/ts-v1: not deployed"]);
    });

    it("grows the table as the sweep goes, and says what it is on", () => {
        const fake = controllable();
        startSweep(request, fake.run);
        fake.plan(3);
        fake.emit("01.xml");
        fake.emit("02.xml");

        const state = sweepState();
        assert.deepEqual(
            state.rows.map((each) => each.file),
            ["01.xml", "02.xml"]
        );
        assert.deepEqual(state.progress, { done: 2, total: 3, at: "dibk/et-v4 ET 02.xml" });
        assert.equal(state.running, true);
    });

    it("settles on the report it was handed, and stops saying it is running", async () => {
        const fake = controllable();
        startSweep(request, fake.run);
        fake.plan(2);
        fake.emit("01.xml");
        fake.finish([row("01.xml"), row("02.xml")], ["dibk/ts-v1: not deployed"]);
        await settled();

        const state = sweepState();
        assert.equal(state.running, false);
        assert.ok(state.finishedAt);
        assert.equal(state.rows.length, 2);
        assert.equal(state.progress.done, 2);
        // Nothing is in flight any more, so there is nothing to name.
        assert.equal(state.progress.at, null);
        assert.deepEqual(state.skipped, ["dibk/ts-v1: not deployed"]);
    });

    /* One file failing is a row. The whole sweep stopping is this, and it is a different thing. */
    it("keeps the reason when the sweep itself falls over", async () => {
        const fake = controllable();
        startSweep(request, fake.run);
        fake.emit("01.xml");
        fake.throw(new Error("localtest went away"));
        await settled();

        const state = sweepState();
        assert.equal(state.running, false);
        assert.equal(state.error, "localtest went away");
        // What it had got through is kept: a sweep that fell over half way still found things.
        assert.equal(state.rows.length, 1);
    });

    describe("cancelling", () => {
        it("is refused when nothing is running", () => {
            assert.throws(
                () => cancelSweep(),
                (error: unknown) => error instanceof HttpError && error.status === 409
            );
        });

        /*
         * A request rather than a stop. It finishes the file it is on rather than abandoning an
         * instance half posted, so what cancelling does is answer the next "should I carry on".
         */
        it("is what the sweep is asked before each file", () => {
            const fake = controllable();
            startSweep(request, fake.run);

            assert.equal(fake.asked(), false);
            cancelSweep();
            assert.equal(fake.asked(), true);
        });

        it("still says it is running until the sweep actually stops", () => {
            const fake = controllable();
            startSweep(request, fake.run);
            const state = cancelSweep();

            assert.equal(state.running, true);
            assert.equal(sweepState().cancelled, false);
        });

        it("says so once the sweep has stopped, and keeps what it found", async () => {
            const fake = controllable();
            startSweep(request, fake.run);
            fake.plan(98);
            cancelSweep();
            fake.finish([row("01.xml")], [], true);
            await settled();

            const state = sweepState();
            assert.equal(state.running, false);
            assert.equal(state.cancelled, true);
            assert.equal(state.rows.length, 1);
            // The total stands, so the table says one of ninety-eight rather than one of one.
            assert.equal(state.progress.total, 98);
        });

        it("lets another start once it has", async () => {
            const first = controllable();
            startSweep(request, first.run);
            cancelSweep();
            first.finish([], [], true);
            await settled();

            assert.doesNotThrow(() => startSweep(request, controllable().run));
        });
    });

    /*
     * A sweep that was cancelled and replaced must not write into its successor. The old one is
     * still awaiting its own promise, and its handlers fire whenever it gets round to noticing.
     */
    it("ignores a sweep that has been replaced", async () => {
        const first = controllable();
        startSweep(request, first.run);
        cancelSweep();
        first.finish([row("old.xml")], [], true);
        await settled();

        const second = controllable();
        startSweep(request, second.run);
        second.plan(5);
        second.emit("new.xml");

        // The one that was replaced, answering late.
        first.emit("late.xml");
        first.finish([row("old.xml"), row("later.xml")]);
        await settled();

        const state = sweepState();
        assert.equal(state.running, true, "the replaced sweep must not land the one that replaced it");
        assert.deepEqual(
            state.rows.map((each) => each.file),
            ["new.xml"]
        );
        assert.equal(state.progress.total, 5);
    });
});
