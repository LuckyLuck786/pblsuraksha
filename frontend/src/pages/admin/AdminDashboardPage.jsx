import React, { useState, useEffect } from 'react';
import { intelligenceAPI } from '../../utils/api';

const AdminDashboardPage = () => {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInsights = async () => {
            try {
                const res = await intelligenceAPI.getInsights();
                setInsights(res.data);
            } catch (error) {
                console.error("Failed to fetch admin insights", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInsights();
    }, []);

    if (loading) return <div className="p-6 text-white">Loading system intelligence...</div>;

    return (
        <div className="max-w-7xl mx-auto p-6">
            <h1 className="text-3xl font-bold text-gray-100 mb-8">Authority Command Center</h1>

            {/* Top Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Resolution Rate</h3>
                    <p className="text-4xl font-bold text-green-400 mt-2">
                        {insights?.resolution_rate || 0}%
                    </p>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Pending Critical</h3>
                    <p className="text-4xl font-bold text-red-500 mt-2">
                        {insights?.pending_critical || 0}
                    </p>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total AI Analyzed</h3>
                    <p className="text-4xl font-bold text-blue-400 mt-2">
                        {insights?.total_analyzed || 0}
                    </p>
                </div>
            </div>

            {/* Intelligence Bulletins */}
            <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-900/50">
                    <h2 className="font-semibold text-gray-200">System Insights & Alerts</h2>
                </div>
                <div className="p-6">
                    {insights?.insights && insights.insights.length > 0 ? (
                        <ul className="space-y-3">
                            {insights.insights.map((insight, idx) => (
                                <li key={idx} className="flex items-start text-gray-300">
                                    <span className="text-indigo-500 mr-3">⚡</span>
                                    {insight}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500">No active insights generated at this time.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;