import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { explanationReason } from "./explanation-policy";

export const explainPlacement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    gameId: z.string().uuid(),
    placements: z.array(z.object({ r: z.number().int().min(0).max(14), c: z.number().int().min(0).max(14), letter: z.string().regex(/^[A-Z]$/) })).min(1).max(7),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { checkPlacement } = await import("./placement-preview.server");
    const reason = explanationReason(await checkPlacement(data, context));
    if (!reason) return { ok: false as const, status: 409, error: "This placement is playable now. No explanation needed." };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, status: 401, error: "AI explanations aren't configured yet." };
    const { explainRejection } = await import("./explanation.server");
    return { ...await explainRejection(reason, key), reason };
  });