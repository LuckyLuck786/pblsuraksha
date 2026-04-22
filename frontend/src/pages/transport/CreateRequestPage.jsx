import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { transportAPI } from '../../utils/api';

const CreateRequestPage = () => {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        crop_type: 'vegetables',
        crop_name: '',
        quantity_tons: '',
        is_perishable: false,
        requires_cold_storage: false,
        pickup_address: '',
        pickup_date: ''
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            // THE FIX: Inject GPS coordinates so the backend math engine doesn't crash
            const payload = {
                ...formData,
                pickup_latitude: 12.9716,  // Defaulting to Bangalore Latitude
                pickup_longitude: 77.5946  // Defaulting to Bangalore Longitude
            };

            await transportAPI.create(payload);
            navigate('/transport/dashboard'); // Sends you to the correct dashboard!
        } catch (err) {
            console.error("Failed to create request", err);
            setError('Failed to process routing request. Check backend terminal for details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow mt-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Schedule Crop Transport</h2>
            <p className="text-gray-500 mb-6 text-sm">Our AI will automatically route your harvest to the optimal storage facility.</p>
            
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Crop Type</label>
                        <select 
                            name="crop_type" 
                            value={formData.crop_type} 
                            onChange={handleChange}
                            className="w-full rounded-md border-gray-300 border p-2 focus:ring-green-500 focus:border-green-500"
                        >
                            <option value="vegetables">Vegetables</option>
                            <option value="fruits">Fruits</option>
                            <option value="grains">Grains</option>
                            <option value="pulses">Pulses</option>
                            <option value="dairy">Dairy</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Specific Crop Name</label>
                        <input 
                            name="crop_name" 
                            placeholder="e.g., Tomatoes, Wheat"
                            value={formData.crop_name} 
                            onChange={handleChange}
                            className="w-full rounded-md border-gray-300 border p-2 focus:ring-green-500 focus:border-green-500"
                            required 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (Tons)</label>
                        <input 
                            type="number"
                            step="0.1"
                            name="quantity_tons" 
                            value={formData.quantity_tons} 
                            onChange={handleChange}
                            className="w-full rounded-md border-gray-300 border p-2 focus:ring-green-500 focus:border-green-500"
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Pickup Date</label>
                        <input 
                            type="date"
                            name="pickup_date" 
                            value={formData.pickup_date} 
                            onChange={handleChange}
                            className="w-full rounded-md border-gray-300 border p-2 focus:ring-green-500 focus:border-green-500"
                            required 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Address / Farm Location</label>
                    <textarea 
                        name="pickup_address" 
                        rows="2"
                        value={formData.pickup_address} 
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 border p-2 focus:ring-green-500 focus:border-green-500"
                        required 
                    />
                </div>

                <div className="flex gap-6 bg-gray-50 p-4 rounded-md border border-gray-200">
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                        <input 
                            type="checkbox" 
                            name="is_perishable"
                            checked={formData.is_perishable}
                            onChange={handleChange}
                            className="mr-2 rounded text-green-600 focus:ring-green-500" 
                        />
                        Highly Perishable
                    </label>
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                        <input 
                            type="checkbox" 
                            name="requires_cold_storage"
                            checked={formData.requires_cold_storage}
                            onChange={handleChange}
                            className="mr-2 rounded text-green-600 focus:ring-green-500" 
                        />
                        Requires Cold Storage
                    </label>
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition"
                    >
                        {isSubmitting ? 'Calculating Optimal Route...' : 'Submit Logistics Request'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateRequestPage;