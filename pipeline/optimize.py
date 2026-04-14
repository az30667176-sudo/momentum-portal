"""
optimize.py
Optuna-based backtest parameter optimization.
Fetches data from Supabase once, then runs N Optuna trials.
Results are saved back to the optimization_runs table.

Usage (called by GitHub Actions):
  python pipeline/optimize.py --run-id 123
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import optuna
import yfinance as yf
from supabase import create_client

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.backtest_py import BacktestConfig, SubFilter, run_backtest, PerfMetrics  # noqa: E402

# Silence Optuna's default logging (we write our own)
optuna.logging.set_verbosity(optuna.logging.WARNING)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger(__name__)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def make_client():
    url = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_SERVICE_KEY']
    return create_client(url, key)


def fetch_sub_history(supabase) -> list[dict]:
    """Fetch 3 years of daily_sub_returns using date-window queries (same as TS engine)."""
    log.info('Fetching sub history...')
    t0 = time.time()

    # Fetch gics_universe for sub_name lookup
    gics_resp = supabase.from_('gics_universe').select(
        'gics_code,sub_industry,sector'
    ).execute()
    gics_map: dict[str, str] = {
        row['gics_code']: row['sub_industry']
        for row in (gics_resp.data or [])
    }

    SELECT_SUB = ','.join([
        'date', 'gics_code', 'rank_today', 'stock_count',
        'ret_1d', 'ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'ret_12m', 'mom_6m',
        'mom_score', 'obv_trend', 'rvol', 'vol_mom', 'vol_surge_score',
        'sharpe_8w', 'sortino_8w', 'volatility_8w', 'calmar_ratio',
        'information_ratio', 'momentum_decay_rate',
        'downside_capture', 'leader_lagger_ratio', 'cmf',
        'beta', 'momentum_autocorr', 'price_trend_r2',
        'price_vs_ma5', 'price_vs_ma20', 'price_vs_ma100', 'price_vs_ma200',
        'breadth_20ma', 'breadth_50ma', 'high_proximity',
    ])

    today = date.today()
    try:
        start = date(today.year - 3, today.month, today.day)
    except ValueError:
        start = date(today.year - 3, today.month, 28)  # handle Feb 29 in non-leap year
    cursor = start
    windows: list[tuple[str, str]] = []
    while cursor < today:
        frm = cursor.isoformat()
        next_cursor = cursor + timedelta(days=91)  # ~3 months, avoids month-day overflow
        if next_cursor > today:
            next_cursor = today
        windows.append((frm, next_cursor.isoformat()))
        cursor = next_cursor

    def fetch_window(w: tuple[str, str]) -> list[dict]:
        frm, to = w
        resp = supabase.from_('daily_sub_returns') \
            .select(SELECT_SUB) \
            .gte('date', frm) \
            .lt('date', to) \
            .order('date', desc=False) \
            .order('gics_code', desc=False) \
            .range(0, 11999) \
            .execute()
        return resp.data or []

    all_rows: list[dict] = []
    PARALLEL = 3
    for i in range(0, len(windows), PARALLEL):
        batch = windows[i:i + PARALLEL]
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            futures = {ex.submit(fetch_window, w): w for w in batch}
            for fut in as_completed(futures):
                all_rows.extend(fut.result())

    sub_by_date: dict[str, list[dict]] = {}
    for row in all_rows:
        d = str(row['date'])[:10]
        sub = {k: v for k, v in row.items() if k not in ('date',)}
        sub['date'] = d
        sub['sub_name'] = gics_map.get(row['gics_code'], row['gics_code'])
        sub_by_date.setdefault(d, []).append(sub)

    sub_history = [
        {'date': d, 'subs': subs}
        for d, subs in sorted(sub_by_date.items())
    ]
    log.info(f'Sub history: {len(sub_history)} days ({time.time()-t0:.1f}s)')
    return sub_history


def fetch_stock_data(supabase, sub_history: list[dict]) -> dict[str, dict]:
    """
    Pre-fetch stock data for every-5th trading day (covers all rebalPeriod options: 5,10,20,40).
    Returns: date -> {ticker: row, gics_code: row}
    """
    log.info('Fetching stock data for every-5th rebal date...')
    t0 = time.time()

    # Every 5th day covers rebalPeriod in [5,10,20,40]
    rebal_dates = [sub_history[i]['date'] for i in range(0, len(sub_history), 5)]
    log.info(f'  {len(rebal_dates)} candidate dates')

    DATE_BATCH = 10
    PARALLEL = 3
    date_batches = [rebal_dates[i:i+DATE_BATCH] for i in range(0, len(rebal_dates), DATE_BATCH)]

    def fetch_batch(dates: list[str]) -> list[dict]:
        resp = supabase.from_('daily_stock_returns') \
            .select('date,ticker,gics_code,ret_1d,mom_score,rank_in_sub,rvol,obv_trend') \
            .in_('date', dates) \
            .order('date', desc=False) \
            .order('ticker', desc=False) \
            .range(0, 15999) \
            .execute()
        return resp.data or []

    all_stock_rows: list[dict] = []
    for i in range(0, len(date_batches), PARALLEL):
        round_batches = date_batches[i:i+PARALLEL]
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            futures = {ex.submit(fetch_batch, b): b for b in round_batches}
            for fut in as_completed(futures):
                all_stock_rows.extend(fut.result())

    stock_by_date: dict[str, dict] = {}
    for row in all_stock_rows:
        d = str(row['date'])[:10]
        if d not in stock_by_date:
            stock_by_date[d] = {}
        # Store by both ticker and gics_code (mirrors TS behavior)
        stock_by_date[d][row['ticker']] = row
        stock_by_date[d][row['gics_code']] = row

    log.info(f'Stock data: {len(stock_by_date)} dates, '
             f'{sum(len(v)//2 for v in stock_by_date.values())} avg rows/date '
             f'({time.time()-t0:.1f}s)')
    return stock_by_date


def fetch_spy_returns() -> dict[str, float]:
    """Fetch SPY daily returns via yfinance."""
    log.info('Fetching SPY data...')
    try:
        spy = yf.download('SPY', period='4y', interval='1d',
                          auto_adjust=True, progress=False)
        closes = spy['Close']
        spy_rets: dict[str, float] = {}
        for i in range(1, len(closes)):
            c0 = float(closes.iloc[i - 1])
            c1 = float(closes.iloc[i])
            if c0 > 0:
                d = closes.index[i].strftime('%Y-%m-%d')
                spy_rets[d] = round((c1 / c0 - 1) * 100, 4)
        log.info(f'SPY: {len(spy_rets)} days')
        return spy_rets
    except Exception as e:
        log.warning(f'SPY fetch failed: {e} — using EW fallback')
        return {}


# ── Scoring ───────────────────────────────────────────────────────────────────

def compute_score(result, objective: str) -> float:
    """
    Compute single objective score with overfitting penalty.
    Penalty: if IS score is much higher than OOS score → penalize.
    """
    oos = result.oosPerf
    is_ = result.isPerf

    # IS objectives: Optuna never touches OOS — purely maximise in-sample
    if objective == 'is_sharpe':
        if is_.annRet == 0 and is_.sharpe == 0:
            return -999.0
        return round(is_.sharpe, 4)
    elif objective == 'is_calmar':
        if is_.annRet == 0 and is_.calmar == 0:
            return -999.0
        return round(is_.calmar, 4)
    elif objective == 'is_pf':
        if is_.annRet == 0:
            return -999.0
        return round(is_.profitFactor, 4)

    # OOS objectives: maximise OOS with overfitting penalty
    if oos.annRet == 0 and oos.sharpe == 0:
        return -999.0

    if objective == 'oos_sharpe':
        base = oos.sharpe
        penalty = max(0.0, is_.sharpe - oos.sharpe - 0.5) * 2
    elif objective == 'oos_calmar':
        base = oos.calmar
        penalty = max(0.0, is_.calmar - oos.calmar - 0.5) * 2
    elif objective == 'oos_pf':
        base = oos.profitFactor
        penalty = max(0.0, is_.profitFactor - oos.profitFactor - 0.3) * 2
    else:
        base = oos.sharpe
        penalty = max(0.0, is_.sharpe - oos.sharpe - 0.5) * 2

    return round(base - penalty, 4)


# ── Optuna objective ──────────────────────────────────────────────────────────

def make_objective(
    fixed_config: dict,
    sub_history: list[dict],
    stock_by_date: dict[str, dict],
    spy_returns: dict[str, float],
    objective: str,
    param_ranges: dict,
):
    """
    indicator_candidates (optional, in param_ranges):
      List of dicts: [{indicator, op ('>=','<='), min, max}, ...]
      When provided, Optuna will also decide which indicators to activate
      as sub-filters and what threshold to use for each.
      When absent, fixed_config.subFilters is used unchanged.
    """
    indicator_candidates: list[dict] = param_ranges.get('indicator_candidates', [])
    search_filters = len(indicator_candidates) > 0

    def objective_fn(trial: optuna.Trial) -> float:
        pr = param_ranges

        # ── Numeric params (each with a meaningful step size) ────
        topN = trial.suggest_int(
            'topN', pr.get('topN_min', 1), pr.get('topN_max', 15), step=1
        )
        stocksPerSub = trial.suggest_int(
            'stocksPerSub', pr.get('stocksPerSub_min', 1), pr.get('stocksPerSub_max', 10), step=1
        )
        rebalPeriod = trial.suggest_categorical(
            'rebalPeriod', pr.get('rebalPeriod_options', [5, 10, 20, 40, 60])
        )
        maxStockWeight = trial.suggest_float(
            'maxStockWeight', pr.get('maxStockWeight_min', 3), pr.get('maxStockWeight_max', 100), step=1.0
        )
        maxSubWeight = trial.suggest_float(
            'maxSubWeight', pr.get('maxSubWeight_min', 5), pr.get('maxSubWeight_max', 100), step=5.0
        )
        bufferRule = trial.suggest_int(
            'bufferRule', pr.get('bufferRule_min', 0), pr.get('bufferRule_max', 5), step=1
        )
        stop_loss_pct = trial.suggest_float(
            'stop_loss_pct', pr.get('stopLoss_min', 0), pr.get('stopLoss_max', 30), step=0.5
        )
        trailing_stop = trial.suggest_float(
            'trailingStop', pr.get('trailingStop_min', 0), pr.get('trailingStop_max', 30), step=0.5
        )
        take_profit = trial.suggest_float(
            'takeProfit', pr.get('takeProfit_min', 0), pr.get('takeProfit_max', 80), step=1.0
        )

        # ── Categorical strategy params (optional search) ────────
        if 'rankBy_options' in pr:
            rank_by = trial.suggest_categorical('rankBy', pr['rankBy_options'])
            rank_dir = 'desc'  # all provided options are "higher = better"
        else:
            rank_by = fixed_config.get('rankBy', 'mom_score')
            rank_dir = fixed_config.get('rankDir', 'desc')

        if 'weightMode_options' in pr:
            weight_mode = trial.suggest_categorical('weightMode', pr['weightMode_options'])
        else:
            weight_mode = fixed_config.get('weightMode', 'equal')

        if 'tradingCost_min' in pr:
            trading_cost = trial.suggest_float(
                'tradingCost', float(pr['tradingCost_min']), float(pr['tradingCost_max'])
            )
        else:
            trading_cost = fixed_config.get('tradingCost', 0.1)

        if 'spyMaFilter_options' in pr:
            spy_ma_filter = trial.suggest_categorical('spyMaFilter', [True, False])
        else:
            spy_ma_filter = fixed_config.get('spyMaFilter', False)

        # ── Indicator / filter search ─────────────────────────────
        # All user-selected indicators are ALWAYS active.
        # Optuna only optimises the threshold value for each one.
        # (Previously each indicator had a yes/no activation switch, which
        # caused some trials to drop the user's chosen filters entirely.)
        active_filters: list[dict] = []
        filter_summary: dict[str, dict] = {}

        if search_filters:
            for cand in indicator_candidates:
                ind = cand['indicator']
                min_val = float(cand.get('min', 0))
                max_val = float(cand.get('max', 100))
                op = cand.get('op', '>=')

                # Skip degenerate ranges
                if min_val >= max_val:
                    continue

                # Step size: finer for ratios/scores, coarser for percentages
                span = max_val - min_val
                if span <= 2:
                    step = round(span / 20, 4)   # e.g. 0–1 range → step 0.05
                elif span <= 10:
                    step = round(span / 20, 3)   # e.g. 0–5 → step 0.25
                else:
                    step = round(span / 20, 2)   # e.g. 0–100 → step 5

                threshold = trial.suggest_float(f'threshold_{ind}', min_val, max_val, step=step)
                active_filters.append({
                    'id': f'opt_{ind}',
                    'type': 'static',
                    'op': op,
                    'indicator': ind,
                    'value': threshold,
                })
                filter_summary[ind] = {'threshold': round(threshold, 4), 'op': op}

            trial.set_user_attr('filter_summary', json.dumps(filter_summary))
            sub_filters_to_use = active_filters
        else:
            # Use fixed filters from user's strategy settings
            sub_filters_to_use = fixed_config.get('subFilters', [])

        config = BacktestConfig.from_dict({
            **fixed_config,
            'subFilters': sub_filters_to_use,
            'topN': topN,
            'stocksPerSub': stocksPerSub,
            'rebalPeriod': rebalPeriod,
            'maxStockWeight': maxStockWeight,
            'maxSubWeight': maxSubWeight,
            'bufferRule': bufferRule,
            'stopLoss': -stop_loss_pct if stop_loss_pct > 0 else 0,
            'trailingStop': trailing_stop,
            'takeProfit': take_profit,
            'rankBy': rank_by,
            'rankDir': rank_dir,
            'weightMode': weight_mode,
            'tradingCost': trading_cost,
            'spyMaFilter': spy_ma_filter,
        })

        result = run_backtest(config, sub_history, stock_by_date, spy_returns)
        score = compute_score(result, objective)

        # Store metrics as user attributes
        trial.set_user_attr('is_sharpe', result.isPerf.sharpe)
        trial.set_user_attr('oos_sharpe', result.oosPerf.sharpe)
        trial.set_user_attr('is_calmar', result.isPerf.calmar)
        trial.set_user_attr('oos_calmar', result.oosPerf.calmar)
        trial.set_user_attr('is_pf', result.isPerf.profitFactor)
        trial.set_user_attr('oos_pf', result.oosPerf.profitFactor)
        trial.set_user_attr('oos_annret', result.oosPerf.annRet)
        trial.set_user_attr('oos_mdd', result.oosPerf.mdd)

        return score

    return objective_fn


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-id', type=int, required=True, help='optimization_runs PK')
    args = parser.parse_args()

    supabase = make_client()

    # Load the run config from Supabase
    log.info(f'Loading run config for id={args.run_id}...')
    run_resp = supabase.from_('optimization_runs') \
        .select('*') \
        .eq('id', args.run_id) \
        .single() \
        .execute()
    run = run_resp.data
    if not run:
        log.error(f'Run {args.run_id} not found in optimization_runs')
        sys.exit(1)

    n_trials: int = run.get('n_trials', 100)
    objective: str = run.get('objective', 'oos_sharpe')
    fixed_config: dict = run.get('fixed_config', {})
    param_ranges: dict = run.get('param_ranges', {})

    # Mark as running
    running_resp = supabase.from_('optimization_runs') \
        .update({'status': 'running'}) \
        .eq('id', args.run_id) \
        .execute()
    log.info(f'Marked as running: {running_resp}')

    try:
        # Fetch data (one-time cost, shared across all trials)
        sub_history = fetch_sub_history(supabase)
        stock_by_date = fetch_stock_data(supabase, sub_history)
        spy_returns = fetch_spy_returns()

        log.info(f'Starting Optuna study: {n_trials} trials, objective={objective}')
        study = optuna.create_study(direction='maximize')
        obj_fn = make_objective(
            fixed_config, sub_history, stock_by_date, spy_returns,
            objective, param_ranges,
        )

        t0 = time.time()
        for i in range(n_trials):
            study.optimize(obj_fn, n_trials=1, n_jobs=1)
            trial = study.trials[-1]
            elapsed = time.time() - t0
            log.info(
                f'Trial {i+1:3d}/{n_trials}  score={trial.value:.4f}  '
                f'best={study.best_value:.4f}  elapsed={elapsed:.0f}s'
            )

        # Build results
        all_trials = []
        for t in study.trials:
            if t.value is None:
                continue
            filter_summary_raw = t.user_attrs.get('filter_summary', '{}')
            try:
                filter_summary = json.loads(filter_summary_raw) if isinstance(filter_summary_raw, str) else filter_summary_raw
            except Exception:
                filter_summary = {}
            all_trials.append({
                'trial': t.number,
                'score': round(t.value, 4),
                'params': t.params,
                'filter_summary': filter_summary,
                'is_sharpe': t.user_attrs.get('is_sharpe'),
                'oos_sharpe': t.user_attrs.get('oos_sharpe'),
                'is_calmar': t.user_attrs.get('is_calmar'),
                'oos_calmar': t.user_attrs.get('oos_calmar'),
                'is_pf': t.user_attrs.get('is_pf'),
                'oos_pf': t.user_attrs.get('oos_pf'),
                'oos_annret': t.user_attrs.get('oos_annret'),
                'oos_mdd': t.user_attrs.get('oos_mdd'),
            })
        all_trials.sort(key=lambda x: x['score'], reverse=True)

        best_trial = study.best_trial
        best_params = best_trial.params.copy()
        # Restore stopLoss sign convention
        if best_params.get('stop_loss_pct', 0) > 0:
            best_params['stopLoss'] = -best_params.pop('stop_loss_pct')
        else:
            best_params['stopLoss'] = 0
            best_params.pop('stop_loss_pct', None)

        update_resp = supabase.from_('optimization_runs').update({
            'status': 'completed',
            'best_score': study.best_value,
            'best_params': best_params,
            'all_trials': all_trials,
        }).eq('id', args.run_id).execute()
        log.info(f'DB update response: {update_resp}')

        log.info(f'Optimization complete. Best score: {study.best_value:.4f}')
        log.info(f'Best params: {json.dumps(best_params, indent=2)}')

    except Exception as e:
        log.exception(f'Optimization failed: {e}')
        supabase.from_('optimization_runs').update({
            'status': 'failed',
            'error_message': str(e),
        }).eq('id', args.run_id).execute()
        sys.exit(1)


if __name__ == '__main__':
    main()
