import { SaveGuestBanner } from "@/components/SaveGuestBanner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Shuffle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getGame, passTurn, playMove, swapTiles } from "@/lib/game/game.functions";
import { BoardGrid, Tile } from "@/components/game/Board";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const gameQuery = (gameId: string) => queryOptions({ queryKey: ["game", gameId], queryFn: () => getGame({ data: { gameId } }) });

export const Route = createFileRoute("/_authenticated/game/$gameId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Game — Duplicate Draw" },
      { name: "description", content: "Your head-to-head game on the daily deal." },
      { property: "og:title", content: "Game — Duplicate Draw" },
      { property: "og:description", content: "Your head-to-head game on the daily deal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(gameQuery(params.gameId)),
  component: GamePage,
});

type RackTile = { id: number; letter: string };

function GamePage() {
  const { gameId } = Route.useParams();
  const { data: game } = useSuspenseQuery(gameQuery(gameId));
  const qc = useQueryClient();
  const play = useServerFn(playMove);
  const swap = useServerFn(swapTiles);
  const pass = useServerFn(passTurn);

  const [rack, setRack] = useState<RackTile[]>([]);
  const [pending, setPending] = useState<Map<string, RackTile>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRack([...game.rack].map((letter, id) => ({ id, letter })));
    setPending(new Map());
    setSelected(null);
    setSwapPick(new Set());
    setSwapMode(false);
  }, [game.rack, game.moves.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["game", gameId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameId, qc]);

  const myTurn = game.status === "active" && game.turn === game.seat;
  const me = game.seat === "north" ? game.north : game.south;
  const opp = game.seat === "north" ? game.south : game.north;
  const placedIds = useMemo(() => new Set([...pending.values()].map((t) => t.id)), [pending]);
  const pendingLetters = useMemo(() => new Map([...pending].map(([k, t]) => [k, t.letter])), [pending]);

  function onCellClick(r: number, c: number) {
    if (suppressClick.current || !myTurn || swapMode) return;
    const key = `${r},${c}`;
    if (pending.has(key)) {
      const next = new Map(pending); next.delete(key); setPending(next); return;
    }
    if (game.board[r]?.[c]) return;
    if (selected === null) return;
    const tile = rack.find((t) => t.id === selected);
    if (!tile) return;
    const next = new Map(pending); next.set(key, tile); setPending(next);
    setSelected(null);
  }

  // ---- Drag and drop (pointer events: works for mouse and touch) ----
  type Drag = { tile: RackTile; fromKey: string | null; x: number; y: number; sx: number; sy: number; moving: boolean };
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  function startDrag(tile: RackTile, fromKey: string | null, e: React.PointerEvent) {
    if (!myTurn || swapMode || e.button > 0) return;
    const d = { tile, fromKey, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moving: false };
    dragRef.current = d; setDrag(d);
  }

  useEffect(() => {
    if (!drag) return;
    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return {
        cell: el?.closest<HTMLElement>("[data-cell]")?.dataset["cell"] ?? null,
        rack: el?.closest<HTMLElement>("[data-rack-id]")?.dataset["rackId"] ?? null,
        inRack: !!el?.closest("[data-rack]"),
      };
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const moving = d.moving || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6;
      const next = { ...d, x: e.clientX, y: e.clientY, moving };
      dragRef.current = next; setDrag(next);
      if (moving) { e.preventDefault(); setHoverKey(targetAt(e.clientX, e.clientY).cell); }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current; dragRef.current = null; setDrag(null); setHoverKey(null);
      if (!d || !d.moving) return; // a plain tap: let the click handler run
      suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0);
      const t = targetAt(e.clientX, e.clientY);
      setPending((prev) => {
        const next = new Map(prev);
        if (d.fromKey) next.delete(d.fromKey);
        if (t.cell) {
          const [r, c] = t.cell.split(",").map(Number);
          if (game.board[r!]?.[c!]) return prev; // occupied by a played tile
          const displaced = next.get(t.cell);
          if (displaced && d.fromKey) next.set(d.fromKey, displaced); // swap two placed tiles
          next.set(t.cell, d.tile);
        }
        return next;
      });
      if (!t.cell && t.rack !== null && !d.fromKey) {
        // reorder within the rack
        setRack((prev) => {
          const from = prev.findIndex((x) => x.id === d.tile.id);
          const to = prev.findIndex((x) => String(x.id) === t.rack);
          if (from < 0 || to < 0 || from === to) return prev;
          const next = [...prev]; const [m] = next.splice(from, 1); next.splice(to, 0, m!); return next;
        });
      }
      setSelected(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function onRackClick(id: number) {
    if (suppressClick.current) return;
    if (swapMode) {
      const s = new Set(swapPick); s.has(id) ? s.delete(id) : s.add(id); setSwapPick(s); return;
    }
    setSelected(selected === id ? null : id);
  }

  async function act(fn: () => Promise<unknown>, success?: (r: unknown) => string | undefined) {
    setBusy(true);
    try {
      const r = await fn();
      const msg = success?.(r);
      if (msg) toast.success(msg);
      await qc.invalidateQueries({ queryKey: ["game", gameId] });
      qc.invalidateQueries({ queryKey: ["lobby"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const submitPlay = () => act(
    () => play({ data: { gameId, placements: [...pending].map(([k, t]) => { const [r, c] = k.split(",").map(Number); return { r: r!, c: c!, letter: t.letter }; }) } }),
    (r) => { const res = r as { score: number; words: string[] }; return `${res.words.join(", ")} for ${res.score} points`; },
  );

  const statusText = game.status === "waiting" ? "Waiting for an opponent to join. You can't move until they do."
    : game.status === "finished" ? "Game over." : game.status === "expired" ? "No opponent joined before the deal closed."
    : myTurn ? "Your turn." : `Waiting for ${opp.name ?? "your opponent"}.`;

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {drag?.moving && (
        <div className="pointer-events-none fixed z-50 h-14 w-14 -translate-x-1/2 -translate-y-[85%] rotate-3 drop-shadow-xl"
          style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Tile letter={drag.tile.letter} />
        </div>
      )}
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{statusText}</p>
          {game.status === "finished" && (
            <Button variant="brass" size="sm" asChild><Link to="/results/$dealId" params={{ dealId: game.dealId }}>Compare with the field</Link></Button>
          )}
        </div>
        {game.status === "finished" && <SaveGuestBanner text="Nice game! Create an account to keep this result and your place in the rankings." />}
        <div className="-mx-2 w-[calc(100%+1rem)] sm:mx-auto sm:w-full sm:max-w-[680px]">
          <BoardGrid board={game.board} pending={pendingLetters} onCellClick={onCellClick} hoverKey={hoverKey}
            onPendingPointerDown={(key, e) => { const t = pending.get(key); if (t) startDrag(t, key, e); }} />
        </div>
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col items-center gap-3 border-t border-border/60 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-auto sm:w-full sm:max-w-[680px] sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div data-rack className="flex w-full max-w-[420px] justify-center gap-1 rounded-lg bg-secondary p-1.5 sm:gap-1.5 sm:p-2">
            {rack.length === 0 && <span className="px-3 py-2 text-sm text-muted-foreground">No tiles</span>}
            {rack.map((t) => {
              const used = placedIds.has(t.id);
              return (
                <button key={t.id} type="button" data-rack-id={t.id} disabled={used || !myTurn} onClick={() => onRackClick(t.id)}
                  onPointerDown={(e) => !used && startDrag(t, null, e)}
                  style={{ touchAction: "none" }}
                  aria-label={`Tile ${t.letter}`}
                  className={cn("aspect-square min-w-0 max-w-12 flex-1 select-none transition-transform", used && "opacity-25",
                    drag?.moving && drag.tile.id === t.id && !drag.fromKey && "opacity-30",
                    (selected === t.id && !swapMode) && "-translate-y-1.5 ring-2 ring-brass rounded",
                    swapPick.has(t.id) && "-translate-y-1.5 ring-2 ring-destructive rounded")}>
                  <Tile letter={t.letter} />
                </button>
              );
            })}
          </div>
          {myTurn && (
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {swapMode ? (
                <>
                  <Button variant="brass" disabled={busy || swapPick.size === 0}
                    onClick={() => act(() => swap({ data: { gameId, letters: rack.filter((t) => swapPick.has(t.id)).map((t) => t.letter) } }), () => "Tiles swapped")}>
                    Swap {swapPick.size || ""} tiles
                  </Button>
                  <Button variant="felt" onClick={() => { setSwapMode(false); setSwapPick(new Set()); }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button variant="brass" disabled={busy || pending.size === 0} onClick={submitPlay}>Play word</Button>
                  <Button variant="felt" size="icon" aria-label="Recall tiles" onClick={() => setPending(new Map())}><Undo2 /></Button>
                  <Button variant="felt" size="icon" aria-label="Shuffle rack" onClick={() => setRack([...rack].sort(() => Math.random() - 0.5))}><Shuffle /></Button>
                  <Button variant="felt" onClick={() => { setPending(new Map()); setSwapMode(true); }}>Swap</Button>
                  <Button variant="felt" disabled={busy} onClick={() => act(() => pass({ data: { gameId } }), () => "You passed")}>Pass</Button>
                </>
              )}
            </div>
          )}
          {myTurn && !swapMode && <p className="text-xs text-muted-foreground">Drag tiles onto the board, or tap a tile then a square. Drag a placed tile off the board to take it back.</p>}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="paper rounded-xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] opacity-60">{game.botNumber ? `Bot deal #${game.botNumber}` : `Deal of ${game.dealDate}`}</p>
          {[{ label: "You", p: me, seat: game.seat }, { label: opp.name ?? "Open seat", p: opp, seat: game.seat === "north" ? "south" : "north" }].map(({ label, p, seat }) => (
            <div key={seat} className={cn("mt-3 flex items-center justify-between rounded-md px-3 py-2", game.turn === seat && game.status === "active" && "bg-tile-new/50")}>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-xs opacity-60">{seat === "north" ? "North" : "South"} · {p.remaining} tiles left in stream</p>
              </div>
              <span className="font-display text-2xl">{p.score}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-secondary p-4">
          <h2 className="text-lg font-semibold">Moves</h2>
          <ol className="mt-2 grid max-h-80 gap-1 overflow-auto text-sm">
            {game.moves.length === 0 && <li className="text-muted-foreground">No moves yet.</li>}
            {[...game.moves].reverse().map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="text-muted-foreground">{m.seat === game.seat ? "You" : opp.name}: </span>
                  {m.kind === "play" ? m.words.join(", ") : m.kind === "swap" ? "swapped" : m.kind === "timeout" ? "timed out" : "passed"}
                </span>
                <span className="font-semibold">{m.kind === "play" ? `+${m.score}` : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
