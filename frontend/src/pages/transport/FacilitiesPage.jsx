import React, { useState, useEffect } from 'react';
import { transportAPI } from '../../utils/api';

const FACILITY_TYPE_LABELS = {
    cold_storage: 'Cold Storage',
    warehouse: 'Warehouse',
    market: 'APMC Market',
    distribution: 'Distribution Center',
    processing: 'Processing Unit',
};

const FACILITY_TYPE_COLORS = {
    cold_storage: 'bg-blue-100 text-blue-700',
    warehouse: 'bg-yellow-100 text-yellow-700',
    market: 'bg-green-100 text-green-700',
    distribution: 'bg-purple-100 text-purple-700',
    processing: 'bg-orange-100 text-orange-700',
};

const FACILITY_ICONS = {
    cold_storage: '❄️',
    warehouse: '🏭',
    market: '🛒',
    distribution: '📦',
    processing: '⚙️',
};

const FacilitiesPage = () => {
    const [facilities, setFacilities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    useEffect(() => {
        transportAPI.getAllFacilities()
            .then(res => {
                const data = res.data?.results ?? res.data;
                setFacilities(Array.isArray(data) ? data : []);
            })
            .catch(() => setFacilities([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = facilities.filter(f => {
        const matchSearch = !search || `${f.name} ${f.city} ${f.address}`.toLowerCase().includes(search.toLowerCase());
        const matchType = !typeFilter || f.facility_type === typeFilter;
        return matchSearch && matchType;
    });

    const typeCount = (type) => facilities.filter(f => f.facility_type === type).length;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Storage Facilities & Markets</h1>
            <p className="text-gray-500 text-sm mb-6">Find nearby agricultural storage and market facilities.</p>

            {/* Facility Type Stats */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                {Object.entries(FACILITY_TYPE_LABELS).map(([type, label]) => (
                    <button
                        key={type}
                        onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                        className={`rounded-lg p-3 border text-center transition ${typeFilter === type ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                        <p className="text-xl mb-1">{FACILITY_ICONS[type]}</p>
                        <p className="text-xs font-medium text-gray-700">{label}</p>
                        <p className="text-lg font-bold text-indigo-600">{typeCount(type)}</p>
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex gap-3">
                <input
                    type="text"
                    placeholder="Search by name, city, address..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {typeFilter && (
                    <button
                        onClick={() => setTypeFilter('')}
                        className="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50"
                    >
                        Clear filter
                    </button>
                )}
            </div>

            {/* Facilities Grid */}
            {loading ? (
                <div className="text-center text-gray-500 py-12">Loading facilities...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                    <p className="text-4xl mb-3">🏭</p>
                    <p>No facilities found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(f => (
                        <div key={f.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden">
                            <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">{FACILITY_ICONS[f.facility_type]}</span>
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-800">{f.name}</h3>
                                            <p className="text-xs text-gray-500">{f.city}, {f.state}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FACILITY_TYPE_COLORS[f.facility_type] || 'bg-gray-100 text-gray-700'}`}>
                                        {FACILITY_TYPE_LABELS[f.facility_type]}
                                    </span>
                                </div>

                                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{f.address}</p>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-50 rounded p-2">
                                        <p className="text-gray-400">Capacity</p>
                                        <p className="font-semibold text-gray-700">{f.capacity_tons} tons</p>
                                    </div>
                                    <div className="bg-gray-50 rounded p-2">
                                        <p className="text-gray-400">Available</p>
                                        <p className={`font-semibold ${f.available_capacity_tons > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {f.available_capacity_tons} tons
                                        </p>
                                    </div>
                                </div>

                                {(f.contact_phone || f.operating_hours) && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                                        {f.contact_phone && <span>📞 {f.contact_phone}</span>}
                                        {f.operating_hours && <span>🕐 {f.operating_hours}</span>}
                                    </div>
                                )}

                                {f.accepted_crops && (
                                    <p className="text-xs text-gray-400 mt-2">
                                        Accepts: <span className="text-gray-600">{f.accepted_crops}</span>
                                    </p>
                                )}
                            </div>

                            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex justify-between items-center">
                                <span className={`text-xs font-medium ${f.is_active ? 'text-green-600' : 'text-red-500'}`}>
                                    {f.is_active ? '● Active' : '● Inactive'}
                                </span>
                                {f.price_per_ton > 0 && (
                                    <span className="text-xs text-gray-500">₹{f.price_per_ton}/ton</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FacilitiesPage;
