import { premiumAt, LETTER_VALUES, CENTER, type Board as BoardT } from "@/lib/game/engine";
import { cn } from "@/lib/utils";

const premiumClass: Record<string, string> = {
  TW: "bg-premium-tw text-premium-foreground",
  DW: "bg-premium-dw text-premium-foreground",
  TL: "bg-premium-tl text-premium-foreground",
  DL: "bg-premium-dl text-premium-foreground",
};

export function Tile({ letter, className, small }: { letter: string; className?: string; small?: boolean }) {
  return (
    <span className={cn("tile relative flex h-full w-full items-center justify-center leading-none", className)}>
      <span className={small ? "text-[clamp(0.7rem,2.6vw,1.15rem)]" : "text-2xl"}>{letter}</span>
      <span className={cn("absolute font-sans font-semibold", small ? "right-[2px] bottom-[1px] text-[clamp(0.4rem,1.2vw,0.55rem)]" : "right-1 bottom-0.5 text-[0.6rem]")}>
        {LETTER_VALUES[letter]}
      </span>
    </span>
  );
}

export function BoardGrid({ board, pending, onCellClick, onPendingPointerDown, hoverKey }: {
  board: BoardT;
  pending: Map<string, string>;
  onCellClick: (r: number, c: number) => void;
  /** Start dragging a tile that was placed this turn. */
  onPendingPointerDown?: (key: string, e: React.PointerEvent) => void;
  /** Square currently under a dragged tile. */
  hoverKey?: string | null;
}) {
  return (
    <div className="grid aspect-square w-full grid-cols-15 gap-[1px] rounded-md bg-board-line p-[2px] select-none sm:gap-[2px] sm:rounded-lg sm:p-[3px]" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
      {board.map((row, r) => row.map((cell, c) => {
        const key = `${r},${c}`;
        const p = pending.get(key);
        const prem = premiumAt(r, c);
        return (
          <button key={key} type="button" data-cell={key} onClick={() => onCellClick(r, c)}
            onPointerDown={p && onPendingPointerDown ? (e) => onPendingPointerDown(key, e) : undefined}
            style={p ? { touchAction: "none" } : undefined}
            aria-label={`Row ${r + 1}, column ${c + 1}${cell ? `, ${cell}` : ""}`}
            className={cn("relative flex aspect-square items-center justify-center rounded-[3px] text-[clamp(0.4rem,1.3vw,0.6rem)] font-bold",
              !cell && !p && (prem ? premiumClass[prem] : "bg-board"),
              hoverKey === key && !cell && "ring-2 ring-brass ring-inset brightness-125")}>
            {cell ? <Tile letter={cell} small /> : p ? <Tile letter={p} small className="bg-tile-new ring-2 ring-brass" /> :
              r === CENTER && c === CENTER ? <span className="text-brass text-[clamp(0.6rem,3vw,1rem)]">★</span> : prem}
          </button>
        );
      }))}
    </div>
  );
}
