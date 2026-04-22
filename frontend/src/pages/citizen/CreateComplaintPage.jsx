import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { complaintsAPI, intelligenceAPI } from '../../utils/api';

const CreateComplaintPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ title: '', description: '', location: '' });
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleTextChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Triggered by a button to analyze the text using your AI engine
    const handleAnalyze = async () => {
        if (!formData.title || !formData.description) return;
        setIsAnalyzing(true);
        try {
            const res = await intelligenceAPI.analyzeText(formData.title, formData.description);
            setAiAnalysis(res.data); // Expected: { category: 'theft', severity_score: 8.5, priority: 'high' }
        } catch (error) {
            console.error("AI Analysis failed", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Include AI data if it was generated
            const payload = {
                ...formData,
                ai_category: aiAnalysis?.category,
                severity_score: aiAnalysis?.severity_score
            };
            await complaintsAPI.create(payload);
            navigate('/dashboard'); // Go back to dashboard on success
        } catch (error) {
            console.error("Failed to submit complaint", error);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">File a New Complaint</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Incident Title</label>
                    <input 
                        name="title" 
                        value={formData.title} 
                        onChange={handleTextChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                        required 
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Detailed Description</label>
                    <textarea 
                        name="description" 
                        value={formData.description} 
                        onChange={handleTextChange}
                        rows="4" 
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                        required 
                    />
                </div>

                {/* AI Analysis trigger */}
                <button 
                    type="button" 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="bg-blue-100 text-blue-700 px-4 py-2 rounded text-sm font-semibold hover:bg-blue-200 disabled:opacity-50"
                >
                    {isAnalyzing ? 'Analyzing with AI...' : 'Pre-Analyze Incident'}
                </button>

                {/* Show AI Results if available */}
                {aiAnalysis && (
                    <div className="bg-gray-50 border-l-4 border-indigo-500 p-4 mt-4">
                        <h4 className="text-sm font-bold text-gray-700">AI Intelligence Report</h4>
                        <div className="mt-2 flex gap-4 text-sm">
                            <p><span className="font-semibold text-gray-600">Category:</span> {aiAnalysis.category}</p>
                            <p><span className="font-semibold text-gray-600">Priority:</span> {aiAnalysis.priority}</p>
                            <p><span className="font-semibold text-gray-600">Severity Score:</span> {aiAnalysis.severity_score}/10</p>
                        </div>
                    </div>
                )}

                <div className="pt-4">
                    <button 
                        type="submit" 
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                        Submit Official Report
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateComplaintPage;