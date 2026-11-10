import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getDealResults } from "@/lib/game/game.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const resultsQuery = (dealId: string) => queryOptions({ queryKey: ["results", dealId], queryFn: () => getDealResults({ data: { dealId } }) });

export const Route = createFileRoute("/_authenticated/results/$dealId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Deal results — Duplicate Draw" },
      { name: "description", content: "How every player in your seat scored on this deal." },
      { property: "og:title", content: "Deal results — Duplicate Draw" },
      { property: "og:description", content: "How every player in your seat scored on this deal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(resultsQuery(params.dealId)),
  errorComponent: ({ error }) => (
    <div className="paper mx-auto max-w-md rounded-xl p-6 text-center">
      <p>{error instanceof Error ? error.message : "Something went wrong"}</p>
      <Button variant="brass" className="mt-4" asChild><Link to="/lobby">Back to lobby</Link></Button>
    </div>
  ),
  component: Results,
});

function Results() {
  const { dealId } = Route.useParams();
  const { data } = useSuspenseQuery(resultsQuery(dealId));
  const mine = data.rows.find((r) => r.isMe);
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Deal results</p>
        <h1 className="text-4xl font-semibold">{data.deal.botNumber ? `Bot deal #${data.deal.botNumber}` : data.deal.date}</h1>
        {data.deal.botNumber ? <p className="mt-1 text-sm text-muted-foreground">Everyone here played North against the same computer, so you are ranked against the other North players. New players keep joining.</p> : data.deal.open && <p className="mt-1 text-sm text-muted-foreground">The deal is still open, so these numbers will move as more games finish.</p>}
      </div>
      {mine && (
        <div className="paper flex flex-wrap items-center gap-8 rounded-xl p-6">
          <Stat label="Your score" value={mine.score} />
          <Stat label="Match" value={mine.score > mine.oppScore ? "Won" : mine.score < mine.oppScore ? "Lost" : "Tied"} />
          <Stat label={`Matchpoints (${mine.seat})`} value={mine.mp === null ? "—" : `${mine.mp}%`} />
          {mine.mp === null && <p className="text-sm opacity-70">You're the only finished {mine.seat} player so far.</p>}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {(data.deal.botNumber ? (["north"] as const) : (["north", "south"] as const)).map((seat) => (
          <div key={seat} className="rounded-xl border border-border bg-secondary p-4">
            <h2 className="text-xl font-semibold capitalize">{seat} seat</h2>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Player</th><th>Score</th><th>vs</th><th className="text-right">MP%</th></tr></thead>
              <tbody>
                {data.rows.filter((r) => r.seat === seat).map((r) => (
                  <tr key={r.gameId + seat} className={cn("border-t border-border", r.isMe && "font-semibold text-primary")}>
                    <td className="py-1.5">{r.name}</td><td>{r.score}</td><td>{r.oppScore}</td><td className="text-right">{r.mp ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs uppercase tracking-wider opacity-60">{label}</p><p className="font-display text-3xl">{value}</p></div>;
}
