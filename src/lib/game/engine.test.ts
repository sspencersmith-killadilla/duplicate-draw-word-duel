import { describe, expect, it } from "vitest";
import { bestMove, dealSeats, emptyBoard, evaluatePlay, matchpointPercent, refill, fullBag, applyPlacements } from "./engine";

const dict = new Set(["CAT", "CATS", "AT", "TA", "AS", "ACT", "SCAT"]);
const isWord = (w: string) => dict.has(w);

describe("duplicate deal", () => {
  it("gives every table the same tiles for the same seed", () => {
    expect(dealSeats("2026-11-10:x")).toEqual(dealSeats("2026-11-10:x"));
  });
  it("splits the full bag between the two seats", () => {
    const d = dealSeats("s");
    expect(d.north.length + d.south.length).toBe(fullBag().length);
  });
  it("refills a rack only from the seat's own stream", () => {
    expect(refill("AB", "CDEFGHIJ")).toEqual({ rack: "ABCDEFG", stream: "HIJ" });
  });
});

describe("scoring", () => {
  it("rejects invalid coordinates instead of crashing the placement check", () => {
    for (const r of [NaN, Infinity, 7.5]) {
      expect(evaluatePlay(emptyBoard(), "CAT", [{ r, c: 7, letter: "C" }], isWord).ok).toBe(false);
    }
  });
  it("rejects a valid main word when a crossing word is invalid", () => {
    const board = applyPlacements(emptyBoard(), [{ r: 6, c: 7, letter: "C" }]);
    expect(evaluatePlay(board, "AT", [{ r: 7, c: 7, letter: "A" }, { r: 7, c: 8, letter: "T" }], isWord)).toEqual({ ok: false, error: "Not in the dictionary: CA" });
  });
  it("scores the first word with the center square (no premium) as plain letter values", () => {
    const r = evaluatePlay(emptyBoard(), "CATXXXX", [
      { r: 7, c: 6, letter: "C" }, { r: 7, c: 7, letter: "A" }, { r: 7, c: 8, letter: "T" },
    ], isWord);
    expect(r).toEqual({ ok: true, score: 6, words: ["CAT"] });
  });
  it("rejects a first word that misses the center", () => {
    const r = evaluatePlay(emptyBoard(), "CAT", [
      { r: 0, c: 0, letter: "C" }, { r: 0, c: 1, letter: "A" }, { r: 0, c: 2, letter: "T" },
    ], isWord);
    expect(r.ok).toBe(false);
  });
  it("rejects words not in the dictionary", () => {
    const r = evaluatePlay(emptyBoard(), "TCA", [
      { r: 7, c: 7, letter: "T" }, { r: 7, c: 8, letter: "C" }, { r: 7, c: 9, letter: "A" },
    ], isWord);
    expect(r.ok).toBe(false);
  });
  it("counts extended words and doesn't re-apply premiums under old tiles", () => {
    const b = applyPlacements(emptyBoard(), [
      { r: 7, c: 6, letter: "C" }, { r: 7, c: 7, letter: "A" }, { r: 7, c: 8, letter: "T" },
    ]);
    const r = evaluatePlay(b, "S", [{ r: 7, c: 9, letter: "S" }], isWord);
    expect(r).toEqual({ ok: true, score: 7, words: ["CATS"] });
  });
});

describe("matchpoints", () => {
  it("gives 1 per score beaten and ½ per tie", () => {
    expect(matchpointPercent(300, [200, 300, 400, 100])).toBe(62.5);
  });
});

describe("bot", () => {
  const words = ["CAT", "CATS", "AT", "TA", "AS", "ACT", "SCAT"];
  const isPrefix = (p: string) => words.some((w) => w.startsWith(p));
  it("finds the highest-scoring opening play through the center", () => {
    const m = bestMove(emptyBoard(), "SCATQQQ", isWord, isPrefix);
    expect(m?.words).toEqual(["SCAT"]);
    expect(m?.placements.some((p) => p.r === 7 && p.c === 7)).toBe(true);
  });
  it("passes when no word is possible", () => {
    expect(bestMove(emptyBoard(), "QQQ", isWord, isPrefix)).toBeNull();
  });
});
