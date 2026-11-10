import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CircleHelp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explainPlacement } from "@/lib/game/explanation.functions";
import type { Placement } from "@/lib/game/engine";

export function PlacementExplanation({ gameId, placements, reason }: { gameId: string; placements: Placement[]; reason: string }) {
  const explain = useServerFn(explainPlacement);
  const [state, setState] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function requestExplanation() {
    setState({ busy: true });
    try {
      const answer = await explain({ data: { gameId, placements } });
      if (!mounted.current) return;
      if (answer.ok && answer.reason === reason) setState({ busy: false, text: answer.text });
      else setState({ busy: false, error: answer.ok ? "The placement changed. Check it again." : answer.error });
    } catch {
      if (mounted.current) setState({ busy: false, error: "Couldn't load an explanation. Your word check is unchanged." });
    }
  }
  return <div className="max-w-full text-sm text-muted-foreground">
    {!state.text && !state.error && <Button variant="ghost" size="sm" disabled={state.busy} onClick={requestExplanation}>
      {state.busy ? <Loader2 className="motion-safe:animate-spin" /> : <CircleHelp />}{state.busy ? "Explaining…" : "Explain"}
    </Button>}
    {state.text && <p aria-live="polite" className="mx-auto max-w-lg text-balance break-words"><span className="font-semibold">AI explanation: </span>{state.text}</p>}
    {state.error && <p role="alert" className="mx-auto max-w-lg break-words">{state.error}</p>}
  </div>;
}