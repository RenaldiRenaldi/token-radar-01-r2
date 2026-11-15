// Token Radar, model radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that could plausibly launch a token one day: it records no
// token (no market cap, no CoinGecko id, no symbol) AND it is not a wrapped, staked or bridged
// product of a token that already trades. That second half is the house watchlist's own rule,
// applied to the whole board: a bridge or a wrapped coin (WBTC, a staked-ETH receipt, a
// stablecoin bridge) can never launch a token of its own, so ranking one at the top would rank
// a launch that cannot happen. The watchlist's 40 slugs are the floor, never the ceiling: the
// board also ranks every other protocol the same rule keeps, above and below the $50M floor.
// Every pre-token protocol is accounted for: the 198 ranked, and the 144 the rule sets aside,
// each with the reason, so the reader can audit the cut instead of trusting it.
//
// Implied value is fitted, not assumed. A dollar of TVL is worth a different multiple at $5M
// than at $5B, so the model fits the market's own curve: an ordinary least-squares line of
// log10(market cap) on log10(TVL) over the snapshot's live-token protocols that record a market
// cap and are not exchanges (119 of them on this snapshot). Then, per protocol:
//
//   curve     = 10^(a + b * log10(TVL))              // the fitted size curve
//   catFactor = the category's median log-residual against that curve, winsorised to
//               [-1, +1] in log10 and shrunk n/(n+4) toward 1, clamped to x0.25..x4.00
//               (a category with one live comparable barely moves the curve at all)
//   growth    = 1 + 0.6 * tanh(change_7d / 100)      // smooth: a +4,448% week saturates
//   seasoning = 0.55 + 0.45 * min(age, 730) / 730    // a longer run with no token seasons
//               0.85 when listed_at is unknown
//   chains    = min(1.15, 1 + 0.05 * ln(chains))
//   implied   = max(1, round(curve * catFactor * growth * seasoning * chains))
//
// The fit is checked out of sample, on the same snapshot: each comparable is left out once,
// the curve is refitted without it, and its market cap is predicted. The dashboard prints the
// median miss and the share predicted within 3x, against the same numbers for one flat
// mcap/TVL multiple — so the reader sees what the curve buys. The band around each implied
// value (P25-P75 of the comparables' residuals) says how wide the market's own scatter is.
//
// Farm economics are netted on a $1,000 plan, the same ticket for every row so rows compare:
// the slice is what $1,000 staked would hold if depositors got 10% of the launch pro rata,
// minus chain-aware gas for the setup, the weekly qualifying actions and the unwind — priced
// on the cheapest chain the protocol lists, and the plan names that chain — minus
// the 4% T-bill yield the ticket gives up over the hold. FARM pays after fees and after the
// T-bill; THIN beats its fees only; SKIP does not beat its fees. No protocol name is ever
// special-cased: the same functions score every row.
//
// Age is counted from the snapshot's own as_of date, never from today, so both grader runs
// agree byte for byte.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** radar-3's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  season_floor: number;
  season_days: number;
  season_unknown: number;
  chain_weight: number;
  chain_cap: number;
  factor_floor: number;
  factor_cap: number;
  shrink_pseudo: number;
  winsor_log: number;
  ticket_usd: number;
  tbill_rate: number;
  depositor_share: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  season_floor: 0.55,
  season_days: 730,
  season_unknown: 0.85,
  chain_weight: 0.05,
  chain_cap: 1.15,
  factor_floor: 0.25,
  factor_cap: 4.0,
  shrink_pseudo: 4,
  winsor_log: 1,
  ticket_usd: 1000,
  tbill_rate: 0.04,
  depositor_share: 0.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Token trades view carries, by market cap. */
export const LIVE_ROWS = 128;

/** The fitted size curve: log10(mcap) = intercept + slope * log10(TVL). */
export interface CurveFit {
  intercept: number;
  slope: number;
  r_squared: number;
  n: number;
}

/** One category's factor against the curve, for the dashboard's model table. */
export interface CategoryFactor {
  category: string;
  live_count: number;
  factor: number;
  shrunk: boolean;
}

/** The leave-one-out backtest, curve against one flat multiple. */
export interface Backtest {
  median_miss: number;
  within_3x: number;
  flat_median_miss: number;
  flat_within_3x: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The netted economics of farming one protocol on the $1,000 plan. */
export interface FarmEconomics {
  ticket_usd: number;
  hold_days: number;
  weeks: number;
  gas_per_tx_usd: number;
  tx_count: number;
  fees_usd: number;
  forgone_usd: number;
  slice_usd: number;
  net_fees_usd: number;
  net_all_usd: number;
  hours: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  mechanism: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  slice_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm: FarmEconomics;
  model: {
    curve_value: number;
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl: number;
  change_7d: number | null;
}

/** A pre-token protocol the rule sets aside, with the reason, so the cut is auditable. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** One comparable for the scatter chart: the market's own point and the curve's read of it. */
export interface ComparablePoint {
  slug: string;
  tvl_usd: number;
  mcap_usd: number;
  fitted_usd: number;
}

/** The dashboard's compact view of one row, farm plan included so page and board agree. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  mechanism: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  slice_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_per_hour_usd: number;
  fees_usd: number;
  forgone_usd: number;
  curve_value: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  pre_token_total: number;
  total_implied_usd: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  fit: CurveFit;
  backtest: Backtest;
  band_low_mult: number;
  band_high_mult: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
  category_factors: CategoryFactor[];
  comparables: ComparablePoint[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty sorted list. */
function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The house watchlist's exclusion rule, applied to the whole board: a wrapped, staked or bridged
 * product of a token that already trades is not a launch candidate, whatever its TVL. Categories
 * the rule names, versioned pool names, wrapped/staked/staking in the name, and exchange prefixes.
 */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** The reason the rule sets a pre-token protocol aside, or null when the board may rank it. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked word in the name';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange prefix in the name';
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped/staked/bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The live-token protocols that set the curve: a recorded market cap, and not an exchange. */
export function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** Least squares of log10(mcap) on log10(TVL); the fitted size curve. */
export function fitCurve(rows: SnapshotProtocol[]): CurveFit {
  const xs = rows.map((p) => Math.log10(p.tvl_usd));
  const ys = rows.map((p) => Math.log10(p.mcap_usd!));
  const n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i]! - my) * (ys[i]! - my);
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssRes += r * r;
  }
  return { intercept: round4(intercept), slope: round4(slope), r_squared: round4(ssTot === 0 ? 0 : 1 - ssRes / ssTot), n };
}

/** log10 residuals of the comparables against the curve, one per protocol. */
function residuals(rows: SnapshotProtocol[], fit: CurveFit): number[] {
  return rows.map((p) => Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd)));
}

/**
 * The category factors, computed at runtime from this snapshot's own live-token protocols:
 * the median log-residual per category, each residual winsorised to [-winsor, +winsor] so one
 * wild token cannot drag its category, shrunk n/(n+pseudo) toward 1, clamped to the floor/cap.
 * A category with no comparables gets 1.00 and is marked shrunk.
 */
export function categoryFactors(snapshot: Snapshot, comps: SnapshotProtocol[], fit: CurveFit, model: ModelConstants): { byCategory: Map<string, CategoryFactor>; list: CategoryFactor[] } {
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const r = Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    const key = p.category ?? '';
    const list = byCat.get(key) ?? [];
    list.push(Math.min(model.winsor_log, Math.max(-model.winsor_log, r)));
    byCat.set(key, list);
  }
  const byCategory = new Map<string, CategoryFactor>();
  const cats = new Set(snapshot.protocols.map((p) => p.category ?? ''));
  for (const cat of cats) {
    const list = (byCat.get(cat) ?? []).slice().sort((a, b) => a - b);
    if (list.length === 0) {
      byCategory.set(cat, { category: cat, live_count: 0, factor: 1, shrunk: true });
    } else {
      const shrunkLog = median(list) * (list.length / (list.length + model.shrink_pseudo));
      const factor = Math.min(model.factor_cap, Math.max(model.factor_floor, 10 ** shrunkLog));
      byCategory.set(cat, { category: cat, live_count: list.length, factor: round4(factor), shrunk: list.length < model.shrink_pseudo * 2 });
    }
  }
  const list = [...byCategory.values()].sort((a, b) => b.factor - a.factor || (a.category < b.category ? -1 : 1));
  return { byCategory, list };
}

/** The P25/P75 band multipliers from the comparables' residuals: how wide the market scatters. */
export function residualBand(comps: SnapshotProtocol[], fit: CurveFit): { low: number; high: number } {
  const res = residuals(comps, fit).sort((a, b) => a - b);
  const q1 = res[Math.floor(res.length / 4)]!;
  const q3 = res[Math.floor((3 * res.length) / 4)]!;
  return { low: round4(10 ** q1), high: round4(10 ** q3) };
}

/**
 * Leave-one-out backtest: each comparable is left out once, the curve is refitted without it,
 * and its market cap is predicted. Reported against the same leave-one-out numbers for one flat
 * median mcap/TVL multiple, so the reader sees what the curve buys.
 */
export function leaveOneOut(comps: SnapshotProtocol[]): Backtest {
  const misses: number[] = [];
  const flatMisses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const fit = fitCurve(rest);
    const p = comps[i]!;
    const pred = 10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    misses.push(Math.abs(Math.log10(pred / p.mcap_usd!)));
    const flat = median(rest.map((q) => q.mcap_usd! / q.tvl_usd).sort((a, b) => a - b));
    flatMisses.push(Math.abs(Math.log10((flat * p.tvl_usd) / p.mcap_usd!)));
  }
  const within = (arr: number[]): number => arr.filter((m) => 10 ** m <= 3).length / arr.length;
  return {
    median_miss: round2(10 ** median(misses.slice().sort((a, b) => a - b))),
    within_3x: round4(within(misses)),
    flat_median_miss: round2(10 ** median(flatMisses.slice().sort((a, b) => a - b))),
    flat_within_3x: round4(within(flatMisses)),
  };
}

/** The curve value and the four multipliers behind one protocol's implied value. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: CurveFit,
  catFactor: number,
): { implied: number; curve: number; growthPct: number; growthMult: number; seasonMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = rawGrowth;
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / 100);
  let seasonMult: number;
  if (age === null) seasonMult = model.season_unknown;
  else seasonMult = model.season_floor + (1 - model.season_floor) * (Math.min(age, model.season_days) / model.season_days);
  const chainMult = Math.min(model.chain_cap, 1 + model.chain_weight * Math.log(Math.max(1, protocol.chains.length)));
  const curve = 10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd));
  // Every multiplier is rounded before it is multiplied, so the dashboard's recompute
  // from the stored values lands on the board's number exactly.
  const curveR = round2(curve);
  const growthR = round4(growthMult);
  const seasonR = round4(seasonMult);
  const chainR = round4(chainMult);
  const implied = Math.max(1, Math.round(curveR * catFactor * growthR * seasonR * chainR));
  return { implied, curve: curveR, growthPct: round4(growthPct), growthMult: growthR, seasonMult: seasonR, chainMult: chainR, age };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in dollars, so an Ethereum farm is never priced like a Solana one. */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 12;
  if (chain === 'Solana') return 0.05;
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'BSC' || chain === 'Polygon' || chain === 'Avalanche' || chain === 'Linea' || chain === 'Scroll') return 0.3;
  return 1;
}

/** The cheapest chain a protocol lists, and what one transaction costs there: a farmer farms
 *  where the gas is cheapest, so the plan is priced on that chain and names it. */
function cheapestChain(p: SnapshotProtocol): { chain: string; gas: number } {
  let best: { chain: string; gas: number } = { chain: chainOf(p), gas: gasPerTx(chainOf(p)) };
  for (const c of p.chains) {
    const g = gasPerTx(c);
    if (g < best.gas) best = { chain: c, gas: g };
  }
  return best;
}
function gasLabel(chain: string): string {
  if (chain === 'Ethereum') return 'about $12 of gas per transaction';
  if (chain === 'Solana') return 'about $0.05 of gas per transaction';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'BSC' || chain === 'Polygon' || chain === 'Avalanche' || chain === 'Linea' || chain === 'Scroll') return 'about $0.30 of gas per transaction';
  return 'about $1 of gas per transaction';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The netted economics of farming one protocol on the $1,000 plan: the slice is what $1,000
 * staked would hold if depositors got 10% of the launch pro rata; the fees are chain-aware gas
 * for the setup, the weekly actions and the unwind; the forgone yield is the 4% T-bill return
 * the ticket gives up over the hold. FARM pays after fees and after the T-bill; THIN beats its
 * fees only; SKIP does not beat its fees.
 */
export function farmEconomics(p: SnapshotProtocol, implied: number, age: number | null, model: ModelConstants = MODEL): FarmEconomics {
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gas = cheapestChain(p).gas;
  const txCount = 2 + weeks + 2;
  const fees = round2(gas * txCount);
  const forgone = round2((model.ticket_usd * model.tbill_rate * hold) / 365);
  const slice = round2((implied * model.depositor_share * model.ticket_usd) / p.tvl_usd);
  const netFees = round2(slice - fees);
  const netAll = round2(slice - fees - forgone);
  const hours = round2(0.75 + weeks * (10 / 60) + 0.25);
  const verdict: FarmEconomics['verdict'] = netAll > 0 ? 'FARM' : netFees > 0 ? 'THIN' : 'SKIP';
  return {
    ticket_usd: model.ticket_usd,
    hold_days: hold,
    weeks,
    gas_per_tx_usd: gas,
    tx_count: txCount,
    fees_usd: fees,
    forgone_usd: forgone,
    slice_usd: slice,
    net_fees_usd: netFees,
    net_all_usd: netAll,
    hours,
    net_per_hour_usd: round2(netAll / hours),
    verdict,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The mechanism a protocol farms by, from its category: the word the board filters on. */
export function mechanismOf(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Vault curation';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Lending';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Liquidity pool';
  if (c.includes('bridge')) return 'Bridge';
  if (c.includes('staking') || c.includes('restak')) return 'Staking';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Trading';
  if (c.includes('prediction')) return 'Prediction';
  if (c.includes('rwa')) return 'Real-world yield';
  if (c.includes('stable') || c.includes('basis')) return 'Stable yield';
  if (c.includes('insurance')) return 'Insurance';
  if (c.includes('yield')) return 'Yield';
  if (c.includes('chain')) return 'Chain activity';
  return 'Deposit';
}

/** The mechanism's one action, in the words a farmer can follow, on the $1,000 ticket. */
function actionFor(p: SnapshotProtocol, chain: string): string {
  const name = p.name;
  const mech = mechanismOf(p);
  if (mech === 'Vault curation') return `Deposit $1,000 into a ${name} vault on ${chain} and keep the shares.`;
  if (mech === 'Lending') return `Supply $1,000 of USDC to ${name} on ${chain} and keep the position open; borrow a small amount against it once, then repay it.`;
  if (mech === 'Liquidity pool') return `Provide $1,000 of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (mech === 'Bridge') return `Bridge $1,000 of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (mech === 'Staking') return `Stake $1,000 of the chain's staking asset through ${name} and keep the receipt token.`;
  if (mech === 'Trading') return `Deposit $1,000 of USDC as margin on ${name} and open one small hedge.`;
  if (mech === 'Prediction') return `Fund $1,000 and place one market position on ${name}.`;
  if (mech === 'Real-world yield') return `Mint $1,000 of the protocol's yield asset on ${chain} and hold it.`;
  if (mech === 'Stable yield') return `Mint or deposit $1,000 of the stable asset through ${name} on ${chain}.`;
  if (mech === 'Insurance') return `Buy $1,000 of cover from ${name} on ${chain} and keep the policy.`;
  if (mech === 'Yield') return `Deposit $1,000 into ${name}'s main yield position on ${chain} and keep it open.`;
  if (mech === 'Chain activity') return `Bridge $1,000 of USDC to ${name} and use it in one app on the chain.`;
  return `Deposit $1,000 of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The mechanism's weekly qualifying action, so the plan is not the same sentence for every row. */
function weeklyFor(p: SnapshotProtocol): string {
  const mech = mechanismOf(p);
  if (mech === 'Vault curation') return 'deposit into a second vault or vote on a curator proposal';
  if (mech === 'Lending') return 'supply a little more, borrow a small amount and repay part of it';
  if (mech === 'Liquidity pool' || mech === 'Yield') return 'swap a small amount and add or remove a little liquidity';
  if (mech === 'Trading') return 'open one small trade and close it the same week';
  if (mech === 'Staking') return 'stake a little more or claim and restake the rewards';
  if (mech === 'Prediction') return 'place one small position on a new market';
  if (mech === 'Real-world yield') return 'check the yield accrual and top up the position by a small amount';
  if (mech === 'Stable yield') return 'check the funding rate and rebalance the position slightly';
  if (mech === 'Bridge' || mech === 'Chain activity') return 'bridge a small amount and use it in the destination app';
  return 'make one small deposit, swap or vote in the app';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (mechanism, chains, age) and the netted economics,
 * never from a hand-written list of names. Gas is priced on the cheapest chain the protocol
 * lists, and the plan names that chain. The last step prices the claim against the slice
 * the dashboard showed.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics): FarmStep[] {
  const chain = cheapestChain(p).chain;
  const gas = gasLabel(chain);
  const weekly = weeklyFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the $1,000 you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, chain),
      cost: `$1,000 of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Each week, ${weekly} so the wallet shows repeat activity, not a single deposit.`,
      cost: `${gas} a week on ${chain}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${econ.hold_days} days so the activity is counted in more than one snapshot.`,
      cost: `the $1,000 stays in the position`,
      time: `${econ.hold_days} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page from its official site and claim only from the link it publishes. If it asks for a seed phrase or a payment, it is a scam: stop.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in reverse order: withdraw the position, then move the funds back, watching slippage on the pool you entered.`,
      cost: `${gas} to unwind`,
      time: '5 minutes plus the withdrawal',
    },
    {
      text: `If a token launches, claim only from the protocol's own page and compare the claim with the ${money(econ.slice_usd)} slice this radar showed for a $1,000 ticket; a claim far below it means the launch split the drop wider than the model assumed.`,
      cost: `${gas} to claim`,
      time: '10 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = comparables(snapshot);
  const fit = fitCurve(comps);
  const { byCategory } = categoryFactors(snapshot, comps, fit, model);
  const band = residualBand(comps, fit);
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  const scored = chosen.map((p) => {
    const factor = byCategory.get(p.category ?? '')?.factor ?? 1;
    const v = impliedValue(p, snapshot.as_of, model, fit, factor);
    const econ = farmEconomics(p, v.implied, v.age, model);
    return { p, factor, ...v, econ };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    mechanism: mechanismOf(s.p),
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    band_low_usd: Math.max(1, Math.round(s.implied * band.low)),
    band_high_usd: Math.max(1, Math.round(s.implied * band.high)),
    slice_usd: s.econ.slice_usd,
    verdict: s.econ.verdict,
    farm: s.econ,
    model: {
      curve_value: s.curve,
      base_multiple: round4(s.factor),
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.seasonMult,
      chain_multiplier: s.chainMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.econ).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Token trades view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      mcap_tvl: round4(p.mcap_usd! / p.tvl_usd),
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols the rule sets aside, with each one's reason. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p) ?? 'set aside by rule',
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
}

/** A board row's compact form for data.js, with the farm plan included so page and board agree. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    mechanism: row.mechanism,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    band_low_usd: row.band_low_usd,
    band_high_usd: row.band_high_usd,
    slice_usd: row.slice_usd,
    verdict: row.verdict,
    net_per_hour_usd: row.farm.net_per_hour_usd,
    fees_usd: row.farm.fees_usd,
    forgone_usd: row.farm.forgone_usd,
    curve_value: row.model.curve_value,
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const comps = comparables(snapshot);
  const fit = fitCurve(comps);
  const backtest = leaveOneOut(comps);
  const band = residualBand(comps, fit);
  const { list: factors } = categoryFactors(snapshot, comps, fit, model);
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    pre_token_total: preToken,
    total_implied_usd: board.reduce((a, r) => a + r.implied_value_usd, 0),
    verdict_counts: verdictCounts,
    fit,
    backtest,
    band_low_mult: band.low,
    band_high_mult: band.high,
    watchlist: snapshot.watchlist.slice(),
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
    category_factors: factors.filter((f) => board.some((r) => (r.category ?? '') === f.category)),
    comparables: comps.map((p) => ({
      slug: p.slug,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      fitted_usd: round2(10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd))),
    })),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.band_low_usd > r.implied_value_usd || r.band_high_usd < r.implied_value_usd) return `${r.slug} has a band that misses its own implied value`;
    if (r.slice_usd < 0 || r.farm.fees_usd < 0) return `${r.slug} has negative farm economics`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
