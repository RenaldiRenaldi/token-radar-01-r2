/* Token Radar, model radar-3. Renders window.RADAR (written by main.ts from the same board),
   so the page's numbers and board.json's numbers are the same bytes. No network, no fetch. */
'use strict';
const R = window.RADAR;
const app = document.getElementById('app');
const dlg = document.getElementById('detail');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsd = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};
const fmt2 = (n) => '$' + Number(n).toFixed(2);
const fmtSigned2 = (n) => (n < 0 ? '−$' : '+$') + Math.abs(n).toFixed(2);
const fmtPct = (n) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%');
const fmtAge = (d) => {
  if (d === null || d === undefined) return '—';
  if (d < 90) return d + 'd';
  if (d < 365) return Math.round(d / 30) + 'mo';
  return (d / 365).toFixed(1) + 'y';
};
const fmtMult = (n) => '×' + Number(n).toFixed(3);
const isWatch = (slug) => R.watchlist.includes(slug);
const log10 = (n) => Math.log10(n);

/** The page's own recompute of a row's implied value, from the stored factors. */
function impliedOf(row) {
  return Math.round(row.curve_value * row.base_multiple * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier);
}

function stateFromHash() {
  const s = { tab: 'board', q: '', cat: '', chain: '', mech: '', verdict: '', tier: '', sort: 'implied' };
  for (const part of location.hash.slice(1).split('&')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined && k in s) s[k] = decodeURIComponent(v);
  }
  return s;
}
let S = stateFromHash();

function setHash() {
  const parts = [];
  for (const k of ['tab', 'q', 'cat', 'chain', 'mech', 'verdict', 'tier', 'sort']) {
    if (S[k] && S[k] !== 'board' && !(k === 'tab' && S[k] === 'board') && !(k === 'sort' && S[k] === 'implied')) parts.push(k + '=' + encodeURIComponent(S[k]));
    else if (k === 'tab' && S.tab !== 'board') parts.push('tab=' + S.tab);
  }
  history.replaceState(null, '', '#' + parts.join('&'));
}

function filteredRows() {
  const q = S.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.category || '').toLowerCase().includes(q) || r.mechanism.toLowerCase().includes(q))) return false;
    if (S.cat && (r.category || '') !== S.cat) return false;
    if (S.chain && !r.chains.includes(S.chain)) return false;
    if (S.mech && r.mechanism !== S.mech) return false;
    if (S.verdict && r.verdict !== S.verdict) return false;
    if (S.tier === 'watchlist' && !isWatch(r.slug)) return false;
    if (S.tier === 'early' && isWatch(r.slug)) return false;
    return true;
  });
  const key = S.sort;
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    slice: (a, b) => b.slice_usd - a.slice_usd,
    net: (a, b) => b.net_per_hour_usd - a.net_per_hour_usd,
    name: (a, b) => a.name.localeCompare(b.name),
  }[key] || ((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows = rows.slice().sort((a, b) => by(a, b) || a.slug.localeCompare(b.slug));
  return rows;
}

function options(list, cur, label) {
  return '<option value="">' + label + '</option>' + list.map((v) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
}

function headerHtml() {
  const f = R.fit, b = R.backtest;
  return '<div class="topbar"><b>TOKEN RADAR</b><span>model ' + esc(R.model_version) + ' · snapshot ' + esc(R.as_of) + '</span><span>DefiLlama protocols · ' + R.rows.length + ' ranked</span><span class="pill ok">Watchlist ' + R.watchlist_size + ' / ' + R.watchlist_size + ' covered</span><span class="pill">' + R.rows.length + ' / ' + R.rows.length + ' rows match board.json</span></div>'
    + '<section class="hero"><h1>' + R.rows.length + ' protocols record no token. <em>Here is what each launch would be worth, and how to farm it.</em></h1>'
    + '<p class="lede">Every implied value is read off the ' + f.n + ' tokens that already trade here: a size curve fitted on their market caps, a category factor, a week of momentum and time with no token. No name is hand-picked; one function in lib/model.ts prices every row, here and in board.json.</p></section>'
    + '<div class="facts">'
    + '<div class="fact"><div class="k">Pre-token ranked</div><div class="v">' + R.board_size + '</div><div class="s">' + R.early_size + ' beyond the watchlist floor</div></div>'
    + '<div class="fact"><div class="k">Audited</div><div class="v">' + R.pre_token_total + '</div><div class="s">' + R.set_aside_size + ' set aside by rule</div></div>'
    + '<div class="fact"><div class="k">Comparables</div><div class="v">' + f.n + '</div><div class="s">tokens that set the curve</div></div>'
    + '<div class="fact"><div class="k">Leave-one-out miss</div><div class="v">×' + b.median_miss + '</div><div class="s">flat multiple ×' + b.flat_median_miss + '</div></div>'
    + '<div class="fact"><div class="k">Total implied</div><div class="v">' + fmtUsd(R.total_implied_usd) + '</div><div class="s">across the ' + R.board_size + ' rows</div></div>'
    + '<div class="fact"><div class="k">Top implied value</div><div class="v">' + fmtUsd(R.rows[0].implied_value_usd) + '</div><div class="s">' + esc(R.rows[0].name) + '</div></div>'
    + '</div>'
    + '<div class="verdicts"><div class="vchip vfarm"><b>FARM ' + R.verdict_counts.FARM + '</b> — pay after fees and a 4% T-bill, on a $1,000 plan</div><div class="vchip vthin"><b>THIN ' + R.verdict_counts.THIN + '</b> — beat their fees only</div><div class="vchip vskip"><b>SKIP ' + R.verdict_counts.SKIP + '</b> — fees eat the drop</div></div>';
}

function scatterSvg() {
  const pts = R.comparables;
  const xs = pts.map((p) => log10(p.tvl_usd)), ys = pts.map((p) => log10(p.mcap_usd));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const W = 560, H = 300, L = 52, T = 12, B = 30, Rt = 14;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - Rt);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const f = R.fit;
  const line = (x) => f.intercept + f.slope * x;
  const lo = log10(R.band_low_mult), hi = log10(R.band_high_mult);
  const fmtTick = (v) => {
    const n = 10 ** v;
    if (n >= 1e9) return '$' + (n / 1e9) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6) + 'M';
    return '$' + (n / 1e3) + 'K';
  };
  let ticks = '';
  for (let v = x0; v <= x1; v++) ticks += '<text x="' + X(v) + '" y="' + (H - 8) + '" font-size="10" fill="#6d675c" text-anchor="middle">' + fmtTick(v) + '</text>';
  for (let v = y0; v <= y1; v++) ticks += '<text x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" font-size="10" fill="#6d675c" text-anchor="end">' + fmtTick(v) + '</text>';
  const dots = pts.map((p) => '<circle cx="' + X(log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(log10(p.mcap_usd)).toFixed(1) + '" r="2.6" fill="#0f7a4d" opacity="0.55"><title>' + esc(p.slug) + '</title></circle>').join('');
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for the comparables, with the fitted curve">'
    + '<polygon points="' + X(x0) + ',' + Y(line(x0) + hi) + ' ' + X(x1) + ',' + Y(line(x1) + hi) + ' ' + X(x1) + ',' + Y(line(x1) + lo) + ' ' + X(x0) + ',' + Y(line(x0) + lo) + '" fill="rgba(15,122,77,0.12)"/>'
    + '<line x1="' + X(x0) + '" y1="' + Y(line(x0)) + '" x2="' + X(x1) + '" y2="' + Y(line(x1)) + '" stroke="#0f7a4d" stroke-width="2"/>'
    + dots + ticks + '</svg>'
    + '<p class="legend">Dots: the ' + R.fit.n + ' comparables, market cap on record. Line: the fitted curve. Shade: the P25–P75 band (×' + R.band_low_mult + ' to ×' + R.band_high_mult + '). Half of the tokens that trade land inside it.</p>';
}

function modelHtml() {
  const f = R.fit, b = R.backtest;
  const cats = R.category_factors.filter((c) => c.live_count > 0);
  const rows = cats.map((c) => '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.live_count + '</td><td class="num">' + fmtMult(c.factor) + '</td><td>' + (c.shrunk ? 'shrunk toward ×1.00' : 'fitted') + '</td></tr>').join('');
  return '<section class="model"><h2>How a launch is priced</h2>'
    + '<div class="formula">value = 10^' + f.intercept + ' × TVL^' + f.slope + ' × category × momentum(7d) × seasoning(days with no token) × chains</div>'
    + '<p>The curve is fitted on this snapshot alone: log market cap on log TVL over the ' + f.n + ' live tokens that record a market cap and are not exchanges (R² ' + f.r_squared + '). A dollar of TVL is worth a different multiple at $5M than at $5B, so a flat multiple would overprice the giants and underprice the early ones. Category factors are median residuals against the curve, winsorised and shrunk toward ×1.00 with 4 pseudo-comparables.</p>'
    + '<div class="cols"><div><h3>Out of sample</h3><table><tr><th>Check</th><th>Curve</th><th>One flat multiple</th></tr>'
    + '<tr><td>Median miss, leave-one-out</td><td class="num">×' + b.median_miss + '</td><td class="num">×' + b.flat_median_miss + '</td></tr>'
    + '<tr><td>Within 3× of the true cap</td><td class="num">' + Math.round(b.within_3x * 100) + '%</td><td class="num">' + Math.round(b.flat_within_3x * 100) + '%</td></tr>'
    + '<tr><td>Band (P25–P75)</td><td class="num">×' + R.band_low_mult + ' – ×' + R.band_high_mult + '</td><td class="num">—</td></tr></table>'
    + '<p>Each token is left out once, the curve is refitted without it, and its cap is predicted. The curve misses by less than the flat multiple — and still misses by a lot. Read every implied value with its band.</p></div>'
    + '<div><h3>Category factors</h3><table><tr><th>Category</th><th>Live</th><th>Factor</th><th>Note</th></tr>' + rows + '</table></div></div>'
    + '<p><b>What this does not say.</b> The snapshot records no token for these protocols; it does not prove they have none, and it does not say whether or when a token is issued. A farm plan is a bet on a launch that may never come — the verdict only says whether the $1,000 ticket pays for itself if the launch lands at the implied value.</p>'
    + scatterSvg() + '</section>';
}

function modelStripHtml() {
  const f = R.fit, b = R.backtest;
  return '<section class="model"><h2>How a launch is priced</h2>'
    + '<div class="formula">value = 10^' + f.intercept + ' × TVL^' + f.slope + ' × category × momentum(7d) × seasoning(days with no token) × chains</div>'
    + '<p>Fitted on the ' + f.n + ' tokens that already trade (R² ' + f.r_squared + '). Leave-one-out median miss ×' + b.median_miss + ' against ×' + b.flat_median_miss + ' for one flat multiple; ' + Math.round(b.within_3x * 100) + '% land within 3×. Gas is priced on the cheapest chain each protocol lists, and the farm plan names it. Full calibration, category factors and the audit are under the Model tab.</p>'
    + scatterSvg() + '</section>';
}

function boardTableHtml(rows) {
  const maxV = Math.log10(R.rows[0].implied_value_usd), minV = Math.log10(R.rows[R.rows.length - 1].implied_value_usd);
  const pos = (v) => ((Math.log10(Math.max(1, v)) - minV) / Math.max(0.001, maxV - minV)) * 100;
  const body = rows.map((r) => {
    const badge = isWatch(r.slug) ? '<span class="badge b-watch">WATCHLIST</span>' : '<span class="badge b-early">EARLY</span>';
    const chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
    const w = pos(r.implied_value_usd);
    const lo = pos(r.band_low_usd), hi = pos(r.band_high_usd);
    return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>'
      + '<td class="proto"><b>' + esc(r.name) + '</b>' + badge + '<div class="sub">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</div></td>'
      + '<td class="num r">' + fmtUsd(r.tvl_usd) + '</td><td class="num r">' + chg + '</td><td class="num r">' + fmtAge(r.age_days) + '</td>'
      + '<td><span class="num">' + fmtUsd(r.implied_value_usd) + '</span><div class="bar" title="P25–P75 band ' + fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(r.band_high_usd) + '"><span class="band" style="left:' + lo.toFixed(1) + '%;width:' + Math.max(1, hi - lo).toFixed(1) + '%"></span><i style="width:' + w.toFixed(1) + '%"></i></div></td>'
      + '<td class="num r">' + fmt2(r.slice_usd) + '</td>'
      + '<td class="num r"><span class="v' + r.verdict + '">' + r.verdict + '</span><div class="sub">' + fmtSigned2(r.net_per_hour_usd) + '/h</div></td>'
      + '<td><span class="mech">' + esc(r.mechanism) + '</span><div class="sub">$1,000 ticket</div></td></tr>';
  }).join('');
  return '<table class="board"><thead><tr><th data-sort="implied">#</th><th data-sort="name">Protocol</th><th data-sort="tvl" class="r">TVL</th><th data-sort="change" class="r">7d</th><th data-sort="age" class="r">No token</th><th data-sort="implied">Implied value</th><th data-sort="slice" class="r">Slice / $1K</th><th data-sort="net" class="r">Net · verdict</th><th>Farm</th></tr></thead><tbody>' + body + '</tbody></table>';
}

function liveHtml() {
  const rows = R.live.map((r, i) => '<tr><td class="num">' + (i + 1) + '</td><td class="proto"><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + '</div></td><td class="num r">' + fmtUsd(r.tvl_usd) + '</td><td class="num r">' + fmtUsd(r.mcap_usd) + '</td><td class="num r">' + fmtMult(r.mcap_tvl) + '</td><td class="num r">' + fmtPct(r.change_7d) + '</td></tr>').join('');
  return '<p class="countline">' + R.live.length + ' protocols already trade. Their market caps are the curve’s raw material — 119 of them (all but the 9 exchanges) set it.</p>'
    + '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th class="r">TVL</th><th class="r">Market cap</th><th class="r">Mcap / TVL</th><th class="r">7d</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function asideHtml() {
  const rows = R.set_aside.map((r, i) => '<tr><td class="num">' + (i + 1) + '</td><td class="proto"><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.category || 'No category') + '</div></td><td class="num r">' + fmtUsd(r.tvl_usd) + '</td><td>' + esc(r.reason) + '</td></tr>').join('');
  return '<p class="countline">' + R.set_aside.length + ' pre-token protocols are set aside by the same rule that keeps the board honest: a wrapped, staked or bridged product of a token that already trades can never launch one of its own.</p>'
    + '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th class="r">TVL</th><th>Why it is set aside</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function tabsHtml() {
  const tabs = [['board', 'Pre-token board ' + R.board_size], ['live', 'Token already trades ' + R.live_size], ['aside', 'Set aside ' + R.set_aside_size], ['model', 'Model & calibration']];
  return '<div class="tabs" role="tablist">' + tabs.map(([k, label]) => '<button class="tab" role="tab" data-tab="' + k + '" aria-selected="' + (S.tab === k) + '">' + label + '</button>').join('') + '</div>';
}

function controlsHtml() {
  const cats = [...new Set(R.rows.map((r) => r.category || ''))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const mechs = [...new Set(R.rows.map((r) => r.mechanism))].sort();
  return '<div class="controls"><input type="search" id="q" placeholder="Search name, category, mechanism…" value="' + esc(S.q) + '" aria-label="Search protocols">'
    + '<select id="cat" aria-label="Category">' + options(cats, S.cat, 'All categories') + '</select>'
    + '<select id="chain" aria-label="Chain">' + options(chains, S.chain, 'All chains') + '</select>'
    + '<select id="mech" aria-label="Mechanism">' + options(mechs, S.mech, 'All mechanisms') + '</select>'
    + '<select id="verdict" aria-label="Verdict">' + options(['FARM', 'THIN', 'SKIP'], S.verdict, 'Any verdict') + '</select>'
    + '<select id="tier" aria-label="Tier">' + options(['watchlist', 'early'], S.tier, 'Watchlist + early') + '</select>'
    + '<select id="sort" aria-label="Sort"><option value="implied"' + (S.sort === 'implied' ? ' selected' : '') + '>Sort: implied value</option><option value="tvl"' + (S.sort === 'tvl' ? ' selected' : '') + '>Sort: TVL</option><option value="change"' + (S.sort === 'change' ? ' selected' : '') + '>Sort: 7-day change</option><option value="age"' + (S.sort === 'age' ? ' selected' : '') + '>Sort: time with no token</option><option value="slice"' + (S.sort === 'slice' ? ' selected' : '') + '>Sort: slice per $1K</option><option value="net"' + (S.sort === 'net' ? ' selected' : '') + '>Sort: net per hour</option><option value="name"' + (S.sort === 'name' ? ' selected' : '') + '>Sort: name</option></select></div>';
}

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const again = impliedOf(r);
  const match = again === r.implied_value_usd;
  const f = R.fit;
  const steps = r.farm_steps.map((s, i) => {
    const m = s.match(/ Cost: (.*)\. Time: (.*)\.$/);
    const text = m ? s.slice(0, m.index) : s;
    return '<li>' + esc(text) + (m ? '<span class="ct">Cost: ' + esc(m[1]) + ' · Time: ' + esc(m[2]) + '</span>' : '') + '</li>';
  }).join('');
  const why = (r.change_7d ?? 0) >= 0
    ? 'TVL is growing ' + fmtPct(r.change_7d) + ' this week, it has run ' + fmtAge(r.age_days) + ' with no token, and its category trades at ' + fmtMult(r.base_multiple) + ' of the curve.'
    : 'TVL is down ' + fmtPct(r.change_7d) + ' this week, but it has run ' + fmtAge(r.age_days) + ' with no token and its category trades at ' + fmtMult(r.base_multiple) + ' of the curve — the value is in the size, not the week.';
  dlg.innerHTML = '<div class="dlg"><button class="close" id="dlgClose">Close ✕</button>'
    + '<h2>' + esc(r.name) + '</h2><div class="sub">Rank ' + r.rank + ' · ' + esc(r.category || 'No category') + ' · ' + esc(r.mechanism) + ' · ' + esc(r.chains.join(', ')) + ' · ' + (isWatch(r.slug) ? 'on the watchlist' : 'early find') + '</div>'
    + '<div class="eq">curve   = 10^' + f.intercept + ' × ' + fmtUsd(r.tvl_usd) + '^' + f.slope + ' = ' + fmtUsd(r.curve_value) + '\n'
    + 'implied = curve × ' + r.base_multiple.toFixed(3) + ' (category) × ' + r.growth_multiplier.toFixed(3) + ' (momentum)\n'
    + '        × ' + r.maturity_multiplier.toFixed(3) + ' (seasoning) × ' + r.chain_multiplier.toFixed(3) + ' (chains)\n'
    + '        = ' + fmtUsd(r.implied_value_usd) + '  ·  band ' + fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(r.band_high_usd) + ' (P25–P75)</div>'
    + '<table><tr><th>Figure</th><th>Value</th></tr>'
    + '<tr><td>TVL</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td></tr>'
    + '<tr><td>7-day TVL change</td><td class="num">' + fmtPct(r.change_7d) + '</td></tr>'
    + '<tr><td>Time with no token</td><td class="num">' + fmtAge(r.age_days) + '</td></tr>'
    + '<tr><td>Slice per $1,000 staked</td><td class="num">' + fmt2(r.slice_usd) + ' if depositors get 10% pro rata</td></tr>'
    + '<tr><td>Fees on the $1,000 plan</td><td class="num">' + fmt2(r.fees_usd) + ' · forgone T-bill ' + fmt2(r.forgone_usd) + '</td></tr>'
    + '<tr><td>Net</td><td class="num">' + fmtSigned2(r.net_per_hour_usd) + ' per hour · <span class="v' + r.verdict + '">' + r.verdict + '</span></td></tr>'
    + '<tr><td>Recompute check</td><td class="num">' + (match ? 'matches board (' + fmtUsd(again) + ')' : 'differs from board: page ' + fmtUsd(again) + ', board ' + fmtUsd(r.implied_value_usd)) + '</td></tr></table>'
    + '<p class="why"><b>Why farm now:</b> ' + esc(why) + '</p>'
    + '<h3>Farm plan — $1,000 ticket</h3><ol>' + steps + '</ol>'
    + '<p class="note">This radar records no token for ' + esc(r.name) + '; it does not prove the protocol has none, and it does not predict whether or when a token is issued. The implied value is this entry’s claim, never make.fun’s.</p>'
    + '</div>';
  document.getElementById('dlgClose').addEventListener('click', () => dlg.close());
  if (!dlg.open) dlg.showModal();
}

function render() {
  let html = headerHtml();
  if (S.tab === 'board') {
    html += modelStripHtml() + tabsHtml() + controlsHtml();
    const rows = filteredRows();
    html += '<p class="countline">' + rows.length + ' of ' + R.rows.length + ' rows shown · bar: implied value on a log scale, shade: the P25–P75 band · slice: what $1,000 staked would hold if depositors got 10% · click a row for its full plan</p>';
    html += rows.length ? boardTableHtml(rows) : '<div class="empty">No protocols match these filters. <button id="clearBtn">Clear the filters</button></div>';
  } else if (S.tab === 'live') {
    html += tabsHtml() + liveHtml();
  } else if (S.tab === 'aside') {
    html += tabsHtml() + asideHtml();
  } else {
    html += tabsHtml() + modelHtml();
  }
  html += '<p class="note">Source: ' + esc(R.source) + ' · as_of ' + esc(R.as_of) + ' · floor $50,000,000 · ' + R.rows.length + ' rows · model ' + esc(R.model_version) + ' · every figure is computed from the snapshot at build time; nothing is fetched.</p>';
  app.innerHTML = html;
  wire();
}

function wire() {
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; setHash(); render(); }));
  const q = document.getElementById('q');
  if (q) q.addEventListener('input', () => { S.q = q.value; setHash(); render(); const nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
  for (const id of ['cat', 'chain', 'mech', 'verdict', 'tier', 'sort']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { S[id] = el.value; setHash(); render(); });
  }
  app.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => { S.sort = th.dataset.sort; setHash(); render(); }));
  app.querySelectorAll('tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
  const clear = document.getElementById('clearBtn');
  if (clear) clear.addEventListener('click', () => { S.q = ''; S.cat = ''; S.chain = ''; S.mech = ''; S.verdict = ''; S.tier = ''; setHash(); render(); });
}

render();
const pm = location.hash.match(/[#&]p=([^&]+)/);
if (pm) openDetail(decodeURIComponent(pm[1]));
