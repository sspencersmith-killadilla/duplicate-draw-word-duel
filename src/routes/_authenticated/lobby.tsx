import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { challengePlayer, findOpponent, getBotDeals, getLobby, startBotGame } from "@/lib/game/game.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const lobbyQuery = queryOptions({ queryKey: ["lobby"], queryFn: () => getLobby() });
export const botQuery = queryOptions({ queryKey: ["lobby", "bot"], queryFn: () => getBotDeals() });

export const Route = createFileRoute("/_authenticated/lobby")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Lobby — Duplicate Draw" },
      { name: "description", content: "Today's deal, your games and challenges." },
      { property: "og:title", content: "Lobby — Duplicate Draw" },
      { property: "og:description", content: "Today's deal, your games and challenges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(lobbyQuery), context.queryClient.ensureQueryData(botQuery)]),
  component: Lobby,
});

function Lobby() {
  const { data } = useSuspenseQuery(lobbyQuery);
  const { data: botDeals } = useSuspenseQuery(botQuery);
  const startBot = useServerFn(startBotGame);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const find = useServerFn(findOpponent);
  const challenge = useServerFn(challengePlayer);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const todayGame = data.games.find((g) => g.dealId === data.deal.id);
  const active = data.games.filter((g) => (g.status === "active" || g.status === "waiting") && !g.vsBot);
  const past = data.games.filter((g) => g.status === "finished" && !g.vsBot);

  async function run(fn: () => Promise<{ gameId: string }>) {
    setBusy(true);
    try {
      const { gameId } = await fn();
      await qc.invalidateQueries({ queryKey: ["lobby"] });
      navigate({ to: "/game/$gameId", params: { gameId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <section className="paper rounded-xl p-6">
        <p className="text-xs uppercase tracking-[0.2em] opacity-60">Daily deal</p>
        <h1 className="mt-1 text-3xl font-semibold">{formatDate(data.deal.date)}</h1>
        <p className="mt-1 text-sm opacity-70">Open until {new Date(data.deal.closesAt).toLocaleString()}. Hello, <b>{data.me.username}</b>.</p>
        {todayGame ? (
          <div className="mt-6">
            <p className="text-sm">You're playing today's deal{todayGame.opponent ? ` against ${todayGame.opponent}` : ", waiting for an opponent"}.</p>
            <Button variant="brass" className="mt-3" asChild>
              <Link to="/game/$gameId" params={{ gameId: todayGame.id }}>Go to game</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            <Button variant="brass" size="lg" disabled={busy} onClick={() => run(() => find())}>Find an opponent</Button>
            <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => challenge({ data: { username } })); }}>
              <label htmlFor="opp" className="text-sm font-medium">Or challenge a friend by username</label>
              <div className="flex gap-2">
                <Input id="opp" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required className="border-card-foreground/20" />
                <Button type="submit" variant="outline" disabled={busy} className="text-card-foreground">Challenge</Button>
              </div>
            </form>
          </div>
        )}
      </section>

      <section className="grid content-start gap-6">
        <GameList title="Your games" games={active} empty="No games in progress." />
        <div>
          <h2 className="text-xl font-semibold">Play the computer</h2>
          <p className="mb-3 text-sm text-muted-foreground">Play any time. You sit North against the computer, and every North player on a deal gets the same tiles, so you're ranked against everyone who played it.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {botDeals.map((d) => (
              <li key={d.id}>
                <button type="button" disabled={busy} onClick={() => run(() => startBot({ data: { dealId: d.id } }))}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary px-4 py-3 text-left transition-colors hover:bg-accent">
                  <div>
                    <p className="font-medium">Bot deal #{d.number}</p>
                    <p className="text-xs text-muted-foreground">{d.players} played{d.best !== null ? ` · best ${d.best}` : ""}</p>
                  </div>
                  <div className="text-right text-sm">
                    {!d.mine ? <span className="font-semibold text-primary">Play</span>
                      : d.mine.status === "finished" ? (
                        <>
                          <p className="font-display text-lg">{d.mine.score} – {d.mine.botScore}</p>
                          <p className="text-xs">{d.mine.mp !== null ? `${d.mine.mp}% matchpoints` : "First to finish"}</p>
                        </>
                      ) : <span className="font-semibold text-primary">Continue · {d.mine.score} – {d.mine.botScore}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <GameList title="Finished" games={past} empty="Finished games and their results show up here." />
      </section>
    </div>
  );
}

type G = ReturnType<typeof useSuspenseQuery<Awaited<ReturnType<typeof getLobby>>>>["data"]["games"][number];

function GameList({ title, games, empty }: { title: string; games: G[]; empty: string }) {
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {games.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="grid gap-2">
          {games.map((g) => (
            <li key={g.id}>
              <Link to="/game/$gameId" params={{ gameId: g.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary px-4 py-3 transition-colors hover:bg-accent">
                <div>
                  <p className="font-medium">{g.opponent ? `vs ${g.opponent}` : "Waiting for opponent"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(g.dealDate)} · {g.seat === "north" ? "North" : "South"} seat</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg">{g.myScore} – {g.oppScore}</p>
                  <p className="text-xs">
                    {g.status === "finished" ? (g.myScore > g.oppScore ? "Won" : g.myScore < g.oppScore ? "Lost" : "Tied")
                      : g.myTurn ? <span className="font-semibold text-primary">Your turn</span> : g.status === "waiting" ? "Waiting" : "Their turn"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function formatDate(d: string) {
  if (!d) return "";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
