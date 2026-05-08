import React, { useState, useEffect } from 'react';
import { complaintsAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const PRIORITY_STYLES = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_STYLES = {
    pending: 'bg-gray-100 text-gray-700',
    acknowledged: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-200 text-gray-500',
    rejected: 'bg-red-100 text-red-700',
};

const STATUS_OPTIONS = ['pending', 'acknowledged', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

const UpdateModal = ({ complaint, onClose, onUpdated }) => {
    const [form, setForm] = useState({
        status: complaint.status,
        priority: complaint.priority,
        message: '',
        authority_notes: complaint.authority_notes || '',
        resolution_details: '',
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async e => {
        e.preventDefault();
        if (!form.message.trim() || form.message.trim().length < 5) {
            toast.error('Update message must be at least 5 characters.');
            return;
        }
        setSaving(true);
        try {
            await complaintsAPI.updateStatus(complaint.complaint_id, form);
            toast.success('Complaint updated successfully!');
            onUpdated();
            onClose();
        } catch {
            toast.error('Failed to update complaint.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="bg-indigo-600 px-5 py-4 flex justify-between items-center">
                    <div>
                        <h3 className="text-white font-bold">Update Complaint</h3>
                        <p className="text-indigo-200 text-xs">{complaint.complaint_id} · {complaint.title}</p>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">New Status</label>
                            <select
                                value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Priority</label>
                            <select
                                value={form.priority}
                                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {PRIORITY_OPTIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Update Message <span className="text-red-500">*</span></label>
                        <textarea
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                            rows={3}
                            placeholder="Describe the action taken or update for the citizen..."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Internal Notes</label>
                        <textarea
                            value={form.authority_notes}
                            onChange={e => setForm(f => ({ ...f, authority_notes: e.target.value }))}
                            rows={2}
                            placeholder="Internal notes (not visible to citizen)..."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {(form.status === 'resolved' || form.status === 'closed') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Resolution Details</label>
                            <textarea
                                value={form.resolution_details}
                                onChange={e => setForm(f => ({ ...f, resolution_details: e.target.value }))}
                                rows={2}
                                placeholder="How was this resolved?"
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Update Complaint'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AdminComplaintsPage = ({ assignedOnly = false }) => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ status: '', priority: '', category: '' });
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filter.status) params.status = filter.status;
            if (filter.priority) params.priority = filter.priority;
            if (filter.category) params.category = filter.category;
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

    useEffect(() => { fetchComplaints(); }, [filter, search]);

    const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        critical: complaints.filter(c => c.priority === 'critical').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-100 mb-6">
                {assignedOnly ? 'Assigned to Me' : 'All Complaints'}
            </h1>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total', value: stats.total, color: 'text-gray-100' },
                    { label: 'Pending', value: stats.pending, color: 'text-yellow-400' },
                    { label: 'Critical', value: stats.critical, color: 'text-red-400' },
                    { label: 'Resolved', value: stats.resolved, color: 'text-green-400' },
                ].map(s => (
                    <div key={s.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{s.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4 flex flex-wrap gap-3">
                <input
                    type="text"
                    placeholder="Search by title, ID, location..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-48 bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-400 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                    className="bg-gray-700 border border-gray-600 text-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none">
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}
                    className="bg-gray-700 border border-gray-600 text-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none">
                    <option value="">All Priorities</option>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading complaints...</div>
                ) : complaints.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No complaints found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 bg-gray-900/50">
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">ID</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Title</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Priority</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Status</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">AI Score</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Reporter</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Date</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {complaints.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-700/50 transition">
                                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{c.complaint_id}</td>
                                        <td className="px-4 py-3">
                                            <p className="text-gray-200 font-medium truncate max-w-xs">{c.title}</p>
                                            <p className="text-xs text-gray-500 truncate">{c.incident_location}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[c.priority] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                                {c.priority?.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {c.status?.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-indigo-400 font-bold">{c.severity_score}</td>
                                        <td className="px-4 py-3 text-gray-300 text-xs">{c.reporter_name}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {new Date(c.created_at).toLocaleDateString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setSelected(c)}
                                                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition"
                                            >
                                                Update
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selected && (
                <UpdateModal
                    complaint={selected}
                    onClose={() => setSelected(null)}
                    onUpdated={fetchComplaints}
                />
            )}
        </div>
    );
};

export default AdminComplaintsPage;
