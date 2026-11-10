import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Duplicate Draw — the daily word game scored like bridge" },
      { name: "description", content: "Play a head-to-head word game where every table gets the same tiles, then see how you ranked against everyone who held your seat." },
      { property: "og:title", content: "Duplicate Draw — the daily word game scored like bridge" },
      { property: "og:description", content: "Same tiles for every table. Beat your opponent, then beat the field." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { n: "1", title: "One deal a day", body: "Every morning a new deal is shuffled. Each seat, North and South, gets its own fixed line of tiles." },
  { n: "2", title: "Play your opponent", body: "Take turns at your own pace over a few days, just like any word game with friends." },
  { n: "3", title: "Beat the field", body: "Your score is compared with every player who held your seat that day. Luck of the draw is gone; only your choices count." },
];

function Index() {
  return (
    <div className="py-10">
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-primary">The duplicate draw word game</p>
          <h1 className="text-5xl font-semibold leading-[1.05] md:text-6xl">Same tiles.<br />Different minds.</h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Like duplicate bridge, every table plays the same deal. You face one opponent, but you're really measured against everyone who drew your tiles.
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="brass" size="lg" asChild><Link to="/lobby">Play today's deal</Link></Button>
            <Button variant="felt" size="lg" asChild><Link to="/leaderboard">See rankings</Link></Button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
          {"DUPLICATE".split("").map((l, i) => (
            <span key={i} className="tile flex h-14 w-14 items-center justify-center text-3xl" style={{ transform: `rotate(${((i % 3) - 1) * 2}deg)` }}>{l}</span>
          ))}
        </div>
      </section>
      <section className="mt-20 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="paper rounded-lg p-6">
            <span className="font-display text-3xl text-brass">{s.n}</span>
            <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm opacity-80">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
