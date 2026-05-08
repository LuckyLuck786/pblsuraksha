import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const ROLE_LABELS = { citizen: 'Citizen', authority: 'Authority / Police', farmer: 'Farmer', admin: 'System Admin' };
const ROLE_COLORS = { citizen: 'bg-blue-100 text-blue-700', authority: 'bg-purple-100 text-purple-700', farmer: 'bg-green-100 text-green-700', admin: 'bg-red-100 text-red-700' };

const ProfilePage = () => {
    const { user, updateUser } = useAuth();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        city: user?.city || '',
        state: user?.state || 'Karnataka',
        address: user?.address || '',
        pincode: user?.pincode || '',
        badge_number: user?.badge_number || '',
        station_name: user?.station_name || '',
        farm_location: user?.farm_location || '',
    });

    const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await authAPI.updateProfile(form);
            updateUser(res.data.user);
            setEditing(false);
            toast.success('Profile updated successfully!');
        } catch (err) {
            toast.error('Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setForm({
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            email: user?.email || '',
            phone: user?.phone || '',
            city: user?.city || '',
            state: user?.state || 'Karnataka',
            address: user?.address || '',
            pincode: user?.pincode || '',
            badge_number: user?.badge_number || '',
            station_name: user?.station_name || '',
            farm_location: user?.farm_location || '',
        });
        setEditing(false);
    };

    const Field = ({ label, name, value, placeholder, disabled }) => (
        <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
            {editing && !disabled ? (
                <input
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
            ) : (
                <p className="text-sm text-gray-800 py-2">{value || <span className="text-gray-400 italic">Not provided</span>}</p>
            )}
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto p-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-8">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white">
                            {user?.first_name?.[0] || user?.username?.[0] || '?'}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">{user?.first_name} {user?.last_name}</h1>
                            <p className="text-indigo-200 text-sm">@{user?.username}</p>
                            <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user?.role] || 'bg-gray-100 text-gray-700'}`}>
                                {ROLE_LABELS[user?.role] || user?.role}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    <div className="flex justify-between items-center">
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Profile Information</h2>
                        {!editing ? (
                            <button
                                onClick={() => setEditing(true)}
                                className="text-sm text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition"
                            >
                                Edit Profile
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={handleCancel} className="text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="text-sm text-white bg-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <Field label="First Name" name="first_name" value={user?.first_name} />
                        <Field label="Last Name" name="last_name" value={user?.last_name} />
                        <Field label="Email" name="email" value={user?.email} disabled />
                        <Field label="Phone" name="phone" value={user?.phone} placeholder="+91 XXXXX XXXXX" />
                        <Field label="City" name="city" value={user?.city} placeholder="Bangalore" />
                        <Field label="State" name="state" value={user?.state} placeholder="Karnataka" />
                        <Field label="Pincode" name="pincode" value={user?.pincode} placeholder="560001" />
                    </div>

                    <Field label="Address" name="address" value={user?.address} placeholder="Full address" />

                    {/* Role-specific fields */}
                    {(user?.role === 'authority' || user?.role === 'admin') && (
                        <div className="border-t pt-4">
                            <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-3">Authority Details</h3>
                            <div className="grid grid-cols-2 gap-5">
                                <Field label="Badge Number" name="badge_number" value={user?.badge_number} placeholder="KA/PO/001" />
                                <Field label="Police Station" name="station_name" value={user?.station_name} placeholder="MG Road PS" />
                            </div>
                        </div>
                    )}

                    {user?.role === 'farmer' && (
                        <div className="border-t pt-4">
                            <h3 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-3">Farm Details</h3>
                            <Field label="Farm Location" name="farm_location" value={user?.farm_location} placeholder="Village, Taluk, District" />
                        </div>
                    )}

                    {/* Account Info (read-only) */}
                    <div className="border-t pt-4 grid grid-cols-2 gap-5">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Username</p>
                            <p className="text-sm text-gray-700">@{user?.username}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Verified</p>
                            <p className="text-sm">{user?.is_verified ? '✅ Verified' : '⏳ Pending verification'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
