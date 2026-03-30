"""
backtest_py.py
Python port of frontend/lib/backtestEngine.ts
Used by optimize.py for Optuna parameter search.
Replicates the same logic as the TypeScript engine for consistent results.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Any


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class SubFilter:
    id: str
    type: str           # static | crossover | delta | rank_break
    indicator: str
    op: str = ''        # >= | <= | between | rise | fall
    direction: str = '' # neg_to_pos | pos_to_neg
    mode: str = ''      # top_pct | improve
    value: float = 0.0
    value2: float | None = None

    @staticmethod
    def from_dict(d: dict) -> 'SubFilter':
        return SubFilter(
            id=d.get('id', ''),
            type=d.get('type', 'static'),
            indicator=d.get('indicator', ''),
            op=d.get('op', ''),
            direction=d.get('direction', ''),
            mode=d.get('mode', ''),
            value=float(d.get('value', 0)),
            value2=float(d['value2']) if d.get('value2') is not None else None,
        )


@dataclass
class BacktestConfig:
    subFilters: list[SubFilter]
    exitFilters: list[SubFilter]
    rankBy: str
    rankDir: str            # desc | asc
    topN: int
    stockRankBy: str
    stocksPerSub: int
    rebalPeriod: int        # trading days
    weightMode: str         # equal | momentum | volatility
    maxStockWeight: float   # percent (e.g. 10 = 10%)
    maxSubWeight: float     # percent (e.g. 30 = 30%)
    bufferRule: int
    stopLoss: float         # negative to activate (e.g. -8 = stop at -8%)
    trailingStop: float     # positive to activate (e.g. 10 = trail by 10%)
    takeProfit: float       # positive to activate (e.g. 25 = TP at +25%)
    timeStop: int           # weeks (0 = disabled)
    tradingCost: float      # percent per trade (e.g. 0.1)
    isSplitPct: int         # 0-100
    spyMaFilter: bool
    spyMaPeriod: int

    @staticmethod
    def from_dict(d: dict) -> 'BacktestConfig':
        return BacktestConfig(
            subFilters=[SubFilter.from_dict(f) for f in d.get('subFilters', [])],
            exitFilters=[SubFilter.from_dict(f) for f in d.get('exitFilters', [])],
            rankBy=d.get('rankBy', 'mom_score'),
            rankDir=d.get('rankDir', 'desc'),
            topN=int(d.get('topN', 5)),
            stockRankBy=d.get('stockRankBy', 'mom_score'),
            stocksPerSub=int(d.get('stocksPerSub', 3)),
            rebalPeriod=int(d.get('rebalPeriod', 20)),
            weightMode=d.get('weightMode', 'equal'),
            maxStockWeight=float(d.get('maxStockWeight', 10)),
            maxSubWeight=float(d.get('maxSubWeight', 30)),
            bufferRule=int(d.get('bufferRule', 1)),
            stopLoss=float(d.get('stopLoss', 0)),
            trailingStop=float(d.get('trailingStop', 0)),
            takeProfit=float(d.get('takeProfit', 0)),
            timeStop=int(d.get('timeStop', 0)),
            tradingCost=float(d.get('tradingCost', 0.1)),
            isSplitPct=int(d.get('isSplitPct', 70)),
            spyMaFilter=bool(d.get('spyMaFilter', False)),
            spyMaPeriod=int(d.get('spyMaPeriod', 200)),
        )


@dataclass
class PerfMetrics:
    annRet: float = 0.0
    sharpe: float = 0.0
    sortino: float = 0.0
    mdd: float = 0.0
    wr: float = 0.0
    calmar: float = 0.0
    profitFactor: float = 0.0

    def to_dict(self) -> dict:
        return {
            'annRet': self.annRet,
            'sharpe': self.sharpe,
            'sortino': self.sortino,
            'mdd': self.mdd,
            'wr': self.wr,
            'calmar': self.calmar,
            'profitFactor': self.profitFactor,
        }


@dataclass
class BacktestResult:
    fullPerf: PerfMetrics
    isPerf: PerfMetrics
    oosPerf: PerfMetrics
    equityCurve: list[float]
    dailyReturns: list[float]
    isSplitDay: int


# ── Filter evaluation ─────────────────────────────────────────────────────────

def check_filter(f: SubFilter, curr: dict, prev: dict | None) -> bool:
    curr_val = curr.get(f.indicator)
    if curr_val is None:
        return False

    if f.type == 'static':
        if f.op == '>=':
            return curr_val >= f.value
        if f.op == '<=':
            return curr_val <= f.value
        if f.op == 'between':
            return f.value <= curr_val <= (f.value2 if f.value2 is not None else math.inf)

    prev_val = prev.get(f.indicator) if prev else None

    if f.type == 'crossover':
        if prev_val is None:
            return False
        if f.direction == 'neg_to_pos':
            return prev_val < 0 and curr_val > 0
        if f.direction == 'pos_to_neg':
            return prev_val > 0 and curr_val < 0

    if f.type == 'delta':
        if prev_val is None:
            return False
        delta = curr_val - prev_val
        if f.op == 'rise':
            return delta >= f.value
        if f.op == 'fall':
            return delta <= -f.value

    if f.type == 'rank_break':
        curr_rank = curr.get('rank_today')
        if curr_rank is None:
            return False
        if f.mode == 'top_pct':
            return curr_rank <= round(145 * f.value / 100)
        if f.mode == 'improve':
            prev_rank = prev.get('rank_today') if prev else None
            return prev_rank is not None and (prev_rank - curr_rank) >= f.value

    return False


# ── Weight calculation ────────────────────────────────────────────────────────

def apply_two_caps(
    weights: list[float],
    gics_codes: list[str],
    max_stock_pct: float,
    max_sub_pct: float,
) -> list[float]:
    max_stock = max_stock_pct / 100
    max_sub = max_sub_pct / 100

    w = [min(v, max_stock) for v in weights]

    sub_groups: dict[str, list[int]] = {}
    for i, code in enumerate(gics_codes):
        sub_groups.setdefault(code, []).append(i)

    for indices in sub_groups.values():
        sub_total = sum(w[i] for i in indices)
        if sub_total > max_sub:
            scale = max_sub / sub_total
            for i in indices:
                w[i] *= scale

    total = sum(w)
    return [v / total for v in w] if total > 0 else w


def calc_weights(
    tickers: list[str],
    gics_codes: list[str],
    subs_by_code: dict[str, dict],
    stock_map: dict[str, dict],
    mode: str,
    max_stock: float,
    max_sub: float,
) -> list[float]:
    n = len(tickers)
    if n == 0:
        return []

    if mode == 'momentum':
        scores = [max(stock_map.get(t, {}).get('mom_score') or 50, 0.001) for t in tickers]
        total = sum(scores)
        raw = [s / total for s in scores]
    elif mode == 'volatility':
        vols = []
        for i, t in enumerate(tickers):
            code = gics_codes[i]
            sub = subs_by_code.get(code, {})
            vols.append(max(sub.get('volatility_8w') or 15, 0.001))
        inv_vols = [1 / v for v in vols]
        total = sum(inv_vols)
        raw = [iv / total for iv in inv_vols]
    else:
        raw = [1 / n] * n

    return apply_two_caps(raw, gics_codes, max_stock, max_sub)


# ── Performance metrics ───────────────────────────────────────────────────────

def calc_perf(daily_rets: list[float], eq: list[float], start: int, end: int) -> PerfMetrics:
    r = daily_rets[start:end]
    e = eq[start:end]
    n = len(r)

    if n < 2:
        return PerfMetrics()

    mn = sum(r) / n
    variance = sum((x - mn) ** 2 for x in r) / n
    std = math.sqrt(variance) if variance > 0 else 0.001
    neg_r = [x for x in r if x < 0]
    ds = math.sqrt(sum(x * x for x in neg_r) / len(neg_r)) if neg_r else std

    ann_ret = (math.pow(e[-1] / e[0], 252 / n) - 1) * 100 if e[0] > 0 else 0.0
    sharpe = (mn / std) * math.sqrt(252) if std > 0 else 0.0
    sortino = (mn / ds) * math.sqrt(252) if ds > 0 else 0.0

    pk = e[0]
    mdd = 0.0
    for v in e:
        if v > pk:
            pk = v
        if pk > 0:
            d = (pk - v) / pk * 100
            if d > mdd:
                mdd = d

    wr = len([x for x in r if x > 0]) / n * 100
    calmar = round(ann_ret / mdd, 2) if mdd > 0 else 0.0

    gross_profit = sum(x for x in r if x > 0)
    gross_loss = abs(sum(x for x in r if x < 0))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 0.0

    return PerfMetrics(
        annRet=round(ann_ret, 2),
        sharpe=round(sharpe, 2),
        sortino=round(sortino, 2),
        mdd=round(mdd, 2),
        wr=round(wr, 0),
        calmar=calmar,
        profitFactor=profit_factor,
    )


# ── Main backtest engine ──────────────────────────────────────────────────────

def run_backtest(
    config: BacktestConfig,
    sub_history: list[dict],           # [{'date': str, 'subs': [sub_dict, ...]}]
    stock_by_date: dict[str, dict],    # date -> {ticker: stock_dict, gics_code: stock_dict}
    spy_returns: dict[str, float],     # date -> daily return (%)
) -> BacktestResult:
    """
    Pure in-memory backtest engine.
    sub_history: sorted by date ascending.
    stock_by_date: pre-built from fetched stock data; each date maps ticker→row AND gics_code→row.
    spy_returns: date string → daily return %.
    """
    N = len(sub_history)
    is_split_day = int(N * config.isSplitPct / 100)

    equity_curve: list[float] = [1.0]
    daily_returns: list[float] = []
    spy_curve: list[float] = [1.0]

    holdings: list[dict] = []       # active positions
    pending_orders: list[dict] = [] # to be entered next day
    equity = 1.0
    spy_equity = 1.0
    next_rebal_day = 0
    peak_equity = 1.0
    last_known_stock_map: dict[str, dict] = {}

    for day in range(N):
        snap = sub_history[day]
        date = snap['date']
        subs: list[dict] = snap['subs']
        subs_by_code = {s['gics_code']: s for s in subs}

        prev_snap = sub_history[day - config.rebalPeriod] if day >= config.rebalPeriod else None
        prev_day_snap = sub_history[day - 1] if day > 0 else None
        prev_day_subs_by_code = (
            {s['gics_code']: s for s in prev_day_snap['subs']} if prev_day_snap else {}
        )

        # SPY benchmark
        all_rets = [s.get('ret_1d') or 0.0 for s in subs]
        ew_ret = sum(all_rets) / len(all_rets) if all_rets else 0.0
        spy_ret = spy_returns.get(date, ew_ret)
        spy_equity *= (1 + spy_ret / 100)
        spy_curve.append(spy_equity)

        # Execute pending orders from yesterday's rebalance
        if pending_orders:
            holdings = [
                {
                    'ticker': o['ticker'],
                    'gics_code': o['gics_code'],
                    'sub_name': o['sub_name'],
                    'entry_day': day,
                    'entry_date': date,
                    'peak_cum_return': 0.0,
                    'cum_return': 0.0,
                    'exit_index': 100.0,
                    'weight': o['weight'],
                }
                for o in pending_orders
            ]
            pending_orders = []

        # Daily P&L + intraday stop checks
        port_ret = 0.0
        day_stock_map = stock_by_date.get(date, {})
        updated_holdings: list[dict] = []

        for h in holdings:
            sub = subs_by_code.get(h['gics_code'])
            stock = day_stock_map.get(h['ticker'])
            if stock and stock.get('ret_1d') is not None:
                daily_ret = stock['ret_1d'] / 100
            else:
                daily_ret = (sub.get('ret_1d') or 0.0) / 100 if sub else 0.0

            h['cum_return'] = (1 + h['cum_return'] / 100) * (1 + daily_ret) * 100 - 100
            h['peak_cum_return'] = max(h['peak_cum_return'], h['cum_return'])
            h['exit_index'] = h['exit_index'] * (1 + daily_ret)

            should_exit = False
            if config.stopLoss < 0 and h['cum_return'] <= config.stopLoss:
                should_exit = True
            elif config.trailingStop > 0 and (h['peak_cum_return'] - h['cum_return']) >= config.trailingStop:
                should_exit = True
            elif config.takeProfit > 0 and h['cum_return'] >= config.takeProfit:
                should_exit = True
            elif config.timeStop > 0 and (day - h['entry_day']) >= config.timeStop * 5:
                should_exit = True
            elif config.exitFilters and sub:
                prev_sub = prev_day_subs_by_code.get(h['gics_code'])
                if all(check_filter(f, sub, prev_sub) for f in config.exitFilters):
                    should_exit = True

            port_ret += h['weight'] * daily_ret

            if should_exit:
                port_ret -= h['weight'] * config.tradingCost / 100
            else:
                updated_holdings.append(h)

        holdings = updated_holdings
        equity *= (1 + port_ret)
        if equity > peak_equity:
            peak_equity = equity

        equity_curve.append(equity)
        daily_returns.append(port_ret * 100)

        # Rebalance
        if day >= next_rebal_day:
            next_rebal_day = day + config.rebalPeriod

            prev_snap_subs_by_code = (
                {s['gics_code']: s for s in prev_snap['subs']} if prev_snap else {}
            )

            # Filter subs
            passed_subs: list[dict] = []
            for sub in subs:
                prev_sub = prev_snap_subs_by_code.get(sub['gics_code'])
                if not config.subFilters or all(
                    check_filter(f, sub, prev_sub) for f in config.subFilters
                ):
                    passed_subs.append(sub)

            # Rank
            def rank_key(s: dict) -> float:
                v = s.get(config.rankBy)
                return float(v) if v is not None else -999.0

            passed_subs.sort(key=rank_key, reverse=(config.rankDir == 'desc'))
            selected_subs = passed_subs[:config.topN]

            # Update last known stock map
            if day_stock_map:
                last_known_stock_map = day_stock_map
            effective_stock_map = day_stock_map if day_stock_map else last_known_stock_map

            # Select stocks for each sub
            new_tickers: list[dict] = []
            for sub in selected_subs:
                sub_name = sub.get('sub_name', sub['gics_code'])
                if effective_stock_map:
                    # Only ticker-keyed entries (skip gics_code-keyed ones)
                    sub_stocks = [
                        v for k, v in effective_stock_map.items()
                        if v.get('gics_code') == sub['gics_code']
                        and k != v.get('gics_code')
                    ]
                    sub_stocks.sort(
                        key=lambda s: float(s.get(config.stockRankBy) or -999),
                        reverse=True
                    )
                    for st in sub_stocks[:config.stocksPerSub]:
                        new_tickers.append({
                            'ticker': st['ticker'],
                            'gics_code': sub['gics_code'],
                            'sub_name': sub_name,
                        })
                else:
                    new_tickers.append({
                        'ticker': sub['gics_code'],
                        'gics_code': sub['gics_code'],
                        'sub_name': sub_name,
                    })

            # Trading cost for turnover
            new_set = {t['ticker'] for t in new_tickers}
            old_set = {h['ticker'] for h in holdings}
            turnovers = len(new_set - old_set) + len(old_set - new_set)
            total_positions = len(new_tickers) + len(holdings)
            if total_positions > 0 and turnovers > 0:
                equity *= (1 - (turnovers / total_positions) * config.tradingCost / 100)

            # SPY MA regime filter
            spy_in_regime = True
            if config.spyMaFilter:
                period = max(2, config.spyMaPeriod)
                window = spy_curve[max(0, len(spy_curve) - period):]
                if len(window) >= min(period, 20):
                    ma = sum(window) / len(window)
                    spy_in_regime = spy_equity >= ma

            # Clear holdings; set up pending orders
            holdings = []
            if new_tickers and spy_in_regime:
                ticker_ids = [t['ticker'] for t in new_tickers]
                ticker_gics = [t['gics_code'] for t in new_tickers]
                weights = calc_weights(
                    ticker_ids, ticker_gics, subs_by_code,
                    effective_stock_map, config.weightMode,
                    config.maxStockWeight, config.maxSubWeight,
                )
                pending_orders = [
                    {**t, 'weight': weights[i] if i < len(weights) else 1 / len(new_tickers)}
                    for i, t in enumerate(new_tickers)
                ]

    full_perf = calc_perf(daily_returns, equity_curve, 0, len(daily_returns))
    is_perf = calc_perf(daily_returns, equity_curve, 0, is_split_day)
    oos_perf = calc_perf(daily_returns, equity_curve, is_split_day, len(daily_returns))

    return BacktestResult(
        fullPerf=full_perf,
        isPerf=is_perf,
        oosPerf=oos_perf,
        equityCurve=equity_curve,
        dailyReturns=daily_returns,
        isSplitDay=is_split_day,
    )
