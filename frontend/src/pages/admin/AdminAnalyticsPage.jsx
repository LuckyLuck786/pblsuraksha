import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { complaintsAPI } from '../../utils/api';

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
const STATUS_COLORS = { pending: '#94a3b8', acknowledged: '#60a5fa', in_progress: '#818cf8', resolved: '#4ade80', closed: '#6b7280', rejected: '#f87171' };

const CATEGORY_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b', '#a78bfa', '#fb7185',
];

const AdminAnalyticsPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        complaintsAPI.getAnalytics()
            .then(res => setData(res.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-400">Loading analytics...</div>;
    if (!data) return <div className="p-8 text-center text-gray-400">Failed to load analytics data.</div>;

    const priorityData = (data.by_priority || []).map(p => ({
        name: p.priority?.toUpperCase() || 'N/A',
        value: p.count,
        fill: PRIORITY_COLORS[p.priority] || '#94a3b8',
    }));

    const statusData = (data.by_status || []).map(s => ({
        name: s.status?.replace('_', ' ') || 'N/A',
        count: s.count,
        fill: STATUS_COLORS[s.status] || '#94a3b8',
    }));

    const categoryData = (data.by_category || []).slice(0, 8).map((c, i) => ({
        name: c.category?.replace('_', ' ') || 'N/A',
        count: c.count,
        fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));

    const monthlyData = (data.monthly_trend || []).map(m => ({
        month: m.month,
        complaints: m.count,
    }));

    const resolutionRate = data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-gray-100 mb-2">Analytics & Insights</h1>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Complaints', value: data.total, color: 'text-blue-400' },
                    { label: 'Resolved', value: data.resolved, color: 'text-green-400' },
                    { label: 'Resolution Rate', value: `${resolutionRate}%`, color: 'text-indigo-400' },
                    { label: 'Urgent Open', value: data.urgent_count, color: 'text-red-400' },
                ].map(s => (
                    <div key={s.label} className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Priority Pie */}
                <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Priority Breakdown</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie
                                data={priorityData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={90}
                                label={({ name, value }) => `${name}: ${value}`}
                                labelLine={false}
                            >
                                {priorityData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} />
                            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Status Bar */}
                <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Status Distribution</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={statusData} margin={{ left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {statusData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Monthly Trend */}
                <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Monthly Trend</h2>
                    {monthlyData.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-8">No monthly data available yet.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={monthlyData} margin={{ left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} />
                                <Line type="monotone" dataKey="complaints" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Category Bar */}
                <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Top Categories</h2>
                    {categoryData.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-8">No category data available.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={90} />
                                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {categoryData.map((entry, i) => (
                                        <Cell key={i} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminAnalyticsPage;
