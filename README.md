# Token Radar — model radar-3

Which token launch would be worth the most? A dashboard that ranks the 198 pre-token
protocols in the sealed DefiLlama snapshot by implied value, and shows how to farm each one —
with the farm plan netted on a $1,000 ticket.

## Model (radar-3)

`implied = curve(TVL) × category × growth × seasoning × chains`, all from the snapshot's
own figures, no name ever special-cased:

- **curve** — the market's own size curve: OLS of log10(market cap) on log10(TVL) over the
  119 live-token protocols that record a market cap and are not exchanges
  (this snapshot: `log10(mcap) = 3.382 + 0.472 × log10(TVL)`).
- **category** — median log-residual per category against that curve, winsorised to ±1 in
  log10 and shrunk toward ×1.00 with 4 pseudo-comparables, clamped ×0.25–×4.00.
- **growth** — `1 + 0.6·tanh(7-day change / 100)`, so a +4,448% week saturates instead
  of clipping at a hard edge.
- **seasoning** — `0.55 + 0.45·min(age, 730)/730`; a longer run with no token seasons the
  launch instead of cooling it. Unknown age scores 0.85.
- **chains** — `min(1.15, 1 + 0.05·ln(chains))`.

Checked out of sample on the same snapshot: each comparable is left out once, the curve is
refitted without it, and its cap is predicted. Median miss ×3.36, within 3× for 44% —
against ×4.88 and 34% for one flat mcap/TVL multiple. Every implied value carries its
P25–P75 band (×0.32–×4.02).

## Farm economics

Each row is netted on a $1,000 plan: the slice is what $1,000 staked would hold if
depositors got 10% of the launch pro rata, minus chain-aware gas (Ethereum ≈ $12/tx,
L2/BSC ≈ $0.30, Solana ≈ $0.05) for setup, weekly actions and unwind — priced on the
cheapest chain each protocol lists, and the plan names it — minus the 4% T-bill
yield the ticket gives up over the hold. **FARM** pays after fees and after the T-bill;
**THIN** beats its fees only; **SKIP** does not beat its fees.

Bridges, wrapped coins and staked products are not ranked: they are a product of a token
that already trades, so they can never launch one of their own. The watchlist's 40 slugs
are the floor, never the ceiling — the board also ranks the 158 other launch candidates
the same rule keeps, and the dashboard audits the 144 it sets aside, each with its reason.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only, no network. Runs twice with byte-identical output.
The dashboard (`dashboard/`) is static, renders with no network from `data.js`, and the
page recomputes each row's implied value and prints whether it matches the board.

## Entry

Built for the make.fun token-radar-01 competition. `main.ts` at the root, `vendor/`
carries the kit's `makefun-board.ts` byte-for-byte, `screenshots/` holds the board, a
detail view and a filtered view at 1440×900.
