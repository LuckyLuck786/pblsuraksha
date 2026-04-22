import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { transportAPI } from '../../utils/api';

const TransportDashboardPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const res = await transportAPI.getAll();
                const fetchedData = res.data?.results || res.data;
                
                if (Array.isArray(fetchedData)) {
                    setRequests(fetchedData);
                } else {
                    setRequests([]);
                }
            } catch (error) {
                console.error("Failed to fetch transport requests", error);
                setRequests([]);
            } finally {
                setLoading(false);
            }
        };
        fetchRequests();
    }, []);

    const getStatusColor = (status) => {
        switch(status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'route_suggested': return 'bg-blue-100 text-blue-800';
            case 'confirmed': return 'bg-indigo-100 text-indigo-800';
            case 'in_transit': return 'bg-purple-100 text-purple-800';
            case 'delivered': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Transport Logistics</h1>
                <Link 
                    to="/transport/new" 
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium shadow-sm"
                >
                    + New Transport Request
                </Link>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">My Shipments</h2>
                </div>
                
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading logistics data...</div>
                ) : requests.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <p>No active transport requests found.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {requests.map(req => (
                            <li key={req.id} className="p-6 hover:bg-gray-50 transition">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {req.crop_name} <span className="text-sm font-normal text-gray-500">({req.quantity_tons} Tons)</span>
                                        </h3>
                                        <div className="text-sm text-gray-500 mt-1 flex gap-4">
                                            <p><span className="font-medium text-gray-700">From:</span> {req.pickup_address}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wide ${getStatusColor(req.status)}`}>
                                            {req.status?.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default TransportDashboardPage;