# Duplicate Words — head-to-head word game scored like duplicate bridge

## The idea
Every day there's one new **Daily Deal**. You play it head-to-head against one opponent, Words-with-Friends style, taking turns whenever you like over several days. Every pair that day gets the exact same tiles in the same order. Your final score counts for your match, and it's also ranked against every other player who sat in your seat that day.

## How the "same tiles" rule works
- Each deal has two seats, **North** and **South**. Each seat gets its own fixed tile sequence, created from that day's seed.
- When you refill your rack, you always draw the next tiles from *your seat's* sequence, so your opponent's moves never change what you get.
- So every North player that day sees exactly the same tiles. Only their choices differ, just like duplicate bridge hands.
- Board layout and bonus squares are the same as in a standard Words with Friends–style game (15x15).

## Scoring
1. **Match result:** win, lose or tie against your direct opponent.
2. **Seat score (matchpoints):** when the day's games are finished, your raw score is compared with everyone else in the same seat. You get 1 point for each player you beat and ½ for each tie, then it's shown as a percentage.
3. **Leaderboards:** today's deal (by seat), all-time average matchpoint %, and win/loss record.

## Screens
- **Sign up / sign in:** email and password, plus a username shown to other players.
- **Lobby:** today's deal, "Find opponent" (random match) or "Challenge a friend" by username, your active games, and whose turn it is.
- **Game board:** board, your rack (drag or tap to place), shuffle, swap, pass, submit, live score, move history.
- **Deal results:** after both games finish, compare your score with the field, see the top-scoring move for each turn of your seat, and see your matchpoint %.
- **Leaderboards** and **Profile** (stats, past deals).

## Rules
- Words are checked against a standard English dictionary (the free ENABLE word list).
- A game ends when one player empties their rack after their tile sequence runs out, or after 3 passes in a row from each player. Leftover tiles are subtracted, as in normal play.
- Each daily deal stays open for **72 hours**. A game that hasn't finished by then is scored as it stands.
- A turn that sits unanswered for 48 hours is forfeited (configurable).

## Visual direction
Warm card-room look: deep felt-green and cream, ivory tiles with serif letters, brass accents, so it feels closer to a bridge club than to a generic app.

## Technical details
- Lovable Cloud for accounts, a profiles table with unique usernames, and storage for deals, games, moves and results, with row-level security plus grants on every table.
- `daily_deals` (date, seed, per-seat tile sequences stored on the server), `games` (deal, north/south players, board state, turn, draw indexes, status), `moves`, `seat_results`.
- All moves are checked by a server function: tile ownership, placement geometry, dictionary lookup and scoring. Clients never see upcoming tiles.
- Matchpoints are recalculated when a game finishes and when the deal closes. A scheduled server route closes expired deals and creates the next day's deal.
- Pure game-logic module (bag, placement, scoring, matchpoints) with unit tests for the scoring and deal rules.
- Players see turns from other players by refreshing live in real time while the game is open. Email notifications can be added later.

## Out of scope for v1
Chat, push or email notifications, more than two players, and other languages.
