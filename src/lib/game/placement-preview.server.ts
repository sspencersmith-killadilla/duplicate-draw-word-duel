import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEAL_OPEN_HOURS, emptyBoard, evaluatePlay, type Board, type Placement } from "./engine";

export async function checkPlacement(
  data: { gameId: string; placements: Placement[] },
  context: { supabase: SupabaseClient<Database>; userId: string },
) {
  const { data: game } = await context.supabase.from("games").select("*, daily_deals(deal_date)").eq("id", data.gameId).maybeSingle();
  if (!game) throw new Error("Game not found");
  const seat = game.north_id === context.userId ? "north" : game.south_id === context.userId ? "south" : null;
  if (!seat) throw new Error("You're not in this game");
  if (game.status !== "active" || game.turn !== seat) return { ok: false as const, error: "It's not your turn." };
  const date = game.daily_deals?.deal_date;
  if (!game.vs_bot && ((date && Date.now() > new Date(`${date}T00:00:00Z`).getTime() + DEAL_OPEN_HOURS * 3600000) || Date.now() - new Date(game.last_move_at).getTime() >= 48 * 3600000)) {
    return { ok: false as const, error: "This turn has ended. Refresh the game." };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sec } = await supabaseAdmin.from("game_secrets").select("north_rack, south_rack").eq("game_id", game.id).single();
  if (!sec) throw new Error("Could not check your tiles. Try again.");
  const { isWord } = await import("./dictionary.server");
  const board = (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board;
  return evaluatePlay(board, seat === "north" ? sec.north_rack : sec.south_rack, data.placements, isWord);
}