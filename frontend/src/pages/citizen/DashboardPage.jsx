import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { complaintsAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const DashboardPage = () => {
    const { user } = useAuth();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMyComplaints = async () => {
            try {
                const res = await complaintsAPI.getAll({ reporter: user.id });
                
                const fetchedData = res.data.results ? res.data.results : res.data;
                
                if (Array.isArray(fetchedData)) {
                    setComplaints(fetchedData);
                } else {
                    setComplaints([]); 
                }
                
            } catch (error) {
                console.error("Failed to fetch complaints", error);
                setComplaints([]); 
            } finally {
                setLoading(false);
            }
        };
        fetchMyComplaints();
    }, [user.id]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">My Dashboard</h1>
                <Link 
                    to="/citizen/complaint/new" 
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition"
                >
                    + File New Complaint
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">Total Filed</h3>
                    <p className="text-3xl font-bold text-gray-800">{complaints.length}</p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <h2 className="px-6 py-4 border-b font-semibold text-gray-800">Recent Complaints</h2>
                {loading ? (
                    <p className="p-6 text-gray-500">Loading your data...</p>
                ) : complaints.length === 0 ? (
                    <p className="p-6 text-gray-500">You haven't filed any complaints yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {complaints.map(c => (
                            <li key={c.id} className="p-6 hover:bg-gray-50">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-medium text-indigo-600">{c.title}</h3>
                                        {/* THE FIX: Safe description render */}
                                        <p className="text-sm text-gray-500 mt-1">
                                            {c.description ? `${c.description.substring(0, 100)}...` : 'No description available.'}
                                        </p>
                                    </div>
                                    <span className="px-3 py-1 text-sm rounded-full bg-yellow-100 text-yellow-800">
                                        {c.status}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default DashboardPage;