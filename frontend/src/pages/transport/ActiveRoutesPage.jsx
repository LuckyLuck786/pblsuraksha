import React, { useState, useEffect } from 'react';
import { transportAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_STYLES = {
    pending: 'bg-gray-100 text-gray-700',
    route_suggested: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-indigo-100 text-indigo-700',
    in_transit: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
};

const ActiveRoutesPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [confirming, setConfirming] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await transportAPI.getAll();
            const data = res.data?.results ?? res.data;
            const active = Array.isArray(data)
                ? data.filter(r => ['route_suggested', 'confirmed', 'in_transit'].includes(r.status))
                : [];
            setRequests(active);
        } catch {
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRequests(); }, []);

    const handleConfirm = async (requestId) => {
        setConfirming(requestId);
        try {
            await transportAPI.confirm(requestId);
            toast.success('Route confirmed! Your transport is scheduled.');
            fetchRequests();
        } catch {
            toast.error('Failed to confirm route.');
        } finally {
            setConfirming(null);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Active Routes</h1>
                    <p className="text-gray-500 text-sm mt-1">Monitor and manage your ongoing transport requests</p>
                </div>
                <span className="text-sm text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200">
                    {requests.length} active
                </span>
            </div>

            {loading ? (
                <div className="text-center text-gray-500 py-12">Loading active routes...</div>
            ) : requests.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-4xl mb-3">🚗</p>
                    <p className="text-gray-500">No active routes at the moment.</p>
                    <p className="text-sm text-gray-400 mt-1">Create a transport request to get AI route suggestions.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map(req => (
                        <div key={req.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            {/* Header */}
                            <button
                                onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                                className="w-full text-left p-5 hover:bg-gray-50 transition"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-gray-400">{req.request_id}</span>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[req.status] || 'bg-gray-100 text-gray-700'}`}>
                                                {req.status?.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-bold text-gray-800">
                                            {req.crop_name}
                                            <span className="text-sm font-normal text-gray-500 ml-2">({req.quantity_tons} Tons)</span>
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-0.5">{req.pickup_address}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400">Distance</p>
                                        <p className="text-sm font-bold text-indigo-600">{req.estimated_distance_km} km</p>
                                        <p className="text-xs text-gray-400">{req.estimated_duration_hours}h est.</p>
                                    </div>
                                </div>
                            </button>

                            {/* Expanded Route Details */}
                            {expanded === req.id && (
                                <div className="border-t border-gray-100 p-5 bg-blue-50">
                                    {req.suggested_route && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                                    <p className="text-xs text-gray-500">Distance</p>
                                                    <p className="text-lg font-bold text-blue-700">{req.suggested_route.distance_km} km</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                                    <p className="text-xs text-gray-500">Duration</p>
                                                    <p className="text-lg font-bold text-blue-700">{req.suggested_route.duration_formatted}</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                                    <p className="text-xs text-gray-500">Efficiency</p>
                                                    <p className="text-lg font-bold text-green-600">{req.suggested_route.efficiency_score}/10</p>
                                                </div>
                                            </div>

                                            {/* Waypoints */}
                                            {req.suggested_route.waypoints && (
                                                <div>
                                                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Route Waypoints</p>
                                                    <div className="flex items-start gap-2">
                                                        {req.suggested_route.waypoints.map((wp, i) => (
                                                            <div key={i} className="flex-1 text-center">
                                                                <div className={`w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-xs font-bold ${wp.type === 'start' ? 'bg-green-500' : wp.type === 'end' ? 'bg-red-500' : 'bg-blue-500'}`}>
                                                                    {i + 1}
                                                                </div>
                                                                <p className="text-xs text-gray-600 font-medium">{wp.label}</p>
                                                                {i < req.suggested_route.waypoints.length - 1 && (
                                                                    <div className="hidden md:block absolute" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Tips */}
                                            {req.suggested_route.tips?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Transport Tips</p>
                                                    <ul className="space-y-1">
                                                        {req.suggested_route.tips.map((tip, i) => (
                                                            <li key={i} className="text-xs text-gray-600 flex gap-2">
                                                                <span>→</span>{tip}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Confirm button for route_suggested status */}
                                    {req.status === 'route_suggested' && (
                                        <div className="mt-4 pt-4 border-t border-blue-100">
                                            <button
                                                onClick={() => handleConfirm(req.request_id)}
                                                disabled={confirming === req.request_id}
                                                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                                            >
                                                {confirming === req.request_id ? 'Confirming...' : '✓ Confirm This Route'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ActiveRoutesPage;
