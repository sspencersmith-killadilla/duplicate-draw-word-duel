import words from "./enable-words.txt?raw";

let dict: Set<string> | null = null;
export function isWord(w: string): boolean {
  if (!dict) dict = new Set(words.split("\n").map((s) => s.trim().toUpperCase()).filter(Boolean));
  return dict.has(w.toUpperCase());
}
