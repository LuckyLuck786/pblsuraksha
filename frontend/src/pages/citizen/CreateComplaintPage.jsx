import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { complaintsAPI, intelligenceAPI } from '../../utils/api';

const PRIORITY_COLORS = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high    : 'bg-orange-100 text-orange-800 border-orange-300',
    medium  : 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low     : 'bg-green-100 text-green-800 border-green-300',
};

const PROVIDER_COLORS = {
    'groq-llama'      : { bg: 'bg-violet-50',  border: 'border-violet-200', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
    'groq-qwen'       : { bg: 'bg-indigo-50',  border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
    'cerebras-gptoss' : { bg: 'bg-purple-50',  border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
    'gemini'          : { bg: 'bg-blue-50',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-800',     dot: 'bg-blue-500'   },
    'rule-based'      : { bg: 'bg-gray-50',    border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400'   },
};

function AgreementBanner({ results }) {
    const successful = results.filter(r => r.success);
    if (successful.length < 2) return null;
    const categories = successful.map(r => r.category);
    const priorities = successful.map(r => r.priority);
    const catAgree = categories.every(c => c === categories[0]);
    const priAgree = priorities.every(p => p === priorities[0]);
    if (catAgree && priAgree) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                All models agree — Category: <strong>{categories[0]}</strong>, Priority: <strong>{priorities[0]?.toUpperCase()}</strong>
            </div>
        );
    }
    if (!catAgree && !priAgree) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Models disagree on both category and priority — review carefully
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            Partial agreement — {catAgree ? 'category matches' : 'categories differ'}, {priAgree ? 'priority matches' : 'priorities differ'}
        </div>
    );
}

function ProviderCard({ result }) {
    const cfg = PROVIDER_COLORS[result.provider_key] || PROVIDER_COLORS['rule-based'];
    return (
        <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3`}>
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-xs font-bold text-gray-700 leading-tight">{result.provider_label}</span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">{result.latency_ms}ms</span>
            </div>

            {result.success ? (
                <>
                    {/* Category + Priority + Severity */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/80 rounded-lg p-2 text-center">
                            <p className="text-xs text-gray-400 mb-0.5">Category</p>
                            <p className="text-xs font-bold text-gray-800 capitalize leading-tight">{result.category?.replace('_', ' ')}</p>
                        </div>
                        <div className="bg-white/80 rounded-lg p-2 text-center">
                            <p className="text-xs text-gray-400 mb-0.5">Priority</p>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${PRIORITY_COLORS[result.priority] || 'bg-gray-100 text-gray-700'}`}>
                                {result.priority?.toUpperCase()}
                            </span>
                        </div>
                        <div className="bg-white/80 rounded-lg p-2 text-center">
                            <p className="text-xs text-gray-400 mb-0.5">Severity</p>
                            <p className="text-xs font-bold text-gray-800">{result.severity_score}/10</p>
                        </div>
                    </div>

                    {/* Summary */}
                    {result.summary && (
                        <p className="text-xs text-gray-600 italic leading-relaxed">{result.summary}</p>
                    )}
                </>
            ) : (
                <div className="flex items-center gap-2 text-xs text-red-500">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Provider unavailable</span>
                </div>
            )}
        </div>
    );
}

const CreateComplaintPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        incident_location: '',
        incident_address: '',
        is_anonymous: false,
    });
    const [allAnalyses, setAllAnalyses] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [duplicateWarning, setDuplicateWarning] = useState(null);

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
        setAllAnalyses(null);
        setDuplicateWarning(null);
        try {
            // Run AI analysis + duplicate check in parallel
            const [analysisRes, dupRes] = await Promise.allSettled([
                intelligenceAPI.analyzeAll(formData.title, formData.description),
                intelligenceAPI.checkDuplicate(formData.title, formData.description, formData.incident_location),
            ]);

            if (analysisRes.status === 'fulfilled') {
                setAllAnalyses(analysisRes.value.data.results);
                const successCount = analysisRes.value.data.results.filter(r => r.success).length;
                toast.success(`Analysis complete — ${successCount}/4 models responded`);
            } else {
                toast.error('AI analysis failed. You can still submit the complaint.');
            }

            if (dupRes.status === 'fulfilled' && dupRes.value.data?.is_duplicate) {
                setDuplicateWarning(dupRes.value.data);
            }
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
                        Your report is powered by AI — all 3 models analyze severity simultaneously.
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

                    {/* Analyze button */}
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
                                    Analyzing with all models...
                                </>
                            ) : (
                                <>⚡ Analyze with All Models</>
                            )}
                        </button>
                        <span className="text-xs text-gray-400">Groq (×3 models) + Gemini + Rule-based in parallel</span>
                    </div>

                    {/* Duplicate Warning */}
                    {duplicateWarning && (
                        <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-4">
                            <div className="flex items-start gap-3">
                                <span className="text-xl mt-0.5">⚠️</span>
                                <div>
                                    <p className="text-sm font-bold text-amber-800">Possible Duplicate Detected</p>
                                    <p className="text-xs text-amber-700 mt-1">{duplicateWarning.reason}</p>
                                    <p className="text-xs text-amber-600 mt-1">
                                        Similarity: <strong>{Math.round((duplicateWarning.similarity_score || 0) * 100)}%</strong>
                                        {duplicateWarning.likely_match_id && ` · Possible match: ${duplicateWarning.likely_match_id}`}
                                    </p>
                                    <p className="text-xs text-amber-600 mt-1">You can still submit — our officers will review both cases.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* All Models Results */}
                    {allAnalyses && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-gray-700">🤖 AI Intelligence Report — All Models</h4>
                                <span className="text-xs text-gray-400">{allAnalyses.filter(r => r.success).length}/4 responded</span>
                            </div>
                            <AgreementBanner results={allAnalyses} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {allAnalyses.map((result) => (
                                    <ProviderCard key={result.provider_key} result={result} />
                                ))}
                            </div>
                            {/* IPC Sections from best model */}
                            {(() => {
                                const best = allAnalyses.find(r => r.success && r.ipc_sections?.length);
                                return best?.ipc_sections?.length ? (
                                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                                        <p className="text-xs font-semibold text-purple-700 mb-2">⚖️ Applicable IPC / IT Act Sections</p>
                                        <div className="flex flex-wrap gap-2">
                                            {best.ipc_sections.map(s => (
                                                <span key={s} className="text-xs px-2 py-1 rounded-full bg-purple-100 border border-purple-300 text-purple-800 font-medium">{s}</span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}
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

                    {/* Anonymous */}
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
