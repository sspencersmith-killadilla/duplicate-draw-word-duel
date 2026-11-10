import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getLobby, updateUsername } from "@/lib/game/game.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const lobbyQuery = queryOptions({ queryKey: ["lobby"], queryFn: () => getLobby() });

export const Route = createFileRoute("/_authenticated/profile")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Profile — Duplicate Draw" },
      { name: "description", content: "Your username, record and past deals." },
      { property: "og:title", content: "Profile — Duplicate Draw" },
      { property: "og:description", content: "Your username, record and past deals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(lobbyQuery),
  component: Profile,
});

function Profile() {
  const { data } = useSuspenseQuery(lobbyQuery);
  const qc = useQueryClient();
  const save = useServerFn(updateUsername);
  const [name, setName] = useState(data.me.username);
  const finished = data.games.filter((g) => g.status === "finished");
  const wins = finished.filter((g) => g.myScore > g.oppScore).length;

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <div className="paper rounded-xl p-6">
        <h1 className="text-3xl font-semibold">{data.me.username}</h1>
        <p className="mt-1 text-sm opacity-70">{wins} wins from {finished.length} finished games</p>
        <form className="mt-6 grid gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try { await save({ data: { username: name } }); toast.success("Username saved"); qc.invalidateQueries(); }
          catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
        }}>
          <label htmlFor="un" className="text-sm font-medium">Username</label>
          <div className="flex gap-2">
            <Input id="un" value={name} onChange={(e) => setName(e.target.value)} className="border-card-foreground/20" />
            <Button variant="brass" type="submit">Save</Button>
          </div>
        </form>
      </div>
      <div>
        <h2 className="text-xl font-semibold">Past deals</h2>
        <ul className="mt-3 grid gap-2">
          {finished.length === 0 && <li className="text-sm text-muted-foreground">No finished games yet.</li>}
          {finished.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-4 py-3">
              <span>{g.dealDate} · vs {g.opponent} · {g.myScore}–{g.oppScore}</span>
              <Link to="/results/$dealId" params={{ dealId: g.dealId }} className="text-sm text-primary underline">Field results</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
