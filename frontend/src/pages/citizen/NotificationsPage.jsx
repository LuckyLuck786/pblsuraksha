import React, { useState, useEffect } from 'react';
import { complaintsAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const NOTIF_ICONS = {
    complaint_update: '📋',
    new_assignment: '✅',
    system: '🔔',
};

const NotificationsPage = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const res = await complaintsAPI.getNotifications();
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unread_count || 0);
        } catch {
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchNotifications(); }, []);

    const handleMarkAllRead = async () => {
        try {
            await complaintsAPI.markNotificationsRead();
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            toast.success('All notifications marked as read.');
        } catch {
            toast.error('Failed to mark as read.');
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
                    {unreadCount > 0 && (
                        <p className="text-sm text-indigo-600 mt-1">{unreadCount} unread</p>
                    )}
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        className="text-sm text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition"
                    >
                        Mark all as read
                    </button>
                )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <p className="text-4xl mb-3">🔔</p>
                        <p>No notifications yet. You're all caught up!</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {notifications.map(n => (
                            <li
                                key={n.id}
                                className={`flex gap-4 p-4 transition ${!n.is_read ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                            >
                                <span className="text-2xl mt-0.5">{NOTIF_ICONS[n.notif_type] || '🔔'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className={`text-sm font-semibold ${!n.is_read ? 'text-indigo-800' : 'text-gray-800'}`}>
                                            {n.title}
                                        </p>
                                        {!n.is_read && (
                                            <span className="ml-2 w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(n.created_at).toLocaleString('en-IN')}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default NotificationsPage;
