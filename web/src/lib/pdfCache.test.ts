import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fingerprintInstance, pdfStand } from "./pdfCache";
import type { DataElementSummary, ProcessSummary } from "../types";

const element = (over: Partial<DataElementSummary> = {}): DataElementSummary => ({
    id: "a1",
    dataType: "ET",
    contentType: "application/xml",
    filename: null,
    size: 400,
    lastChanged: "2026-09-16T10:00:00Z",
    ...over
});

const process: ProcessSummary = { currentTask: "Task_1", taskType: "data", started: "2026-09-16T09:00:00Z", ended: null, endEvent: null };

const of = (dataElements: DataElementSummary[], stand: ProcessSummary | null = process) => fingerprintInstance({ dataElements, process: stand });

describe("fingerprintInstance", () => {
    it("has nothing to say about an instance that has not been read", () => {
        assert.equal(of([], null), null);
    });

    it("is the same instance when nothing about it moved", () => {
        assert.equal(of([element()]), of([element()]));
    });

    /* Storage does not promise an order, and a list in another order is not an edit. */
    it("does not change when the same elements come back in another order", () => {
        const two = [element(), element({ id: "b2", dataType: "Vedlegg" })];
        assert.equal(of(two), of([...two].reverse()));
    });

    it("moves when an element is rewritten in place", () => {
        assert.notEqual(of([element()]), of([element({ lastChanged: "2026-09-16T11:00:00Z" })]));
    });

    /* The case that matters when the app does not stamp a change: the bytes are different. */
    it("moves when only the size moved", () => {
        assert.notEqual(of([element({ lastChanged: null })]), of([element({ lastChanged: null, size: 512 })]));
    });

    it("moves when an element is added or taken away", () => {
        assert.notEqual(of([element()]), of([element(), element({ id: "b2" })]));
    });

    /* Advancing changes which layout the app renders, so the pdf is a different document. */
    it("moves when the process does", () => {
        assert.notEqual(of([element()]), of([element()], { ...process, currentTask: "Task_2" }));
        assert.notEqual(of([element()]), of([element()], { ...process, ended: "2026-09-16T12:00:00Z" }));
    });
});

describe("pdfStand", () => {
    it("is none until something has been rendered", () => {
        assert.equal(pdfStand(null, "x"), "none");
        assert.equal(pdfStand(null, null), "none");
    });

    it("is current while the instance is the one it was rendered from", () => {
        assert.equal(pdfStand("x", "x"), "current");
    });

    it("is stale once the instance has moved", () => {
        assert.equal(pdfStand("x", "y"), "stale");
    });

    /* Not knowing whether it is out of date is the same as knowing it might be. */
    it("is stale when there is nothing to compare against", () => {
        assert.equal(pdfStand("x", null), "stale");
    });
});
