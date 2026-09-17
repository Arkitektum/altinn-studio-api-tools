import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outcomeFor, summariseSweep, type SweepOutcome, type SweepRow } from "./sweepService.js";

const row = (outcome: SweepOutcome, over: Partial<SweepRow> = {}): SweepRow => ({
    app: "dibk/et-v4",
    dataType: "ET",
    file: "01_Maksimumsversjon.xml",
    label: "Maksimumsversjon",
    outcome,
    differences: 0,
    rowIds: 0,
    detail: [],
    ...over
});

describe("outcomeFor", () => {
    it("is identical when nothing came back changed", () => {
        assert.equal(outcomeFor(0, 0), "identical");
    });

    /*
     * Altinn stamps an altinnRowId on every repeating group it stores, so a file that came back
     * untouched still differs from what was sent. Calling that a difference would make every sweep
     * look like a disaster and bury the files where the model actually changed something.
     */
    it("keeps a file whose only differences are row ids out of the findings", () => {
        assert.equal(outcomeFor(0, 1), "row ids only");
        assert.equal(outcomeFor(0, 40), "row ids only");
    });

    it("is differs as soon as one difference meant something, row ids or not", () => {
        assert.equal(outcomeFor(1, 0), "differs");
        assert.equal(outcomeFor(1, 40), "differs");
    });
});

describe("summariseSweep", () => {
    it("counts each outcome, and lumps the two that could not be compared", () => {
        const counts = summariseSweep([
            row("identical"),
            row("identical"),
            row("row ids only", { rowIds: 3 }),
            row("differs", { differences: 2 }),
            row("post failed"),
            row("no stored xml")
        ]);

        assert.deepEqual(counts, { identical: 2, rowIds: 1, differs: 1, failed: 2 });
    });

    /*
     * Row ids are Altinn's own and mean nothing, so a file whose only differences are those is not
     * a finding. Counting it as one would make every sweep look like a disaster.
     */
    it("keeps row ids apart from a real difference", () => {
        const counts = summariseSweep([row("row ids only", { rowIds: 12 })]);

        assert.equal(counts.differs, 0);
        assert.equal(counts.rowIds, 1);
    });

    it("counts nothing for an empty sweep", () => {
        assert.deepEqual(summariseSweep([]), { identical: 0, rowIds: 0, differs: 0, failed: 0 });
    });
});
