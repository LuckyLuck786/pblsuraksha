import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { intelligenceAPI, complaintsAPI, authAPI } from '../../utils/api';

const AdminDashboardPage = () => {
    const [insights, setInsights] = useState(null);
    const [stats, setStats] = useState(null);
    const [recentComplaints, setRecentComplaints] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            intelligenceAPI.getInsights(),
            authAPI.getDashboardStats(),
            complaintsAPI.getAll({ ordering: '-created_at' }),
        ])
            .then(([insightsRes, statsRes, complaintsRes]) => {
                setInsights(insightsRes.data);
                setStats(statsRes.data);
                const data = complaintsRes.data.results ?? complaintsRes.data;
                setRecentComplaints(Array.isArray(data) ? data.slice(0, 5) : []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const PRIORITY_DOT = { critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-green-400' };
    const STATUS_BADGE = {
        pending: 'bg-gray-700 text-gray-300',
        acknowledged: 'bg-blue-900 text-blue-300',
        in_progress: 'bg-indigo-900 text-indigo-300',
        resolved: 'bg-green-900 text-green-300',
        rejected: 'bg-red-900 text-red-300',
    };

    if (loading) return <div className="p-6 text-center text-gray-400">Loading command center...</div>;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-gray-100">Command Center</h1>
                    <p className="text-gray-400 text-sm mt-1">Real-time overview of all incidents and system activity</p>
                </div>
                <div className="flex gap-3">
                    <Link to="/admin/complaints" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
                        View All Complaints →
                    </Link>
                    <Link to="/admin/analytics" className="text-sm border border-gray-600 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700 transition">
                        Analytics
                    </Link>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Complaints', value: stats?.total_complaints ?? insights?.total_analyzed ?? 0, color: 'text-blue-400', icon: '📋' },
                    { label: 'Pending Review', value: stats?.pending ?? 0, color: 'text-yellow-400', icon: '⏳' },
                    { label: 'Critical Open', value: stats?.critical_priority ?? insights?.pending_critical ?? 0, color: 'text-red-400', icon: '🚨' },
                    { label: 'Resolution Rate', value: `${insights?.resolution_rate ?? 0}%`, color: 'text-green-400', icon: '✅' },
                ].map(m => (
                    <div key={m.label} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider">{m.label}</p>
                                <p className={`text-3xl font-bold mt-2 ${m.color}`}>{m.value}</p>
                            </div>
                            <span className="text-2xl">{m.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Secondary Metrics */}
            {stats && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">In Progress</p>
                        <p className="text-2xl font-bold text-indigo-400">{stats.in_progress ?? 0}</p>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Resolved</p>
                        <p className="text-2xl font-bold text-green-400">{stats.resolved ?? 0}</p>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">High Priority</p>
                        <p className="text-2xl font-bold text-orange-400">{stats.high_priority ?? 0}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Complaints */}
                <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700 flex justify-between items-center">
                        <h2 className="font-semibold text-gray-200">Recent Complaints</h2>
                        <Link to="/admin/complaints" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
                    </div>
                    {recentComplaints.length === 0 ? (
                        <p className="p-6 text-gray-500 text-sm">No complaints yet.</p>
                    ) : (
                        <ul className="divide-y divide-gray-700">
                            {recentComplaints.map(c => (
                                <li key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || 'bg-gray-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 font-medium truncate">{c.title}</p>
                                        <p className="text-xs text-gray-500">{c.complaint_id} · {c.incident_location}</p>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[c.status] || 'bg-gray-700 text-gray-300'}`}>
                                        {c.status?.replace('_', ' ')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* AI Insights Panel */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700 bg-indigo-900/30">
                        <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                            <span>⚡</span> AI Insights
                        </h2>
                    </div>
                    <div className="p-5">
                        {insights?.insights?.length > 0 ? (
                            <ul className="space-y-3">
                                {insights.insights.map((insight, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                                        <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>
                                        {insight}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 text-sm">No insights available yet.</p>
                        )}
                    </div>

                    {/* Quick Links */}
                    <div className="px-5 pb-5">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-semibold">Quick Actions</p>
                        <div className="space-y-2">
                            <Link to="/admin/hotspots" className="flex items-center gap-2 text-sm text-gray-300 hover:text-indigo-400 transition">
                                <span>🗺️</span> Crime Hotspot Map
                            </Link>
                            <Link to="/admin/analytics" className="flex items-center gap-2 text-sm text-gray-300 hover:text-indigo-400 transition">
                                <span>📈</span> Full Analytics
                            </Link>
                            <Link to="/admin/users" className="flex items-center gap-2 text-sm text-gray-300 hover:text-indigo-400 transition">
                                <span>👥</span> Manage Users
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
