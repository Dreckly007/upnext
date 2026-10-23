# Fair Deal — feature plan for Up Next

## Summary

Add **Fair Deal**: a fair-rotation session with a quick, tap-to-record points table and a winner at the end of the night.

Fair Deal does **not** need a new rotation engine. The existing Session Scheduler already spreads sit-outs, partners, opponents and groups of four fairly, and fits late arrivals in without resetting fairness tracking. Fair Deal is a **new scoring style** on top of the Session Scheduler, plus a prominent Home card.

**Results must never affect pairings.** The rotation stays purely fair, exactly as it works today.

## Before you start (for Claude Code)

1. Read the existing codebase first, especially the Session Scheduler, court cards and score entry, leaderboard, Print & Share, shared read-only view, and Session stats.
2. Propose a step-by-step implementation plan that fits the current code structure, and wait for approval before building.
3. Existing behaviour must not change for anyone who doesn't use Fair Deal. Existing saved sessions should load as **Scoring = Full scores**.
4. Ladder and Tournament are **out of scope**. Don't change them.

---

## 1. Where Fair Deal lives

### Session Scheduler: new "Scoring" setting
Three options, shown in session setup:
- **Full scores** (current behaviour, default for normal sessions)
- **Fair Deal**
- **No scoring**

The organiser can **switch scoring style at any time during a session** (see section 5).

### Home screen: new "Fair Deal" card
- A fourth mode card next to Session Scheduler, Ladder and Tournament.
- Suggested description: *"Fair rotation with a points table. Tap the winner, crown a champion."*
- It opens the Session Scheduler with **Scoring = Fair Deal** preselected. Same engine underneath, no duplicate code.

---

## 2. Fair Deal settings (in session setup when Fair Deal is selected)

| Setting | Options | Default |
|---|---|---|
| Game type | **Timed** / **Play to 11** | Timed |
| Close-loss margin | lost by N points or fewer (1–5) | 3 |
| Qualifying minimum | % of the most games played by anyone (e.g. 40–75%) | 50% |

- **Game type is separate** from the existing "How long to play" settings. A night can have a time budget but still play each game to 11.
- Game type can be changed mid-session. Store the game type **on each game when its result is recorded**, so earlier results keep their meaning.

---

## 3. Recording results (organiser only)

In Fair Deal mode, the court card's +/− score entry is replaced with:

- **[Team A won] [Draw] [Team B won]**. The **Draw** button only appears when game type = Timed.
- After a win is chosen, a **"Close game?"** Yes/No toggle appears (close = loser was within the close-loss margin).
- Tapping again changes or clears the result.
- No typing numbers. This must be fast with four courts finishing at once.
- Works for doubles and singles. Scoring is always **individual**: both partners on a team receive the same points.

---

## 4. Points and leaderboard

### Points per game (per player)
| Result | Points |
|---|---|
| Win | 3 |
| Draw (timed games only) | 1 |
| Close loss (lost by ≤ close-loss margin) | 1 |
| Loss | 0 |

### Ranking
- Ranked by **average points per game** = total points ÷ games played.
- **Games played** counts only games with a recorded result (win, loss or draw). Games with no result, or flagged unfinished, don't count.
- **Tiebreak:** equal average → more games played ranks higher → still level = **shared place** (e.g. "Joint 2nd").

### Qualifying minimum
- Minimum games = **50% of the most games played by any player that night, rounded up** (percentage is the organiser setting).
- Players below the minimum are still listed, below the ranked players, marked **"Not yet qualified"**. Nobody disappears from the table.
- The minimum is recalculated live, so it rises as the night goes on.

### Leaderboard columns
**Rank | Player | Avg pts (2 d.p.) | Games | Total pts** (W–D–L record optional).

Applies to the on-screen Leaderboard, the **Leaderboard print**, and the **shared read-only view**.

---

## 5. Switching scoring style mid-session

**Principle: store the most detailed result available for each game and calculate the leaderboard from it every time.** Switching scoring style changes how results are *displayed and calculated*. It never converts or overwrites stored data.

Suggested stored fields per game: `scoreA`, `scoreB` (nullable), `result` (`A` / `B` / `draw` / null), `close` (bool, nullable), `gameType` (snapshot).

| Switch | Behaviour |
|---|---|
| Full → Fair Deal | Derived automatically: higher score = win; equal score in a Timed game = draw; loser within the close-loss margin = close loss. |
| Fair Deal → Full | Fair Deal games have no scores. Show the result (W/L/D) without a score. Never invent scores. |
| No scoring → Fair Deal or Full | Earlier games have no result and don't count as games played. The organiser can go back and record results. |
| Back to Full later | Any games entered with full scores keep them, because nothing was overwritten. |

**Edge case:** game type = Play to 11 and a full score is level (e.g. stopped early). Don't count it as a draw. Flag it as **unfinished** and prompt the organiser to choose a result. Exclude it from games played until resolved.

---

## 6. End of the night

### Winner
- When the organiser ends a Fair Deal session, show a **winner screen**: the top qualified player, and a **podium for the top 3**.
- Shared places show as joint (e.g. two joint winners).
- Shareable and printable via the existing Print & Share tools.
- During the session, the leaderboard can show the current leader. The winner is confirmed when the session ends.

### Session stats (all-time, on the device)
Add Fair Deal totals per player:
- Fair Deal sessions played
- **Nights won** (including joint wins)
- Fair Deal games played, total points, and all-time average points per game

A session counts towards Fair Deal stats if its scoring style is **Fair Deal when it ends**. Existing stats stay unchanged.

---

## 7. Worked examples (use as test cases)

1. **Averages:** Player A has 4 points from 3 games (1.33). Player B has 10 points from 6 games (1.67). B ranks above A.
2. **Drop-in:** Player C plays 1 game and wins (3.00). The most games played that night is 9, so the minimum is 5. C is listed as "Not yet qualified", below A and B.
3. **Tiebreak:** D and E both average 1.50. D played 8 games, E played 6. D ranks higher. If games were equal too, they share the place.
4. **Close loss:** Timed game ends 7–5. The losers get 1 point each (lost by 2 ≤ 3). Play-to-11 game ends 11–8: the losers get 1 point each. A game ending 11–4 gives the losers 0.
5. **Switch Full → Fair Deal:** a game scored 9–9 under Timed is a draw (1 point each). A game scored 9–9 under Play to 11 is flagged unfinished.
6. **Switch Fair Deal → Full:** games recorded by tap show "Team A won" with no score. No scores are made up.
7. **Late arrival:** a player added in round 4 is fitted in fairly by the existing scheduler, and their average uses only the games they played.

---

## 8. Out of scope for now (possible later)

- Players recording their own results from their phones (organiser only for now).
- Full scores feeding a Fair Deal-style rating across sessions, or strength-adjusted (Elo-style) ratings.
- Fair Deal inside Ladders or Tournaments.
