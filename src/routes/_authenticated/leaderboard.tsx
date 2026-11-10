import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getLeaderboard } from "@/lib/game/game.functions";
import { cn } from "@/lib/utils";

const lbQuery = queryOptions({ queryKey: ["leaderboard"], queryFn: () => getLeaderboard() });

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Rankings — Duplicate Words" },
      { name: "description", content: "All-time rankings by average matchpoints and win record." },
      { property: "og:title", content: "Rankings — Duplicate Words" },
      { property: "og:description", content: "All-time rankings by average matchpoints." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(lbQuery),
  component: Leaderboard,
});

function Leaderboard() {
  const { data } = useSuspenseQuery(lbQuery);
  return (
    <div>
      <h1 className="text-4xl font-semibold">Rankings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ranked by average matchpoint % — how you did against everyone who held your seat.</p>
      <div className="paper mt-6 overflow-x-auto rounded-xl p-4">
        {data.players.length === 0 ? <p className="p-4 text-sm">No finished games yet. Be the first!</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left opacity-60"><th className="py-2">#</th><th>Player</th><th>Avg MP%</th><th>W–L–T</th><th>Played</th><th className="text-right">Best</th></tr></thead>
            <tbody>
              {data.players.map((p, i) => (
                <tr key={p.id} className={cn("border-t border-card-foreground/10", p.isMe && "font-semibold")}>
                  <td className="py-2">{i + 1}</td><td>{p.name}</td><td>{p.avgMp ?? "—"}</td>
                  <td>{p.wins}–{p.losses}–{p.ties}</td><td>{p.played}</td><td className="text-right">{p.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
