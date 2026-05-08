import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { complaintsAPI } from '../../utils/api';

const PRIORITY_STYLES = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800',
};

const STATUS_STYLES = {
    pending: 'bg-gray-100 text-gray-700',
    acknowledged: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-200 text-gray-600',
    rejected: 'bg-red-100 text-red-700',
};

const CitizenComplaintsPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ status: '', priority: '' });
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState(null);

    useEffect(() => {
        const fetchComplaints = async () => {
            setLoading(true);
            try {
                const params = {};
                if (filter.status) params.status = filter.status;
                if (filter.priority) params.priority = filter.priority;
                if (search) params.search = search;
                const res = await complaintsAPI.getAll(params);
                const data = res.data.results ?? res.data;
                setComplaints(Array.isArray(data) ? data : []);
            } catch {
                setComplaints([]);
            } finally {
                setLoading(false);
            }
        };
        fetchComplaints();
    }, [filter, search]);

    const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        critical: complaints.filter(c => c.priority === 'critical').length,
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">My Complaints</h1>
                    <p className="text-gray-500 text-sm mt-1">Track all your filed reports</p>
                </div>
                <Link
                    to="/citizen/complaint/new"
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
                >
                    + New Complaint
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Filed', value: stats.total, color: 'text-gray-800' },
                    { label: 'Pending', value: stats.pending, color: 'text-yellow-600' },
                    { label: 'Resolved', value: stats.resolved, color: 'text-green-600' },
                    { label: 'Critical', value: stats.critical, color: 'text-red-600' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3">
                <input
                    type="text"
                    placeholder="Search complaints..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-48 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <select
                    value={filter.status}
                    onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="rejected">Rejected</option>
                </select>
                <select
                    value={filter.priority}
                    onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                    <option value="">All Priorities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>

            {/* Complaints List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading your complaints...</div>
                ) : complaints.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-500 mb-3">No complaints found.</p>
                        <Link to="/citizen/complaint/new" className="text-indigo-600 text-sm font-medium hover:underline">
                            File your first complaint →
                        </Link>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {complaints.map(c => (
                            <li key={c.id} className="hover:bg-gray-50 transition">
                                <button
                                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                    className="w-full text-left p-5"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-mono text-gray-400">{c.complaint_id}</span>
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[c.priority] || 'bg-gray-100 text-gray-700'}`}>
                                                    {c.priority?.toUpperCase()}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {c.status?.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-semibold text-gray-800">{c.title}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {c.incident_location} · {new Date(c.created_at).toLocaleDateString('en-IN')}
                                            </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                            <p className="text-xs text-gray-400">Severity</p>
                                            <p className="text-sm font-bold text-indigo-600">{c.severity_score}/10</p>
                                        </div>
                                    </div>
                                </button>

                                {/* Expanded Detail */}
                                {expanded === c.id && (
                                    <div className="px-5 pb-4 bg-indigo-50 border-t border-indigo-100">
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
                                                <p className="text-sm text-gray-700">{c.description || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">AI Analysis</p>
                                                {c.ai_summary ? (
                                                    <p className="text-sm text-indigo-700 italic">{c.ai_summary}</p>
                                                ) : (
                                                    <p className="text-sm text-gray-400">No AI analysis available.</p>
                                                )}
                                                {c.ai_category && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Category: <span className="font-medium capitalize">{c.ai_category.replace('_', ' ')}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default CitizenComplaintsPage;
