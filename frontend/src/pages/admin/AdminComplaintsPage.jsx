import React, { useState, useEffect } from 'react';
import { complaintsAPI, intelligenceAPI } from '../../utils/api';
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

                <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-white">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">New Status</label>
                            <select
                                value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Priority</label>
                            <select
                                value={form.priority}
                                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {PRIORITY_OPTIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Update Message <span className="text-red-500">*</span></label>
                        <textarea
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                            rows={3}
                            placeholder="Describe the action taken or update for the citizen..."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Internal Notes</label>
                        <textarea
                            value={form.authority_notes}
                            onChange={e => setForm(f => ({ ...f, authority_notes: e.target.value }))}
                            rows={2}
                            placeholder="Internal notes (not visible to citizen)..."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {(form.status === 'resolved' || form.status === 'closed') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Resolution Details</label>
                            <textarea
                                value={form.resolution_details}
                                onChange={e => setForm(f => ({ ...f, resolution_details: e.target.value }))}
                                rows={2}
                                placeholder="How was this resolved?"
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-800 font-medium hover:bg-gray-50 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                            {saving ? 'Saving...' : 'Update Complaint'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─── Investigation Summary Modal ─────────────────────────────────────── */
const InvestigationModal = ({ complaint, onClose }) => {
    const [summary, setSummary]   = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);

    useEffect(() => {
        intelligenceAPI.investigationSummary(complaint.complaint_id)
            .then(res => setSummary(res.data))
            .catch(() => setError('Could not generate AI summary. Please try again.'))
            .finally(() => setLoading(false));
    }, [complaint.complaint_id]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                 onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-gray-700">
                    <div>
                        <h3 className="text-white font-bold text-lg">AI Investigation Brief</h3>
                        <p className="text-gray-400 text-xs mt-0.5">{complaint.complaint_id} · {complaint.title}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition text-xl mt-0.5">✕</button>
                </div>

                <div className="p-5 space-y-4">
                    {loading && (
                        <div className="flex items-center gap-3 py-8 justify-center">
                            <svg className="animate-spin w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            <span className="text-gray-400 text-sm">Generating AI brief…</span>
                        </div>
                    )}
                    {error && <p className="text-red-400 text-sm text-center py-4">{error}</p>}
                    {summary && !loading && (
                        <>
                            {/* Case Summary */}
                            {summary.case_summary && (
                                <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-xl p-4">
                                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">Case Summary</p>
                                    <p className="text-gray-200 text-sm leading-relaxed">{summary.case_summary}</p>
                                </div>
                            )}

                            {/* Key Facts */}
                            {summary.key_facts?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Facts</p>
                                    <ul className="space-y-1.5">
                                        {summary.key_facts.map((f, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                                <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span> {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* IPC Sections */}
                            {summary.ipc_sections?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">⚖️ Applicable IPC / IT Act Sections</p>
                                    <div className="flex flex-wrap gap-2">
                                        {summary.ipc_sections.map(s => (
                                            <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300 font-medium">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommended Actions */}
                            {summary.recommended_actions?.length > 0 && (
                                <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4">
                                    <p className="text-xs font-semibold text-green-300 uppercase tracking-wider mb-2">Recommended Actions</p>
                                    <ul className="space-y-1.5">
                                        {summary.recommended_actions.map((a, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-green-200">
                                                <span className="text-green-400 mt-0.5 flex-shrink-0">{i + 1}.</span> {a}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Urgency */}
                            {summary.urgency_note && (
                                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1">⚡ Urgency</p>
                                    <p className="text-sm text-amber-200">{summary.urgency_note}</p>
                                </div>
                            )}

                            {/* Confidence */}
                            {summary.confidence !== undefined && (
                                <p className="text-xs text-gray-600 text-right">
                                    AI confidence: {Math.round((summary.confidence || 0) * 100)}%
                                </p>
                            )}
                        </>
                    )}
                </div>
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
    const [investigationTarget, setInvestigationTarget] = useState(null);
    const [exporting, setExporting] = useState(false);

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

    const handleExport = async (format) => {
        setExporting(true);
        try {
            const params = {};
            if (filter.status) params.status = filter.status;
            if (filter.priority) params.priority = filter.priority;
            const res = await complaintsAPI.exportComplaints(format, params);
            const ext  = format === 'pdf' ? 'pdf' : 'xlsx';
            const mime = format === 'pdf' ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const url  = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
            const a    = document.createElement('a');
            a.href = url;
            a.download = `complaints_export.${ext}`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success(`Exported as ${ext.toUpperCase()}`);
        } catch {
            toast.error('Export failed. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        critical: complaints.filter(c => c.priority === 'critical').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-100">
                    {assignedOnly ? 'Assigned to Me' : 'All Complaints'}
                </h1>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Export:</span>
                    <button
                        onClick={() => handleExport('xlsx')}
                        disabled={exporting}
                        className="flex items-center gap-1.5 text-xs bg-green-700/30 hover:bg-green-700/50 border border-green-700/40 text-green-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        XLSX
                    </button>
                    <button
                        onClick={() => handleExport('pdf')}
                        disabled={exporting}
                        className="flex items-center gap-1.5 text-xs bg-red-700/30 hover:bg-red-700/50 border border-red-700/40 text-red-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        PDF
                    </button>
                </div>
            </div>

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
                                            {c.ipc_sections?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {c.ipc_sections.slice(0, 2).map(s => (
                                                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/40">{s}</span>
                                                    ))}
                                                </div>
                                            )}
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
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSelected(c)}
                                                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition"
                                                >
                                                    Update
                                                </button>
                                                <button
                                                    onClick={() => setInvestigationTarget(c)}
                                                    title="AI Investigation Brief"
                                                    className="text-xs bg-purple-700/40 hover:bg-purple-700/70 border border-purple-600/40 text-purple-300 px-2 py-1 rounded transition"
                                                >
                                                    🔍 AI
                                                </button>
                                            </div>
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

            {investigationTarget && (
                <InvestigationModal
                    complaint={investigationTarget}
                    onClose={() => setInvestigationTarget(null)}
                />
            )}
        </div>
    );
};

export default AdminComplaintsPage;
