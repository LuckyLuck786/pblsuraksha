import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { transportAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const CROP_TYPES = [
  { value: 'vegetables', label: 'Vegetables', icon: '🥬' },
  { value: 'fruits', label: 'Fruits', icon: '🍎' },
  { value: 'grains', label: 'Grains', icon: '🌾' },
  { value: 'pulses', label: 'Pulses', icon: '🫘' },
  { value: 'dairy', label: 'Dairy', icon: '🥛' },
];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const CreateRequestPage = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    crop_type: 'vegetables',
    crop_name: '',
    quantity_tons: '',
    is_perishable: false,
    requires_cold_storage: false,
    pickup_address: '',
    pickup_date: tomorrow(),
  });

  const update = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.crop_name.trim()) { toast.error('Please enter the crop name'); return; }
    if (!form.quantity_tons || Number(form.quantity_tons) <= 0) { toast.error('Please enter a valid quantity'); return; }
    if (!form.pickup_address.trim()) { toast.error('Please enter your pickup address'); return; }

    setIsSubmitting(true);
    try {
      await transportAPI.create({
        ...form,
        quantity_tons: Number(form.quantity_tons),
        pickup_latitude: 12.9716,
        pickup_longitude: 77.5946,
      });
      toast.success('Transport request submitted! AI is routing your shipment.');
      navigate('/transport/dashboard');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to submit request. Please try again.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCrop = CROP_TYPES.find(c => c.value === form.crop_type);

  return (
    <div className="max-w-2xl mx-auto p-5 fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-emerald-400">🚜</span>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Transport Logistics</p>
        </div>
        <h1 className="text-2xl font-extrabold text-white">Schedule Crop Transport</h1>
        <p className="text-gray-400 text-sm mt-1">AI will automatically route your harvest to the optimal storage facility</p>
      </div>

      {/* AI routing banner */}
      <div className="mb-6 flex items-start gap-3 p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-xl">
        <span className="text-2xl flex-shrink-0">🤖</span>
        <div>
          <p className="text-sm font-semibold text-emerald-300">AI-Powered Route Optimization</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">Our system analyzes distance, capacity, cold storage availability, and urgency to find the best facility for your produce.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Crop Type selector */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-3">Crop Type</label>
          <div className="grid grid-cols-5 gap-2">
            {CROP_TYPES.map(ct => (
              <button
                key={ct.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, crop_type: ct.value }))}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                  form.crop_type === ct.value
                    ? 'border-emerald-500 bg-emerald-900/30 shadow-lg shadow-emerald-900/20'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <span className="text-xl">{ct.icon}</span>
                <span className={`text-xs font-medium ${form.crop_type === ct.value ? 'text-emerald-300' : 'text-gray-400'}`}>{ct.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Crop name & Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {selectedCrop?.icon} Crop Name *
            </label>
            <input
              name="crop_name"
              value={form.crop_name}
              onChange={update}
              placeholder="e.g., Tomatoes, Wheat"
              required
              className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Quantity (Tons) *</label>
            <div className="relative">
              <input
                type="number"
                name="quantity_tons"
                value={form.quantity_tons}
                onChange={update}
                min="0.1"
                step="0.1"
                placeholder="0.0"
                required
                className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">tons</span>
            </div>
          </div>
        </div>

        {/* Pickup date */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">📅 Scheduled Pickup Date *</label>
          <input
            type="date"
            name="pickup_date"
            value={form.pickup_date}
            onChange={update}
            min={tomorrow()}
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </div>

        {/* Pickup address */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">📍 Pickup Address / Farm Location *</label>
          <textarea
            name="pickup_address"
            value={form.pickup_address}
            onChange={update}
            rows={3}
            placeholder="Village, Taluk, District (e.g., Doddaballapur, Bengaluru Rural)"
            required
            className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">GPS coordinates will be resolved automatically from your address</p>
        </div>

        {/* Checkboxes */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'is_perishable', icon: '⚡', label: 'Highly Perishable', desc: 'Needs urgent transport', checked: form.is_perishable },
            { name: 'requires_cold_storage', icon: '❄️', label: 'Requires Cold Storage', desc: 'Temperature-controlled facility', checked: form.requires_cold_storage },
          ].map(opt => (
            <label
              key={opt.name}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                opt.checked
                  ? 'border-emerald-500 bg-emerald-900/20'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                name={opt.name}
                checked={opt.checked}
                onChange={update}
                className="sr-only"
              />
              <span className="text-xl flex-shrink-0">{opt.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${opt.checked ? 'text-emerald-300' : 'text-gray-300'}`}>{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
              {opt.checked && (
                <svg className="w-4 h-4 text-emerald-400 ml-auto flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </label>
          ))}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-900/40 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Calculating Optimal Route...
            </>
          ) : (
            <>🚚 Submit Transport Request</>
          )}
        </button>
      </form>
    </div>
  );
};

export default CreateRequestPage;
