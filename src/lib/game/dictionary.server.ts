import words from "./enable-words.txt?raw";

let dict: Set<string> | null = null;
let sorted: string[] | null = null;
function load() {
  if (!sorted) {
    sorted = words.split("\n").map((s) => s.trim().toUpperCase()).filter(Boolean).sort();
    dict = new Set(sorted);
  }
}
export function isWord(w: string): boolean {
  load();
  return dict!.has(w.toUpperCase());
}
/** True if some dictionary word starts with p (binary search on the sorted list). */
export function isPrefix(p: string): boolean {
  load();
  const a = sorted!;
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < p) lo = m + 1; else hi = m; }
  return lo < a.length && a[lo]!.startsWith(p);
}
