import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { complaintsAPI, authAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const PRIORITY_STYLES = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
};

const STATUS_STYLES = {
    pending: 'bg-gray-100 text-gray-600',
    acknowledged: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-200 text-gray-500',
    rejected: 'bg-red-100 text-red-600',
};

const DashboardPage = () => {
    const { user } = useAuth();
    const [complaints, setComplaints] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            complaintsAPI.getAll({ ordering: '-created_at' }),
            authAPI.getDashboardStats(),
        ])
            .then(([complaintsRes, statsRes]) => {
                const data = complaintsRes.data.results ?? complaintsRes.data;
                setComplaints(Array.isArray(data) ? data.slice(0, 5) : []);
                setStats(statsRes.data);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const firstName = user?.first_name || user?.username || 'there';

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl p-6 mb-6 text-white">
                <h1 className="text-2xl font-bold">Welcome back, {firstName}!</h1>
                <p className="text-indigo-200 text-sm mt-1">
                    Your complaints are being handled by SURAKSHA's AI-powered system.
                </p>
                <Link
                    to="/citizen/complaint/new"
                    className="mt-4 inline-block bg-white text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition shadow-sm"
                >
                    + File New Complaint
                </Link>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Total Reports', value: stats.total_reports ?? 0, color: 'text-gray-800' },
                        { label: 'Pending', value: stats.pending ?? 0, color: 'text-yellow-600' },
                        { label: 'In Progress', value: stats.in_progress ?? 0, color: 'text-indigo-600' },
                        { label: 'Resolved', value: stats.resolved ?? 0, color: 'text-green-600' },
                    ].map(s => (
                        <div key={s.label} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
                            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Recent Complaints */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Recent Complaints</h2>
                    <Link to="/citizen/complaints" className="text-sm text-indigo-600 hover:underline">
                        View all →
                    </Link>
                </div>

                {loading ? (
                    <p className="p-6 text-gray-400 text-sm">Loading your data...</p>
                ) : complaints.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-500 mb-3">No complaints filed yet.</p>
                        <Link to="/citizen/complaint/new" className="text-indigo-600 text-sm font-medium hover:underline">
                            File your first complaint →
                        </Link>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {complaints.map(c => (
                            <li key={c.id} className="p-5 hover:bg-gray-50 transition">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-gray-400">{c.complaint_id}</span>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[c.priority] || 'bg-gray-100 text-gray-600'}`}>
                                                {c.priority?.toUpperCase()}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-semibold text-gray-800">{c.title}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {c.incident_location} · {new Date(c.created_at).toLocaleDateString('en-IN')}
                                        </p>
                                        {c.ai_summary && (
                                            <p className="text-xs text-indigo-600 mt-1 italic line-clamp-1">{c.ai_summary}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {c.status?.replace('_', ' ')}
                                        </span>
                                        <span className="text-xs text-gray-400">Score: {c.severity_score}/10</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-3 gap-4 mt-6">
                {[
                    { to: '/citizen/complaints', icon: '📋', label: 'All Complaints' },
                    { to: '/citizen/complaint/new', icon: '🚨', label: 'New Complaint' },
                    { to: '/citizen/notifications', icon: '🔔', label: 'Notifications' },
                ].map(link => (
                    <Link
                        key={link.to}
                        to={link.to}
                        className="bg-white rounded-lg border border-gray-200 p-4 text-center hover:border-indigo-300 hover:shadow-sm transition"
                    >
                        <p className="text-2xl mb-1">{link.icon}</p>
                        <p className="text-sm font-medium text-gray-700">{link.label}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default DashboardPage;
