import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { intelligenceAPI } from '../../utils/api';

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

const RISK_CONFIG = {
  CRITICAL: { bg: 'bg-red-500/20',    border: 'border-red-500/50',    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',    dot: 'bg-red-500'    },
  HIGH:     { bg: 'bg-orange-500/20', border: 'border-orange-500/50', badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/40', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40', dot: 'bg-yellow-400' },
  LOW:      { bg: 'bg-green-500/20',  border: 'border-green-500/50',  badge: 'bg-green-500/20 text-green-400 border border-green-500/40',  dot: 'bg-green-500'  },
};

function getRiskConfig(label) {
  if (!label) return RISK_CONFIG.LOW;
  const key = label.toUpperCase();
  return RISK_CONFIG[key] || RISK_CONFIG.LOW;
}

function PinIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function HotspotCard({ hotspot }) {
  const label = hotspot.risk_label || (
    hotspot.predicted_risk >= 0.75 ? 'CRITICAL' :
    hotspot.predicted_risk >= 0.5  ? 'HIGH'     :
    hotspot.predicted_risk >= 0.25 ? 'MEDIUM'   : 'LOW'
  );
  const cfg = getRiskConfig(label);
  const riskPct = hotspot.predicted_risk != null
    ? Math.round(hotspot.predicted_risk * 100)
    : null;

  return (
    <div className={`rounded-xl border ${cfg.border} bg-gray-800 p-5 flex flex-col gap-3 hover:bg-gray-750 transition`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-gray-400 ${cfg.dot.replace('bg-', 'text-').replace('-500', '-400').replace('-400', '-400')}`}>
            <PinIcon />
          </span>
          <p className="text-white font-semibold text-sm truncate" title={hotspot.location}>
            {hotspot.location || 'Unknown location'}
          </p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${cfg.badge}`}>
          {label}
        </span>
      </div>

      <div className="space-y-2">
        {riskPct != null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Predicted risk</span>
              <span className="text-xs font-bold text-white">{riskPct}%</span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-2">
              <div
                className={`h-full rounded-full transition-all ${cfg.dot}`}
                style={{ width: `${riskPct}%` }}
              />
            </div>
          </div>
        )}

        {hotspot.historical_count != null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Historical incidents</span>
            <span className="text-xs font-semibold text-gray-300">{hotspot.historical_count}</span>
          </div>
        )}

        {hotspot.lat != null && hotspot.lng != null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Coordinates</span>
            <span className="text-xs text-gray-600 font-mono">
              {Number(hotspot.lat).toFixed(4)}, {Number(hotspot.lng).toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PredictedHotspotsPage() {
  const [days, setDays] = useState(30);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHotspots = useCallback(async (selectedDays) => {
    setLoading(true);
    setHotspots([]);
    try {
      const res = await intelligenceAPI.getPredictedHotspots(selectedDays);
      const data = Array.isArray(res.data) ? res.data : res.data?.hotspots || [];
      setHotspots(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to load hotspots.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHotspots(days);
  }, [days, fetchHotspots]);

  const criticalCount = hotspots.filter((h) => {
    const l = (h.risk_label || '').toUpperCase();
    return l === 'CRITICAL' || (!l && h.predicted_risk >= 0.75);
  }).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-9 h-9 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-center text-lg">
              🎯
            </span>
            Predicted Hotspots
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            AI-forecast of likely incident zones for the next {days} days
          </p>
        </div>

        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-xl p-1 flex-shrink-0">
          {DAYS_OPTIONS.map(({ label, value }) => (
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

      {hotspots.length > 0 && !loading && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2">
            <span className="text-sm text-gray-400">Total zones</span>
            <span className="text-sm font-bold text-white">{hotspots.length}</span>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm text-red-400 font-semibold">{criticalCount} Critical</span>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-12 flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-gray-400 text-sm">Generating AI predictions…</p>
        </div>
      )}

      {!loading && hotspots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hotspots.map((h, i) => (
            <HotspotCard key={h.location ? `${h.location}-${i}` : i} hotspot={h} />
          ))}
        </div>
      )}

      {!loading && hotspots.length === 0 && (
        <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-12 flex flex-col items-center gap-2">
          <span className="text-4xl">📍</span>
          <p className="text-gray-400 font-medium text-sm">No hotspot predictions available</p>
          <p className="text-gray-600 text-xs">More historical data is needed to generate predictions</p>
        </div>
      )}

      <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-5 py-4">
        <span className="text-yellow-400 flex-shrink-0 mt-0.5">⚠</span>
        <p className="text-xs text-gray-400 leading-relaxed">
          <strong className="text-yellow-400">Disclaimer:</strong> Predictions are AI-generated based on historical
          patterns. Use for planning purposes only. Do not rely solely on these forecasts for deployment decisions.
        </p>
      </div>
    </div>
  );
}
