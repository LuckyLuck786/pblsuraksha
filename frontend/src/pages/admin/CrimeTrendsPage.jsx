import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { intelligenceAPI } from '../../utils/api';

const PERIOD_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

function TrendBadge({ direction, percentage }) {
  const cfg = {
    UP:     { color: 'bg-red-500/20 text-red-400 border-red-500/40',    arrow: '↑' },
    DOWN:   { color: 'bg-green-500/20 text-green-400 border-green-500/40', arrow: '↓' },
    STABLE: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', arrow: '→' },
  }[direction] || { color: 'bg-gray-700 text-gray-400 border-gray-600', arrow: '~' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${cfg.color}`}>
      <span>{cfg.arrow}</span>
      {direction}
      {percentage != null && <span className="font-normal text-xs opacity-80">({percentage}%)</span>}
    </span>
  );
}

function Sparkline({ dailyCounts }) {
  if (!dailyCounts || dailyCounts.length === 0) return null;
  const last7 = dailyCounts.slice(-7);
  const max = Math.max(...last7.map((d) => d.count || 0), 1);

  return (
    <div className="flex items-end gap-1.5 h-12">
      {last7.map((d, i) => {
        const pct = Math.round(((d.count || 0) / max) * 100);
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-full rounded-t bg-indigo-500/60 hover:bg-indigo-400/80 transition"
              style={{ height: `${Math.max(pct, 4)}%`, minHeight: '3px' }}
              title={`${d.date}: ${d.count}`}
            />
            <span className="text-gray-600 text-xs leading-none">{d.date?.slice(-2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBar({ name, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-300 capitalize w-28 flex-shrink-0 truncate" title={name}>
        {name.replace(/_/g, ' ')}
      </span>
      <div className="flex-1 bg-gray-700/40 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-8 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

export default function CrimeTrendsPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchTrends = useCallback(async (selectedDays) => {
    setLoading(true);
    setData(null);
    try {
      const res = await intelligenceAPI.getCrimeTrends(selectedDays);
      setData(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to load trends.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrends(days);
  }, [days, fetchTrends]);

  // category_totals comes as [{category, count}, ...] from backend
  const categoryEntries = data?.category_totals
    ? (Array.isArray(data.category_totals)
        ? [...data.category_totals].sort((a, b) => b.count - a.count).map(item => [item.category, item.count])
        : Object.entries(data.category_totals).sort((a, b) => b[1] - a[1]))
    : [];
  const maxCount = categoryEntries.length > 0 ? categoryEntries[0][1] : 1;

  // daily_counts has one row per (date, category) — aggregate to one row per date for sparkline
  const dailyAggregated = React.useMemo(() => {
    if (!data?.daily_counts) return [];
    const byDate = {};
    data.daily_counts.forEach(({ date, count }) => {
      byDate[date] = (byDate[date] || 0) + (count || 0);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [data]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-9 h-9 bg-purple-500/20 border border-purple-500/30 rounded-xl flex items-center justify-center text-lg">
              📈
            </span>
            Crime Trends
          </h1>
          <p className="text-gray-400 text-sm mt-1">AI-powered trend analysis across reported incidents</p>
        </div>

        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-xl p-1 flex-shrink-0">
          {PERIOD_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setDays(value)}
              disabled={loading}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${
                days === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-12 flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-gray-400 text-sm">Loading {days}-day trend data…</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {(data.llm_insight || data.llm_recommendation) && (
            <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <span className="text-sm font-bold text-indigo-300">AI Insight</span>
              </div>
              {data.llm_insight && (
                <blockquote className="border-l-2 border-indigo-500 pl-4 text-gray-200 text-sm leading-relaxed italic">
                  {data.llm_insight}
                </blockquote>
              )}
              {data.llm_recommendation && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-purple-300 mb-1">Recommendation</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{data.llm_recommendation}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Trend Direction</p>
              <TrendBadge
                direction={data.trend_direction || 'STABLE'}
                percentage={data.trend_pct}
              />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Period</p>
              <p className="text-2xl font-black text-white">{data.period_days ?? days}d</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Incidents</p>
              <p className="text-2xl font-black text-white">
                {categoryEntries.reduce((s, [, c]) => s + c, 0)}
              </p>
            </div>
          </div>

          {categoryEntries.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white">Incidents by Category</h2>
              <div className="space-y-3">
                {categoryEntries.map(([name, count]) => (
                  <CategoryBar key={name} name={name} count={count} max={maxCount} />
                ))}
              </div>
            </div>
          )}

          {dailyAggregated.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white">Daily Incident Volume (last 7 days)</h2>
              <Sparkline dailyCounts={dailyAggregated} />
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-12 flex flex-col items-center gap-2">
          <span className="text-4xl">📊</span>
          <p className="text-gray-500 text-sm">No trend data available</p>
        </div>
      )}
    </div>
  );
}
