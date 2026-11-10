import { describe, expect, it } from "vitest";
import { explanationReason } from "./explanation-policy";
import { emptyBoard, evaluatePlay } from "./engine";

describe("AI explanation boundary", () => {
  it("only passes the engine's rejection reason for dictionary failures", () => {
    const result = evaluatePlay(emptyBoard(), "ZZ", [{ r: 7, c: 7, letter: "Z" }, { r: 7, c: 8, letter: "Z" }], () => false);
    expect(explanationReason(result)).toBe("Not in the dictionary: ZZ");
    expect(result.ok).toBe(false);
  });
  it("never requests an explanation for a playable move or changes its score", () => {
    const result = evaluatePlay(emptyBoard(), "CAT", [{ r: 7, c: 6, letter: "C" }, { r: 7, c: 7, letter: "A" }, { r: 7, c: 8, letter: "T" }], (word) => word === "CAT");
    expect(explanationReason(result)).toBeNull();
    expect(result).toEqual({ ok: true, words: ["CAT"], score: 6 });
  });
});