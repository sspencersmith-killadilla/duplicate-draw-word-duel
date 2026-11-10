import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Shuffle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getGame, passTurn, playMove, swapTiles } from "@/lib/game/game.functions";
import { BoardGrid, Tile } from "@/components/game/Board";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const gameQuery = (gameId: string) => queryOptions({ queryKey: ["game", gameId], queryFn: () => getGame({ data: { gameId } }) });

export const Route = createFileRoute("/_authenticated/game/$gameId")({
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
    if (!myTurn || swapMode) return;
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

  function onRackClick(id: number) {
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{statusText}</p>
          {game.status === "finished" && (
            <Button variant="brass" size="sm" asChild><Link to="/results/$dealId" params={{ dealId: game.dealId }}>Compare with the field</Link></Button>
          )}
        </div>
        <div className="mx-auto w-full max-w-[680px]">
          <BoardGrid board={game.board} pending={pendingLetters} onCellClick={onCellClick} />
        </div>
        <div className="mx-auto flex w-full max-w-[680px] flex-col items-center gap-3">
          <div className="flex gap-1.5 rounded-lg bg-secondary p-2">
            {rack.length === 0 && <span className="px-3 py-2 text-sm text-muted-foreground">No tiles</span>}
            {rack.map((t) => {
              const used = placedIds.has(t.id);
              return (
                <button key={t.id} type="button" disabled={used || !myTurn} onClick={() => onRackClick(t.id)}
                  aria-label={`Tile ${t.letter}`}
                  className={cn("h-11 w-11 transition-transform sm:h-12 sm:w-12", used && "opacity-25",
                    (selected === t.id && !swapMode) && "-translate-y-1.5 ring-2 ring-brass rounded",
                    swapPick.has(t.id) && "-translate-y-1.5 ring-2 ring-destructive rounded")}>
                  <Tile letter={t.letter} />
                </button>
              );
            })}
          </div>
          {myTurn && (
            <div className="flex flex-wrap justify-center gap-2">
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
          {myTurn && !swapMode && <p className="text-xs text-muted-foreground">Tap a tile, then tap a square. Tap a placed tile to take it back.</p>}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="paper rounded-xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] opacity-60">Deal of {game.dealDate}</p>
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
