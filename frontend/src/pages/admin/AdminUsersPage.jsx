import React, { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const ROLE_STYLES = {
    citizen:   'bg-blue-100 text-blue-700',
    authority: 'bg-purple-100 text-purple-700',
    admin:     'bg-red-100 text-red-700',
    farmer:    'bg-green-100 text-green-700',
};

/* Confirmation dialog shown before destructive actions */
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <p className="text-white font-semibold text-center">{message}</p>
            <div className="flex gap-3">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition text-sm"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition text-sm font-semibold"
                >
                    Confirm
                </button>
            </div>
        </div>
    </div>
);

const AdminUsersPage = () => {
    const [users, setUsers]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [actionLoading, setActionLoading] = useState(null); // user id being actioned
    const [confirm, setConfirm]     = useState(null); // { userId, action, label }

    /* Fetch all users from the admin-only list endpoint */
    const fetchUsers = useCallback(() => {
        setLoading(true);
        fetch('/api/auth/users/', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        })
            .then(r => r.json())
            .then(data => setUsers(Array.isArray(data) ? data : (data.results || [])))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const filtered = users.filter(u => {
        const matchSearch = !search ||
            `${u.first_name} ${u.last_name} ${u.username} ${u.email}`.toLowerCase().includes(search.toLowerCase());
        const matchRole = !roleFilter || u.role === roleFilter;
        return matchSearch && matchRole;
    });

    const roleCount = (role) => users.filter(u => u.role === role).length;

    /* Execute block / unblock / delete via the manage endpoint */
    const executeAction = async (userId, action) => {
        setConfirm(null);
        setActionLoading(userId);
        try {
            const res = await authAPI.manageUser(userId, action);
            toast.success(res.data.message);
            // Always refresh from server so the list reflects true state
            await fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Action failed.');
        } finally {
            setActionLoading(null);
        }
    };

    /* Show confirmation dialog before destructive actions */
    const requestAction = (user, action) => {
        const labels = {
            block:   `Block @${user.username}? They will not be able to log in.`,
            unblock: `Unblock @${user.username}? They will regain login access.`,
            delete:  `Permanently delete @${user.username}? This cannot be undone.`,
        };
        setConfirm({ userId: user.id, action, label: labels[action] });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {confirm && (
                <ConfirmDialog
                    message={confirm.label}
                    onConfirm={() => executeAction(confirm.userId, confirm.action)}
                    onCancel={() => setConfirm(null)}
                />
            )}

            <h1 className="text-2xl font-bold text-gray-100 mb-6">User Management</h1>

            {/* Role Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { role: 'citizen',   label: 'Citizens',    color: 'text-blue-400' },
                    { role: 'authority', label: 'Authorities', color: 'text-purple-400' },
                    { role: 'admin',     label: 'Admins',      color: 'text-red-400' },
                ].map(r => (
                    <div key={r.role} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{r.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${r.color}`}>{roleCount(r.role)}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4 flex flex-wrap gap-3">
                <input
                    type="text"
                    placeholder="Search by name, username, email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-48 bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-400 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="bg-gray-700 border border-gray-600 text-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none"
                >
                    <option value="">All Roles</option>
                    <option value="citizen">Citizen</option>
                    <option value="authority">Authority</option>
                    <option value="admin">Admin</option>
                </select>
            </div>

            {/* Users Table */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading users...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No users found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 bg-gray-900/50">
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">User</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Role</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Contact</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Location</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Status</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Joined</th>
                                    <th className="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filtered.map(u => {
                                    const isBlocked = u.is_active === false;
                                    const busy = actionLoading === u.id;
                                    return (
                                        <tr key={u.id} className={`hover:bg-gray-700/50 transition ${isBlocked ? 'opacity-60' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${isBlocked ? 'bg-gray-500' : 'bg-indigo-600'}`}>
                                                        {(u.first_name?.[0] || u.username?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-gray-200 font-medium">
                                                            {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username}
                                                        </p>
                                                        <p className="text-xs text-gray-400">@{u.username}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_STYLES[u.role] || 'bg-gray-100 text-gray-700'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-gray-300 text-xs">{u.email}</p>
                                                {u.phone && <p className="text-gray-400 text-xs">{u.phone}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs">{u.city || u.state || '—'}</td>
                                            <td className="px-4 py-3">
                                                {isBlocked ? (
                                                    <span className="text-xs text-red-400 font-semibold">🚫 Blocked</span>
                                                ) : u.is_verified ? (
                                                    <span className="text-xs text-green-400">✓ Verified</span>
                                                ) : (
                                                    <span className="text-xs text-yellow-400">⏳ Pending</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs">
                                                {u.date_joined ? new Date(u.date_joined).toLocaleDateString('en-IN') : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {/* Block / Unblock toggle */}
                                                    {isBlocked ? (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => requestAction(u, 'unblock')}
                                                            className="px-2 py-1 text-xs bg-green-600/20 text-green-400 border border-green-600/40 rounded-md hover:bg-green-600/30 transition disabled:opacity-50"
                                                        >
                                                            {busy ? '…' : 'Unblock'}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => requestAction(u, 'block')}
                                                            className="px-2 py-1 text-xs bg-yellow-600/20 text-yellow-400 border border-yellow-600/40 rounded-md hover:bg-yellow-600/30 transition disabled:opacity-50"
                                                        >
                                                            {busy ? '…' : 'Block'}
                                                        </button>
                                                    )}
                                                    {/* Delete */}
                                                    <button
                                                        disabled={busy}
                                                        onClick={() => requestAction(u, 'delete')}
                                                        className="px-2 py-1 text-xs bg-red-600/20 text-red-400 border border-red-600/40 rounded-md hover:bg-red-600/30 transition disabled:opacity-50"
                                                    >
                                                        {busy ? '…' : 'Delete'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUsersPage;
