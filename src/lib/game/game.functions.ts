import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyPlacements, dealSeats, emptyBoard, evaluatePlay, matchpointPercent, rackValue, refill,
  removeFromRack, bestMove, BOT_ID, DEAL_OPEN_HOURS, PASS_LIMIT, RACK_SIZE, type Board, type Placement,
} from "./engine";

type Seat = "north" | "south";
const TURN_TIMEOUT_MS = 48 * 3600 * 1000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Admin = Awaited<ReturnType<typeof admin>>;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureTodayDeal(db: Admin) {
  const date = todayUtc();
  let { data: deal } = await db.from("daily_deals").select("*").eq("kind", "daily").eq("deal_date", date).maybeSingle();
  if (!deal) {
    const { data: inserted } = await db.from("daily_deals").insert({ deal_date: date }).select().maybeSingle();
    if (inserted) {
      const seats = dealSeats(`${date}:${crypto.randomUUID()}`);
      await db.from("deal_secrets").insert({ deal_id: inserted.id, north_tiles: seats.north, south_tiles: seats.south });
      deal = inserted;
    } else {
      ({ data: deal } = await db.from("daily_deals").select("*").eq("kind", "daily").eq("deal_date", date).maybeSingle());
    }
  }
  if (!deal) throw new Error("Could not load today's deal");
  return deal;
}

function dealClosesAt(dealDate: string) {
  return new Date(new Date(`${dealDate}T00:00:00Z`).getTime() + DEAL_OPEN_HOURS * 3600 * 1000);
}

async function usernames(db: Admin, ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean))] as string[];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await db.from("profiles").select("id, username").in("id", list);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.username])) as Record<string, string>;
}

async function createGame(db: Admin, dealId: string, northId: string, southId: string | null, vsBot = false) {
  const { data: secret } = await db.from("deal_secrets").select("*").eq("deal_id", dealId).single();
  if (!secret) throw new Error("Deal not ready");
  const n = refill("", secret.north_tiles);
  const s = refill("", secret.south_tiles);
  const { data: game, error } = await db.from("games").insert({
    deal_id: dealId, north_id: northId, south_id: southId,
    status: southId || vsBot ? "active" : "waiting", board: emptyBoard(), vs_bot: vsBot,
    north_rack_count: n.rack.length, south_rack_count: s.rack.length,
    north_remaining: n.stream.length, south_remaining: s.stream.length,
  }).select().single();
  if (error || !game) throw new Error(error?.message ?? "Could not create game");
  await db.from("game_secrets").insert({
    game_id: game.id, north_rack: n.rack, south_rack: s.rack, north_stream: n.stream, south_stream: s.stream,
  });
  return game;
}

/** Lazily applies deal expiry and turn timeouts. */
async function settle(db: Admin, gameId: string) {
  const { data: game } = await db.from("games").select("*, daily_deals(deal_date)").eq("id", gameId).single();
  if (!game) return;
  if (game.status === "finished" || game.status === "expired") return;
  if (game.vs_bot) return; // bot games never expire or time out
  const dealDate = (game.daily_deals as { deal_date: string } | null)?.deal_date;
  const closed = dealDate ? Date.now() > dealClosesAt(dealDate).getTime() : false;
  if (game.status === "waiting") {
    if (closed) await db.from("games").update({ status: "expired" }).eq("id", gameId);
    return;
  }
  if (closed) {
    await db.from("games").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", gameId);
    return;
  }
  const elapsed = Date.now() - new Date(game.last_move_at).getTime();
  const timeouts = Math.floor(elapsed / TURN_TIMEOUT_MS);
  if (timeouts <= 0) return;
  let turn = game.turn as Seat;
  let passes = game.consecutive_passes;
  const moveRows = [];
  for (let i = 0; i < timeouts && passes < PASS_LIMIT; i++) {
    moveRows.push({ game_id: gameId, seat: turn, player_id: (turn === "north" ? game.north_id : game.south_id)!, kind: "timeout" });
    passes++;
    turn = turn === "north" ? "south" : "north";
  }
  await db.from("moves").insert(moveRows);
  if (passes >= PASS_LIMIT) {
    await finishByPasses(db, gameId);
  } else {
    await db.from("games").update({ turn, consecutive_passes: passes, last_move_at: new Date().toISOString() }).eq("id", gameId);
  }
}

async function finishByPasses(db: Admin, gameId: string) {
  const { data: game } = await db.from("games").select("*").eq("id", gameId).single();
  const { data: sec } = await db.from("game_secrets").select("*").eq("game_id", gameId).single();
  if (!game || !sec) return;
  await db.from("games").update({
    status: "finished", finished_at: new Date().toISOString(), consecutive_passes: PASS_LIMIT,
    north_score: game.north_score - rackValue(sec.north_rack),
    south_score: game.south_score - rackValue(sec.south_rack),
  }).eq("id", gameId);
}

async function loadForMove(db: Admin, gameId: string, userId: string) {
  await settle(db, gameId);
  const { data: game } = await db.from("games").select("*").eq("id", gameId).single();
  const { data: sec } = await db.from("game_secrets").select("*").eq("game_id", gameId).single();
  if (!game || !sec) throw new Error("Game not found");
  const seat: Seat | null = game.north_id === userId ? "north" : game.south_id === userId ? "south" : null;
  if (!seat) throw new Error("You're not in this game");
  if (game.status !== "active") throw new Error("This game isn't active");
  if (game.turn !== seat) throw new Error("It's not your turn");
  return { game, sec, seat };
}


type GameRow = { id: string; board: unknown; north_score: number; south_score: number };
type SecretRow = { north_rack: string; south_rack: string; north_stream: string; south_stream: string };

async function applyPlay(
  db: Admin, game: GameRow, sec: SecretRow, seat: Seat, playerId: string,
  placements: Placement[], result: { score: number; words: string[] },
) {
  const board = (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board;
  const rack = seat === "north" ? sec.north_rack : sec.south_rack;
  const left = removeFromRack(rack, placements.map((p) => p.letter));
  const stream = seat === "north" ? sec.north_stream : sec.south_stream;
  const refilled = refill(left, stream);
  const oppRack = seat === "north" ? sec.south_rack : sec.north_rack;
  let myScore = (seat === "north" ? game.north_score : game.south_score) + result.score;
  let oppScore = seat === "north" ? game.south_score : game.north_score;
  const finished = refilled.rack.length === 0;
  if (finished) {
    myScore += rackValue(oppRack);
    oppScore -= rackValue(oppRack);
  }
  const now = new Date().toISOString();
  await db.from("game_secrets").update(seat === "north"
    ? { north_rack: refilled.rack, north_stream: refilled.stream }
    : { south_rack: refilled.rack, south_stream: refilled.stream }).eq("game_id", game.id);
  await db.from("moves").insert({ game_id: game.id, seat, player_id: playerId, kind: "play", words: result.words, score: result.score });
  await db.from("games").update({
    board: applyPlacements(board, placements),
    turn: seat === "north" ? "south" : "north",
    consecutive_passes: 0, last_move_at: now,
    [`${seat}_score`]: myScore,
    [`${seat === "north" ? "south" : "north"}_score`]: oppScore,
    [`${seat}_rack_count`]: refilled.rack.length,
    [`${seat}_remaining`]: refilled.stream.length,
    ...(finished ? { status: "finished", finished_at: now } : {}),
  }).eq("id", game.id);
  return { finished };
}

/** If it's the bot's turn (South in a bot game), play its best move or pass. */
async function runBot(db: Admin, gameId: string) {
  const { data: game } = await db.from("games").select("*").eq("id", gameId).single();
  if (!game || !game.vs_bot || game.status !== "active" || game.turn !== "south") return;
  const { data: sec } = await db.from("game_secrets").select("*").eq("game_id", gameId).single();
  if (!sec) return;
  const { isWord, isPrefix } = await import("./dictionary.server");
  const board = (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board;
  const move = bestMove(board, sec.south_rack, isWord, isPrefix);
  if (move) {
    await applyPlay(db, game, sec, "south", BOT_ID, move.placements, move);
    return;
  }
  const passes = game.consecutive_passes + 1;
  await db.from("moves").insert({ game_id: gameId, seat: "south", player_id: BOT_ID, kind: "pass" });
  await db.from("games").update({ turn: "north", consecutive_passes: passes, last_move_at: new Date().toISOString() }).eq("id", gameId);
  if (passes >= PASS_LIMIT) await finishByPasses(db, gameId);
}

export const BOT_DEAL_COUNT = 20;

async function ensureBotDeals(db: Admin) {
  const { data: existing } = await db.from("daily_deals").select("*").eq("kind", "bot").order("bot_number");
  const have = new Set((existing ?? []).map((d) => d.bot_number));
  const today = todayUtc();
  for (let n = 1; n <= BOT_DEAL_COUNT; n++) {
    if (have.has(n)) continue;
    const { data: inserted } = await db.from("daily_deals").insert({ deal_date: today, kind: "bot", bot_number: n }).select().maybeSingle();
    if (inserted) {
      const seats = dealSeats(`bot:${n}:${crypto.randomUUID()}`);
      await db.from("deal_secrets").insert({ deal_id: inserted.id, north_tiles: seats.north, south_tiles: seats.south });
    }
  }
  const { data } = await db.from("daily_deals").select("*").eq("kind", "bot").order("bot_number");
  return data ?? [];
}

export const getBotDeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const deals = await ensureBotDeals(db);
    const ids = deals.map((d) => d.id);
    const { data: games } = await db.from("games").select("id, deal_id, north_id, north_score, south_score, status")
      .eq("vs_bot", true).in("deal_id", ids).limit(10000);
    return deals.map((d) => {
      const list = (games ?? []).filter((g) => g.deal_id === d.id);
      const finished = list.filter((g) => g.status === "finished");
      const mine = list.find((g) => g.north_id === context.userId);
      const field = finished.filter((g) => g.id !== mine?.id).map((g) => g.north_score);
      return {
        id: d.id, number: d.bot_number ?? 0, players: finished.length,
        best: finished.length ? Math.max(...finished.map((g) => g.north_score)) : null,
        mine: mine ? {
          gameId: mine.id, status: mine.status, score: mine.north_score, botScore: mine.south_score,
          mp: mine.status === "finished" ? matchpointPercent(mine.north_score, field) : null,
        } : null,
      };
    });
  });

export const startBotGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dealId: string }) => ({ dealId: String(input.dealId) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: deal } = await db.from("daily_deals").select("id, kind").eq("id", data.dealId).maybeSingle();
    if (!deal || deal.kind !== "bot") throw new Error("Deal not found");
    const { data: already } = await db.from("games").select("id")
      .eq("deal_id", deal.id).eq("north_id", context.userId).limit(1);
    if (already?.length) return { gameId: already[0]!.id };
    const game = await createGame(db, deal.id, context.userId, null, true);
    return { gameId: game.id };
  });

export const getLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const deal = await ensureTodayDeal(db);
    const { data: mine } = await db.from("games").select("id")
      .or(`north_id.eq.${context.userId},south_id.eq.${context.userId}`)
      .in("status", ["waiting", "active"]);
    for (const g of mine ?? []) await settle(db, g.id);
    const { data: games } = await db.from("games").select("*, daily_deals(deal_date)")
      .or(`north_id.eq.${context.userId},south_id.eq.${context.userId}`)
      .order("last_move_at", { ascending: false }).limit(40);
    const names = await usernames(db, [context.userId, ...(games ?? []).flatMap((g) => [g.north_id, g.south_id])]);
    return {
      me: { id: context.userId, username: names[context.userId] ?? "player" },
      deal: { id: deal.id, date: deal.deal_date, closesAt: dealClosesAt(deal.deal_date).toISOString() },
      games: (games ?? []).map((g) => {
        const seat: Seat = g.north_id === context.userId ? "north" : "south";
        const oppId = seat === "north" ? g.south_id : g.north_id;
        return {
          id: g.id, status: g.status, seat, dealId: g.deal_id,
          dealDate: (g.daily_deals as { deal_date: string } | null)?.deal_date ?? "",
          myTurn: g.status === "active" && g.turn === seat,
          opponent: g.vs_bot ? "Computer" : oppId ? names[oppId] ?? "player" : null,
          vsBot: g.vs_bot,
          myScore: seat === "north" ? g.north_score : g.south_score,
          oppScore: seat === "north" ? g.south_score : g.north_score,
          lastMoveAt: g.last_move_at,
        };
      }),
    };
  });

export const findOpponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const deal = await ensureTodayDeal(db);
    const { data: already } = await db.from("games").select("id")
      .eq("deal_id", deal.id).or(`north_id.eq.${context.userId},south_id.eq.${context.userId}`).limit(1);
    if (already?.length) throw new Error("You've already played today's deal. A new deal comes out tomorrow.");
    const { data: open } = await db.from("games").select("id")
      .eq("deal_id", deal.id).eq("status", "waiting").is("south_id", null).neq("north_id", context.userId)
      .order("created_at").limit(5);
    for (const g of open ?? []) {
      const { data: joined } = await db.from("games")
        .update({ south_id: context.userId, status: "active", last_move_at: new Date().toISOString() })
        .eq("id", g.id).is("south_id", null).select("id").maybeSingle();
      if (joined) return { gameId: joined.id };
    }
    const game = await createGame(db, deal.id, context.userId, null);
    return { gameId: game.id };
  });

export const challengePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => ({ username: String(input.username).trim().toLowerCase() }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const deal = await ensureTodayDeal(db);
    const { data: opp } = await db.from("profiles").select("id").eq("username", data.username).maybeSingle();
    if (!opp) throw new Error("No player with that username.");
    if (opp.id === context.userId) throw new Error("You can't challenge yourself.");
    for (const id of [context.userId, opp.id]) {
      const { data: already } = await db.from("games").select("id")
        .eq("deal_id", deal.id).or(`north_id.eq.${id},south_id.eq.${id}`).limit(1);
      if (already?.length) {
        throw new Error(id === context.userId
          ? "You've already played today's deal."
          : "That player has already played today's deal.");
      }
    }
    const game = await createGame(db, deal.id, context.userId, opp.id);
    return { gameId: game.id };
  });

export const getGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await admin();
    await settle(db, data.gameId);
    const { data: game } = await db.from("games").select("*, daily_deals(deal_date, kind, bot_number)").eq("id", data.gameId).maybeSingle();
    if (!game) throw new Error("Game not found");
    const seat: Seat | null = game.north_id === context.userId ? "north" : game.south_id === context.userId ? "south" : null;
    if (!seat) throw new Error("You're not in this game");
    const { data: sec } = await db.from("game_secrets").select("north_rack, south_rack").eq("game_id", game.id).single();
    const { data: moves } = await db.from("moves").select("*").eq("game_id", game.id).order("created_at");
    const names = await usernames(db, [game.north_id, game.south_id]);
    return {
      id: game.id, status: game.status, turn: game.turn as Seat, seat, dealId: game.deal_id,
      dealDate: (game.daily_deals as { deal_date: string } | null)?.deal_date ?? "",
      vsBot: game.vs_bot,
      botNumber: (game.daily_deals as { bot_number: number | null } | null)?.bot_number ?? null,
      board: (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board,
      rack: seat === "north" ? sec?.north_rack ?? "" : sec?.south_rack ?? "",
      north: { name: game.north_id ? names[game.north_id] ?? "player" : null, score: game.north_score, rackCount: game.north_rack_count, remaining: game.north_remaining },
      south: { name: game.vs_bot ? "Computer" : game.south_id ? names[game.south_id] ?? "player" : null, score: game.south_score, rackCount: game.south_rack_count, remaining: game.south_remaining },
      moves: (moves ?? []).map((m) => ({ id: m.id, seat: m.seat as Seat, kind: m.kind, words: m.words, score: m.score, at: m.created_at })),
    };
  });

/** Read-only feedback: authenticate membership before loading the player's private rack. */
export const previewPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string; placements: Placement[] }) => ({
    gameId: String(input.gameId),
    placements: (input.placements ?? []).slice(0, RACK_SIZE).map((p) => ({
      r: Number(p.r), c: Number(p.c), letter: String(p.letter).toUpperCase().slice(0, 1),
    })),
  }))
  .handler(async ({ data, context }) => {
    const { data: game } = await context.supabase.from("games").select("*, daily_deals(deal_date)").eq("id", data.gameId).maybeSingle();
    if (!game) throw new Error("Game not found");
    const seat = game.north_id === context.userId ? "north" : game.south_id === context.userId ? "south" : null;
    if (!seat) throw new Error("You're not in this game");
    if (game.status !== "active" || game.turn !== seat) return { ok: false as const, error: "It's not your turn." };
    const date = game.daily_deals?.deal_date;
    if (!game.vs_bot && ((date && Date.now() > dealClosesAt(date).getTime()) || Date.now() - new Date(game.last_move_at).getTime() >= TURN_TIMEOUT_MS)) {
      return { ok: false as const, error: "This turn has ended. Refresh the game." };
    }
    const db = await admin();
    const { data: sec } = await db.from("game_secrets").select("north_rack, south_rack").eq("game_id", game.id).single();
    if (!sec) throw new Error("Could not check your tiles. Try again.");
    const { isWord } = await import("./dictionary.server");
    const board = (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board;
    return evaluatePlay(board, seat === "north" ? sec.north_rack : sec.south_rack, data.placements, isWord);
  });

export const playMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string; placements: Placement[] }) => ({
    gameId: String(input.gameId),
    placements: (input.placements ?? []).slice(0, RACK_SIZE).map((p) => ({
      r: Number(p.r), c: Number(p.c), letter: String(p.letter).toUpperCase().slice(0, 1),
    })),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { isWord } = await import("./dictionary.server");
    const { game, sec, seat } = await loadForMove(db, data.gameId, context.userId);
    const board = (Array.isArray(game.board) && game.board.length ? game.board : emptyBoard()) as Board;
    const rack = seat === "north" ? sec.north_rack : sec.south_rack;
    const result = evaluatePlay(board, rack, data.placements, isWord);
    if (!result.ok) throw new Error(result.error);
    const { finished } = await applyPlay(db, game, sec, seat, context.userId, data.placements, result);
    if (!finished) await runBot(db, game.id);
    return { score: result.score, words: result.words, finished };
  });

export const swapTiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string; letters: string[] }) => ({
    gameId: String(input.gameId),
    letters: (input.letters ?? []).slice(0, RACK_SIZE).map((l) => String(l).toUpperCase().slice(0, 1)),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { game, sec, seat } = await loadForMove(db, data.gameId, context.userId);
    const rack = seat === "north" ? sec.north_rack : sec.south_rack;
    const stream = seat === "north" ? sec.north_stream : sec.south_stream;
    if (!data.letters.length) throw new Error("Pick tiles to swap.");
    if (stream.length < data.letters.length) throw new Error("Not enough tiles left in your stream to swap.");
    const left = removeFromRack(rack, data.letters);
    if (left.length !== rack.length - data.letters.length) throw new Error("You don't have those tiles.");
    // Swapped tiles go to the back of your own stream, so the deal stays the same for your seat.
    const refilled = refill(left, stream + data.letters.join(""));
    const passes = game.consecutive_passes + 1;
    await db.from("game_secrets").update(seat === "north"
      ? { north_rack: refilled.rack, north_stream: refilled.stream }
      : { south_rack: refilled.rack, south_stream: refilled.stream }).eq("game_id", game.id);
    await db.from("moves").insert({ game_id: game.id, seat, player_id: context.userId, kind: "swap" });
    await db.from("games").update({
      turn: seat === "north" ? "south" : "north", consecutive_passes: passes, last_move_at: new Date().toISOString(),
    }).eq("id", game.id);
    if (passes >= PASS_LIMIT) await finishByPasses(db, game.id);
    else await runBot(db, game.id);
    return { ok: true };
  });

export const passTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { game, seat } = await loadForMove(db, data.gameId, context.userId);
    const passes = game.consecutive_passes + 1;
    await db.from("moves").insert({ game_id: game.id, seat, player_id: context.userId, kind: "pass" });
    await db.from("games").update({
      turn: seat === "north" ? "south" : "north", consecutive_passes: passes, last_move_at: new Date().toISOString(),
    }).eq("id", game.id);
    if (passes >= PASS_LIMIT) await finishByPasses(db, game.id);
    else await runBot(db, game.id);
    return { ok: true };
  });

type FinishedGame = { id: string; deal_id: string; north_id: string; south_id: string | null; north_score: number; south_score: number };

function seatResults(games: FinishedGame[]) {
  // One row per player-seat with matchpoints vs everyone else in that seat for the same deal.
  const rows: { gameId: string; dealId: string; playerId: string; seat: Seat; score: number; oppScore: number; mp: number | null }[] = [];
  const byDeal = new Map<string, FinishedGame[]>();
  for (const g of games) byDeal.set(g.deal_id, [...(byDeal.get(g.deal_id) ?? []), g]);
  for (const [dealId, list] of byDeal) {
    for (const g of list) {
      for (const seat of ["north", "south"] as Seat[]) {
        const playerId = seat === "north" ? g.north_id : g.south_id;
        if (!playerId) continue;
        const score = seat === "north" ? g.north_score : g.south_score;
        const field = list.filter((o) => o.id !== g.id).map((o) => (seat === "north" ? o.north_score : o.south_score));
        rows.push({ gameId: g.id, dealId, playerId, seat, score, oppScore: seat === "north" ? g.south_score : g.north_score, mp: matchpointPercent(score, field) });
      }
    }
  }
  return rows;
}

export const getDealResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dealId: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: deal } = await db.from("daily_deals").select("*").eq("id", data.dealId).maybeSingle();
    if (!deal) throw new Error("Deal not found");
    const { data: mine } = await db.from("games").select("id, status")
      .eq("deal_id", deal.id).or(`north_id.eq.${context.userId},south_id.eq.${context.userId}`).maybeSingle();
    const isBot = deal.kind === "bot";
    const open = isBot || Date.now() <= dealClosesAt(deal.deal_date).getTime();
    if (open && mine?.status !== "finished") {
      throw new Error("Finish your game on this deal to see how the field did.");
    }
    const { data: games } = await db.from("games").select("id, deal_id, north_id, south_id, north_score, south_score")
      .eq("deal_id", deal.id).eq("status", "finished").or("south_id.not.is.null,vs_bot.eq.true");
    const rows = seatResults((games ?? []) as FinishedGame[]);
    const names = await usernames(db, rows.map((r) => r.playerId));
    return {
      deal: { id: deal.id, date: deal.deal_date, closesAt: dealClosesAt(deal.deal_date).toISOString(), open, botNumber: isBot ? deal.bot_number : null },
      myGameId: mine?.id ?? null,
      rows: rows.map((r) => ({ ...r, name: names[r.playerId] ?? "player", isMe: r.playerId === context.userId }))
        .sort((a, b) => b.score - a.score),
    };
  });

export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: games } = await db.from("games").select("id, deal_id, north_id, south_id, north_score, south_score")
      .eq("status", "finished").not("south_id", "is", null).limit(5000);
    const rows = seatResults((games ?? []) as FinishedGame[]);
    const agg = new Map<string, { played: number; wins: number; losses: number; ties: number; mpSum: number; mpCount: number; best: number }>();
    for (const r of rows) {
      const a = agg.get(r.playerId) ?? { played: 0, wins: 0, losses: 0, ties: 0, mpSum: 0, mpCount: 0, best: 0 };
      a.played++;
      if (r.score > r.oppScore) a.wins++; else if (r.score < r.oppScore) a.losses++; else a.ties++;
      if (r.mp !== null) { a.mpSum += r.mp; a.mpCount++; }
      a.best = Math.max(a.best, r.score);
      agg.set(r.playerId, a);
    }
    const names = await usernames(db, [...agg.keys()]);
    const players = [...agg.entries()].map(([id, a]) => ({
      id, name: names[id] ?? "player", isMe: id === context.userId, played: a.played, wins: a.wins, losses: a.losses, ties: a.ties,
      best: a.best, avgMp: a.mpCount ? Math.round((a.mpSum / a.mpCount) * 10) / 10 : null,
    })).sort((x, y) => (y.avgMp ?? -1) - (x.avgMp ?? -1) || y.wins - x.wins);
    return { players };
  });

export const updateUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => {
    const u = String(input.username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new Error("Use 3–20 letters, numbers or underscores.");
    return { username: u };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update({ username: data.username }).eq("id", context.userId);
    if (error) throw new Error(error.code === "23505" ? "That username is taken." : error.message);
    return { ok: true };
  });
