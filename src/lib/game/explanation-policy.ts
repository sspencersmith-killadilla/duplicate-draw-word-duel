import type { MoveError, MoveResult } from "./engine";

// AI receives only an authoritative rejection, never a rack, draw stream or score.
export function explanationReason(result: MoveError | MoveResult): string | null {
  return result.ok ? null : result.error;
}