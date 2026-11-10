import { describe, expect, it } from "vitest";
import { dealSeats, emptyBoard, evaluatePlay, matchpointPercent, refill, fullBag, applyPlacements } from "./engine";

const dict = new Set(["CAT", "CATS", "AT", "TA", "AS"]);
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
