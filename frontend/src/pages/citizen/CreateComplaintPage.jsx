import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { complaintsAPI, intelligenceAPI } from '../../utils/api';

const PRIORITY_COLORS = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-green-100 text-green-800 border-green-300',
};

const CreateComplaintPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        incident_location: '',
        incident_address: '',
        is_anonymous: false,
    });
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleAnalyze = async () => {
        if (!formData.title.trim() || !formData.description.trim()) {
            toast.error('Please fill in the title and description first.');
            return;
        }
        setIsAnalyzing(true);
        setAiAnalysis(null);
        try {
            const res = await intelligenceAPI.analyzeText(formData.title, formData.description);
            setAiAnalysis(res.data);
            toast.success('AI analysis complete!');
        } catch (error) {
            toast.error('AI analysis failed. You can still submit the complaint.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const validate = () => {
        const errs = {};
        if (formData.title.trim().length < 10) errs.title = 'Title must be at least 10 characters.';
        if (formData.description.trim().length < 30) errs.description = 'Description must be at least 30 characters.';
        if (!formData.incident_location.trim()) errs.incident_location = 'Incident location is required.';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setIsSubmitting(true);
        try {
            await complaintsAPI.create(formData);
            toast.success('Complaint submitted successfully!');
            navigate('/citizen/complaints');
        } catch (error) {
            const detail = error.response?.data;
            if (detail && typeof detail === 'object') {
                setErrors(detail);
                toast.error('Please fix the errors below.');
            } else {
                toast.error('Failed to submit complaint. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6 mt-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-indigo-600 px-6 py-4">
                    <h2 className="text-2xl font-bold text-white">File a New Complaint</h2>
                    <p className="text-indigo-200 text-sm mt-1">
                        Your report is powered by AI — we'll analyze severity automatically.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Title */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Incident Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            placeholder="e.g. Theft at MG Road bus stop"
                            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.title ? 'border-red-400' : 'border-gray-300'}`}
                        />
                        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Detailed Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={5}
                            placeholder="Describe what happened, who was involved, and any other relevant details..."
                            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.description ? 'border-red-400' : 'border-gray-300'}`}
                        />
                        {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                    </div>

                    {/* AI Analyze Button */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100 disabled:opacity-50 transition"
                        >
                            {isAnalyzing ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                    </svg>
                                    Analyzing with AI...
                                </>
                            ) : (
                                <>⚡ Analyze with AI</>
                            )}
                        </button>
                        <span className="text-xs text-gray-400">Powered by Groq + Gemini</span>
                    </div>

                    {/* AI Analysis Result */}
                    {aiAnalysis && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                            <h4 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2">
                                🤖 AI Intelligence Report
                                {aiAnalysis.ai_provider && (
                                    <span className="text-xs font-normal text-indigo-500">via {aiAnalysis.ai_provider}</span>
                                )}
                            </h4>
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <div className="bg-white rounded-md p-2 text-center border border-indigo-100">
                                    <p className="text-xs text-gray-500">Category</p>
                                    <p className="text-sm font-bold text-gray-800 capitalize">{aiAnalysis.category?.replace('_', ' ')}</p>
                                </div>
                                <div className="bg-white rounded-md p-2 text-center border border-indigo-100">
                                    <p className="text-xs text-gray-500">Priority</p>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[aiAnalysis.priority] || 'bg-gray-100 text-gray-700'}`}>
                                        {aiAnalysis.priority?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="bg-white rounded-md p-2 text-center border border-indigo-100">
                                    <p className="text-xs text-gray-500">Severity</p>
                                    <p className="text-sm font-bold text-gray-800">{aiAnalysis.severity_score}/10</p>
                                </div>
                            </div>
                            {aiAnalysis.summary && (
                                <p className="text-xs text-indigo-700 italic">{aiAnalysis.summary}</p>
                            )}
                        </div>
                    )}

                    {/* Location */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Incident Location <span className="text-red-500">*</span>
                        </label>
                        <input
                            name="incident_location"
                            value={formData.incident_location}
                            onChange={handleChange}
                            placeholder="e.g. MG Road, Bangalore"
                            className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.incident_location ? 'border-red-400' : 'border-gray-300'}`}
                        />
                        {errors.incident_location && <p className="text-red-500 text-xs mt-1">{errors.incident_location}</p>}
                    </div>

                    {/* Full Address */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Full Address (optional)</label>
                        <input
                            name="incident_address"
                            value={formData.incident_address}
                            onChange={handleChange}
                            placeholder="Street, Area, City, Pincode"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Anonymous option */}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <input
                            type="checkbox"
                            id="is_anonymous"
                            name="is_anonymous"
                            checked={formData.is_anonymous}
                            onChange={handleChange}
                            className="h-4 w-4 text-indigo-600 rounded"
                        />
                        <label htmlFor="is_anonymous" className="text-sm text-gray-700">
                            <span className="font-semibold">Submit anonymously</span>
                            <span className="text-gray-500"> — your identity will be hidden from authorities</span>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => navigate('/citizen/complaints')}
                            className="flex-1 py-2 px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Official Report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateComplaintPage;
