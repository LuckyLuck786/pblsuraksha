import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { complaintsAPI } from '../../utils/api';

const CATEGORIES = [
  'Theft',
  'Assault',
  'Drug Activity',
  'Suspicious Activity',
  'Traffic',
  'Other',
];

const INITIAL_FORM = {
  title: '',
  category: '',
  description: '',
  location: '',
  incident_date: '',
};

export default function AnonymousTipPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    if (form.description && form.description.trim().length > 0 && form.description.trim().length < 20) {
      errs.description = 'Description must be at least 20 characters.';
    }
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '') delete payload[k];
      });
      const res = await complaintsAPI.submitAnonymousTip(payload);
      setSuccess(res.data);
      setForm(INITIAL_FORM);
      toast.success('Tip submitted successfully.');
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Submission failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSuccess(null);
    setForm(INITIAL_FORM);
    setErrors({});
  };

  if (success) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-6">
        <div className="bg-green-500/10 border border-green-500/40 rounded-xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-3xl">
            ✓
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Tip Submitted</h2>
            <p className="text-gray-400 text-sm">
              Your anonymous tip has been received. Your identity is fully protected.
            </p>
          </div>
          {success.complaint_id && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-4 w-full">
              <p className="text-xs text-gray-500 mb-1">Reference Number</p>
              <p className="text-lg font-mono font-bold text-indigo-400">
                #{success.complaint_id}
              </p>
              <p className="text-xs text-gray-600 mt-1">Save this for your records</p>
            </div>
          )}
          <button
            onClick={handleReset}
            className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
          >
            Submit another tip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="w-9 h-9 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center justify-center text-lg">
            🔒
          </span>
          Submit Anonymous Tip
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Report suspicious activity or incidents without revealing your identity
        </p>
      </div>

      <div className="flex items-start gap-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3.5">
        <span className="text-indigo-400 flex-shrink-0 mt-0.5">🛡</span>
        <p className="text-xs text-indigo-200 leading-relaxed">
          <strong className="text-indigo-300">Your identity is protected</strong> — we use cryptographic hashing
          to ensure complete anonymity. No personal data is stored or linked to this submission.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Brief title of the incident"
            className={`w-full bg-gray-900 border rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
              errors.title ? 'border-red-500' : 'border-gray-600'
            }`}
          />
          {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5">Category</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          >
            <option value="">Select a category (optional)</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Describe what you observed (optional, min 20 chars if provided)"
            rows={4}
            className={`w-full bg-gray-900 border rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition ${
              errors.description ? 'border-red-500' : 'border-gray-600'
            }`}
          />
          {errors.description && (
            <p className="text-xs text-red-400 mt-1">{errors.description}</p>
          )}
          {form.description && !errors.description && (
            <p className="text-xs text-gray-600 mt-1">{form.description.trim().length} characters</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5">Location</label>
          <input
            type="text"
            name="location"
            value={form.location}
            onChange={handleChange}
            placeholder="Street / area / landmark"
            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1.5">Incident Date</label>
          <input
            type="date"
            name="incident_date"
            value={form.incident_date}
            onChange={handleChange}
            max={new Date().toISOString().split('T')[0]}
            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition [color-scheme:dark]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Submitting…
            </>
          ) : (
            'Submit Anonymously'
          )}
        </button>
      </form>
    </div>
  );
}
