// Pure game rules: tiles, board, move validation, scoring and matchpoints.
export const SIZE = 15;
export const CENTER = 7;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 35;

export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 4, C: 4, D: 2, E: 1, F: 4, G: 3, H: 3, I: 1, J: 10, K: 5, L: 2, M: 4,
  N: 2, O: 1, P: 4, Q: 10, R: 1, S: 1, T: 1, U: 2, V: 5, W: 4, X: 8, Y: 3, Z: 10,
};

export const LETTER_COUNTS: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 5, E: 13, F: 2, G: 3, H: 4, I: 8, J: 1, K: 1, L: 4, M: 2,
  N: 5, O: 8, P: 2, Q: 1, R: 6, S: 5, T: 7, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

export type Premium = "TW" | "DW" | "TL" | "DL" | null;

const QUADRANT: string[] = [
  "...T..t.",
  "..d..D..",
  ".d..d...",
  "T..t...D",
  "..d...d.",
  ".D...t..",
  "t...d...",
  "...D....",
];

function premiumFromChar(c: string): Premium {
  return c === "T" ? "TW" : c === "D" ? "DW" : c === "t" ? "TL" : c === "d" ? "DL" : null;
}

export function premiumAt(r: number, c: number): Premium {
  const qr = r <= 7 ? r : 14 - r;
  const qc = c <= 7 ? c : 14 - c;
  return premiumFromChar(QUADRANT[qr]![qc]!);
}

export type Board = string[][]; // "" for empty, otherwise uppercase letter

export function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ""));
}

// Deterministic PRNG (mulberry32) seeded from a string.
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fullBag(): string[] {
  const bag: string[] = [];
  for (const [l, n] of Object.entries(LETTER_COUNTS)) for (let i = 0; i < n; i++) bag.push(l);
  return bag;
}

/** Shuffle one bag from the seed and split it in half: North draws only from the first half, South from the second. */
export function dealSeats(seed: string): { north: string; south: string } {
  const bag = fullBag();
  const rand = seededRandom(seed);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const half = Math.floor(bag.length / 2);
  return { north: bag.slice(0, half).join(""), south: bag.slice(half).join("") };
}

/** Refill a rack from the seat's own stream. */
export function refill(rack: string, stream: string): { rack: string; stream: string } {
  const need = Math.max(0, RACK_SIZE - rack.length);
  return { rack: rack + stream.slice(0, need), stream: stream.slice(need) };
}

export interface Placement { r: number; c: number; letter: string }

export interface MoveResult {
  ok: true;
  score: number;
  words: string[];
}
export interface MoveError { ok: false; error: string }

export function rackValue(rack: string): number {
  return [...rack].reduce((s, l) => s + (LETTER_VALUES[l] ?? 0), 0);
}

function boardIsEmpty(board: Board) {
  return board.every((row) => row.every((c) => !c));
}

/** Validate a play and score it. Does not mutate the board. */
export function evaluatePlay(
  board: Board,
  rack: string,
  placements: Placement[],
  isWord: (w: string) => boolean,
): MoveResult | MoveError {
  if (placements.length === 0) return { ok: false, error: "Place at least one tile." };
  // Tile ownership
  const pool = [...rack];
  for (const p of placements) {
    const L = p.letter.toUpperCase();
    const idx = pool.indexOf(L);
    if (idx === -1) return { ok: false, error: `You don't have the letter ${L}.` };
    pool.splice(idx, 1);
    if (!Number.isInteger(p.r) || !Number.isInteger(p.c) || p.r < 0 || p.r >= SIZE || p.c < 0 || p.c >= SIZE) return { ok: false, error: "Off the board." };
    if (board[p.r]![p.c]) return { ok: false, error: "That square is taken." };
  }
  const keys = new Set(placements.map((p) => `${p.r},${p.c}`));
  if (keys.size !== placements.length) return { ok: false, error: "Two tiles on one square." };

  const sameRow = placements.every((p) => p.r === placements[0]!.r);
  const sameCol = placements.every((p) => p.c === placements[0]!.c);
  if (!sameRow && !sameCol) return { ok: false, error: "Tiles must be in one row or column." };

  const next: Board = board.map((row) => [...row]);
  for (const p of placements) next[p.r]![p.c] = p.letter.toUpperCase();
  const isNew = (r: number, c: number) => keys.has(`${r},${c}`);

  // Direction: if single tile, pick the direction forming the longer word.
  let horizontal = sameRow && !(placements.length === 1);
  if (placements.length === 1) {
    const { r, c } = placements[0]!;
    const h = (c > 0 && next[r]![c - 1]) || (c < SIZE - 1 && next[r]![c + 1]);
    horizontal = !!h;
  } else horizontal = sameRow;

  // Contiguity along main line
  const fixed = placements[0]!;
  const coords = placements.map((p) => (horizontal ? p.c : p.r));
  const min = Math.min(...coords);
  const max = Math.max(...coords);
  for (let i = min; i <= max; i++) {
    const [r, c] = horizontal ? [fixed.r, i] : [i, fixed.c];
    if (!next[r]![c]) return { ok: false, error: "Tiles must form one connected word." };
  }

  const first = boardIsEmpty(board);
  if (first) {
    if (!keys.has(`${CENTER},${CENTER}`)) return { ok: false, error: "The first word must cover the center star." };
    if (placements.length < 2) return { ok: false, error: "The first word needs at least two letters." };
  }

  const readWord = (r: number, c: number, dr: number, dc: number) => {
    while (r - dr >= 0 && c - dc >= 0 && next[r - dr]?.[c - dc]) { r -= dr; c -= dc; }
    const cells: { r: number; c: number }[] = [];
    while (r < SIZE && c < SIZE && next[r]?.[c]) { cells.push({ r, c }); r += dr; c += dc; }
    return cells;
  };

  const scoreWord = (cells: { r: number; c: number }[]) => {
    let sum = 0, mult = 1;
    for (const { r, c } of cells) {
      let v = LETTER_VALUES[next[r]![c]!] ?? 0;
      if (isNew(r, c)) {
        const pr = premiumAt(r, c);
        if (pr === "DL") v *= 2;
        if (pr === "TL") v *= 3;
        if (pr === "DW") mult *= 2;
        if (pr === "TW") mult *= 3;
      }
      sum += v;
    }
    return sum * mult;
  };

  const [mdr, mdc] = horizontal ? [0, 1] : [1, 0];
  const wordsCells: { r: number; c: number }[][] = [];
  const main = readWord(fixed.r, fixed.c, mdr, mdc);
  if (main.length >= 2) wordsCells.push(main);
  for (const p of placements) {
    const cross = readWord(p.r, p.c, mdc, mdr);
    if (cross.length >= 2) wordsCells.push(cross);
  }
  if (wordsCells.length === 0) return { ok: false, error: "Make a word of at least two letters." };

  if (!first) {
    const touchesExisting = wordsCells.some((cells) => cells.some(({ r, c }) => !isNew(r, c)));
    if (!touchesExisting) return { ok: false, error: "Your word must connect to tiles on the board." };
  }

  const words = wordsCells.map((cells) => cells.map(({ r, c }) => next[r]![c]).join(""));
  const bad = words.filter((w) => !isWord(w));
  if (bad.length) return { ok: false, error: `Not in the dictionary: ${bad.join(", ")}` };

  let score = wordsCells.reduce((s, cells) => s + scoreWord(cells), 0);
  if (placements.length === RACK_SIZE) score += BINGO_BONUS;
  return { ok: true, score, words };
}

export function applyPlacements(board: Board, placements: Placement[]): Board {
  const next = board.map((row) => [...row]);
  for (const p of placements) next[p.r]![p.c] = p.letter.toUpperCase();
  return next;
}

export function removeFromRack(rack: string, letters: string[]): string {
  const pool = [...rack];
  for (const l of letters) {
    const i = pool.indexOf(l.toUpperCase());
    if (i !== -1) pool.splice(i, 1);
  }
  return pool.join("");
}

/** Matchpoints: 1 per opponent beaten, ½ per tie, as a percentage of the field (excluding self). */
export function matchpointPercent(myScore: number, fieldScores: number[]): number | null {
  if (fieldScores.length === 0) return null;
  let mp = 0;
  for (const s of fieldScores) {
    if (myScore > s) mp += 1;
    else if (myScore === s) mp += 0.5;
  }
  return Math.round((mp / fieldScores.length) * 1000) / 10;
}

export const PASS_LIMIT = 6; // 3 consecutive passes from each player
export const DEAL_OPEN_HOURS = 72;

export const BOT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The bot: finds the highest-scoring legal play for a rack. Deterministic (ties broken by search order),
 * so every player on a bot deal faces the same strategy.
 */
export function bestMove(
  board: Board,
  rack: string,
  isWord: (w: string) => boolean,
  isPrefix: (p: string) => boolean,
): { placements: Placement[]; score: number; words: string[] } | null {
  let best: { placements: Placement[]; score: number; words: string[] } | null = null;
  const empty = boardIsEmpty(board);
  for (const horizontal of [true, false]) {
    const at = (line: number, i: number) => (horizontal ? board[line]![i]! : board[i]![line]!);
    const pos = (line: number, i: number) => (horizontal ? { r: line, c: i } : { r: i, c: line });
    const crossOk = (line: number, i: number, letter: string) => {
      const { r, c } = pos(line, i);
      const [dr, dc] = horizontal ? [1, 0] : [0, 1];
      let rr = r - dr, cc = c - dc, before = "";
      while (rr >= 0 && cc >= 0 && board[rr]![cc]) { before = board[rr]![cc]! + before; rr -= dr; cc -= dc; }
      rr = r + dr; cc = c + dc; let after = "";
      while (rr < SIZE && cc < SIZE && board[rr]![cc]) { after += board[rr]![cc]!; rr += dr; cc += dc; }
      return (!before && !after) || isWord(before + letter + after);
    };
    for (let line = 0; line < SIZE; line++) {
      if (empty && line !== CENTER) continue;
      for (let start = 0; start < SIZE; start++) {
        if (start > 0 && at(line, start - 1)) continue;
        const extend = (i: number, word: string, placed: Placement[], pool: string[]) => {
          if (placed.length && (i >= SIZE || !at(line, i)) && word.length >= 2 && isWord(word)) {
            const res = evaluatePlay(board, rack, placed, isWord);
            if (res.ok && (!best || res.score > best.score)) best = { placements: [...placed], score: res.score, words: res.words };
          }
          if (i >= SIZE) return;
          const existing = at(line, i);
          if (existing) {
            const w = word + existing;
            if (isPrefix(w)) extend(i + 1, w, placed, pool);
            return;
          }
          if (pool.length === 0) return;
          const tried = new Set<string>();
          for (let k = 0; k < pool.length; k++) {
            const l = pool[k]!;
            if (tried.has(l)) continue;
            tried.add(l);
            const w = word + l;
            if (!isPrefix(w) || !crossOk(line, i, l)) continue;
            const rest = pool.slice(0, k).concat(pool.slice(k + 1));
            placed.push({ ...pos(line, i), letter: l });
            extend(i + 1, w, placed, rest);
            placed.pop();
          }
        };
        extend(start, "", [], [...rack]);
      }
    }
  }
  return best;
}
