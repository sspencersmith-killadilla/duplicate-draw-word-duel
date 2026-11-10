<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Game rules live in pure `src/lib/game/engine.ts` (tested in `engine.test.ts`); server functions in `game.functions.ts` are the only writers of game state, so moves can't be faked from the browser.
- Upcoming tiles and racks are kept in service-only tables (`deal_secrets`, `game_secrets`) so players never see future draws.
- Each seat (North/South) draws from its own half of the deal's shuffled bag, so every table's seat gets identical tiles regardless of the opponent's play.
- Deal expiry and 48h turn timeouts are applied lazily when games are read (no scheduled job) to avoid recurring backend cost.
- Read server functions use POST so refetches after a move are never served stale.
- Bot deals reuse `daily_deals` (kind='bot', bot_number) and `games.vs_bot`; the human is always North and the bot (South, deterministic best-score move from `engine.bestMove`) moves inside the same server call, so bot games need no scheduler and every North player faces the same strategy.
- Guest play uses anonymous auth sessions; guests upgrade in place (updateUser email+password) so their user id, games and results carry over.
- Placement previews use an authenticated read-only server function and the same engine/dictionary as submission; previews never commit a move or reveal future tiles.
