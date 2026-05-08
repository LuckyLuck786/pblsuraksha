import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { intelligenceAPI, complaintsAPI, authAPI } from '../../utils/api';

const PRIORITY_DOT = { critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-green-400' };
const PRIORITY_RING = { critical: 'ring-red-500/40', high: 'ring-orange-400/40', medium: 'ring-yellow-400/40', low: 'ring-green-400/40' };
const STATUS_BADGE = {
  pending: 'bg-gray-700 text-gray-300',
  acknowledged: 'bg-blue-900/60 text-blue-300',
  in_progress: 'bg-indigo-900/60 text-indigo-300',
  resolved: 'bg-green-900/60 text-green-300',
  rejected: 'bg-red-900/60 text-red-300',
};

const AUTO_REFRESH_SECS = 30;

const StatCard = ({ label, value, color, icon, sub }) => (
  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700/60 hover:border-gray-600 transition-colors group">
    <div className="flex justify-between items-start mb-3">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
    </div>
    <p className={`text-3xl font-extrabold ${color} leading-none`}>{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
  </div>
);

const LiveDot = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
  </span>
);

const AdminDashboardPage = () => {
  const [insights, setInsights] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentComplaints, setRecentComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECS);
  const [refreshing, setRefreshing] = useState(false);
  const countdownRef = useRef(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [insightsRes, statsRes, complaintsRes] = await Promise.all([
        intelligenceAPI.getInsights(),
        authAPI.getDashboardStats(),
        complaintsAPI.getAll({ ordering: '-created_at' }),
      ]);
      setInsights(insightsRes.data);
      setStats(statsRes.data);
      const data = complaintsRes.data.results ?? complaintsRes.data;
      setRecentComplaints(Array.isArray(data) ? data.slice(0, 8) : []);
      setLastRefresh(new Date());
      setCountdown(AUTO_REFRESH_SECS);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchData(true); return AUTO_REFRESH_SECS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [fetchData]);

  if (loading) return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 skeleton w-64 rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
      </div>
      <div className="h-64 skeleton rounded-xl" />
    </div>
  );

  const totalComplaints = stats?.total_complaints ?? insights?.total_analyzed ?? 0;
  const pendingCount = stats?.pending ?? 0;
  const criticalCount = stats?.critical_priority ?? insights?.pending_critical ?? 0;
  const resolutionRate = insights?.resolution_rate ?? 0;

  return (
    <div className="max-w-7xl mx-auto p-5 space-y-5 fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LiveDot />
            <span className="text-xs text-gray-500 font-medium">Live Dashboard</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Command Center</h1>
          <p className="text-gray-400 text-sm mt-0.5">Real-time overview · refreshes in <span className="text-indigo-400 font-mono font-bold">{countdown}s</span></p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-gray-500">
              Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/admin/complaints" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition">
            All Complaints →
          </Link>
        </div>
      </div>

      {/* Critical alert banner */}
      {criticalCount > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-red-400 text-lg flex-shrink-0">🚨</span>
          <p className="text-sm text-red-300 font-medium">
            {criticalCount} critical complaint{criticalCount !== 1 ? 's' : ''} require{criticalCount === 1 ? 's' : ''} immediate attention
          </p>
          <Link to="/admin/complaints" className="ml-auto text-xs text-red-400 hover:text-red-300 transition whitespace-nowrap">
            Review now →
          </Link>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Complaints" value={totalComplaints} color="text-blue-400" icon="📋" sub="All time records" />
        <StatCard label="Pending Review" value={pendingCount} color="text-yellow-400" icon="⏳" sub="Awaiting action" />
        <StatCard label="Critical Open" value={criticalCount} color="text-red-400" icon="🚨" sub="Needs immediate action" />
        <StatCard label="Resolution Rate" value={`${resolutionRate}%`} color="text-green-400" icon="✅" sub="Cases closed" />
      </div>

      {/* Secondary stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'In Progress', value: stats.in_progress ?? 0, color: 'text-indigo-400' },
            { label: 'Resolved', value: stats.resolved ?? 0, color: 'text-green-400' },
            { label: 'High Priority', value: stats.high_priority ?? 0, color: 'text-orange-400' },
          ].map(m => (
            <div key={m.label} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{m.label}</span>
              <span className={`text-xl font-extrabold ${m.color}`}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Complaints feed */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700/60 flex justify-between items-center">
            <h2 className="font-bold text-gray-100 flex items-center gap-2">
              <span className="text-indigo-400">📋</span> Recent Activity
            </h2>
            <Link to="/admin/complaints" className="text-xs text-indigo-400 hover:text-indigo-300 transition">View all →</Link>
          </div>
          {recentComplaints.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-500 text-sm">No complaints yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/50">
              {recentComplaints.map(c => (
                <li key={c.id} className={`px-5 py-3.5 flex items-center gap-3 hover:bg-gray-700/30 transition group ring-1 ring-transparent hover:ring-1 hover:${PRIORITY_RING[c.priority]}`}>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || 'bg-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-100 font-medium truncate group-hover:text-white transition">{c.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>{c.complaint_id}</span>
                      {c.incident_location && <><span>·</span><span className="truncate">{c.incident_location}</span></>}
                      {c.created_at && <><span>·</span><span className="flex-shrink-0">{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-md bg-gray-700 text-gray-400 capitalize">{c.category?.replace('_', ' ')}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md capitalize ${STATUS_BADGE[c.status] || 'bg-gray-700 text-gray-300'}`}>
                      {c.status?.replace('_', ' ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI Insights */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700/60 bg-indigo-900/20">
              <h2 className="font-bold text-gray-100 flex items-center gap-2">
                <span>⚡</span> AI Insights
              </h2>
            </div>
            <div className="p-4">
              {insights?.insights?.length > 0 ? (
                <ul className="space-y-2.5">
                  {insights.insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300 p-2.5 bg-gray-700/30 rounded-lg">
                      <span className="text-indigo-400 flex-shrink-0 mt-0.5 text-xs">▶</span>
                      <span className="leading-relaxed text-xs">{insight}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No insights available</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/60 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Quick Actions</p>
            <div className="space-y-1.5">
              {[
                { to: '/admin/hotspots', icon: '🗺️', label: 'Crime Hotspot Map' },
                { to: '/admin/analytics', icon: '📈', label: 'Full Analytics' },
                { to: '/admin/users', icon: '👥', label: 'Manage Users' },
                { to: '/admin/complaints', icon: '📋', label: 'All Complaints' },
              ].map(a => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-700/60 hover:text-white transition group"
                >
                  <span>{a.icon}</span>
                  <span className="font-medium">{a.label}</span>
                  <svg className="w-3.5 h-3.5 ml-auto text-gray-600 group-hover:text-indigo-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
