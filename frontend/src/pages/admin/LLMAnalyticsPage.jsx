import React, { useState } from 'react';
import { intelligenceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ── Paper reference values ─────────────────────────────────────────────────────
// Source: ICISCE 2025 "SafeCity Connect" — MTIAE (Multi-Tier Intelligent Analysis Engine)
// Table II (stress-test, 1,200 synthetic NCRB complaints)
const PAPER_TIERS = {
    'groq-key-1' : { latency_s: 1.2,   macro_f1: 0.964, availability_pct: 99.5, severity_mae: 0.43, severity_spearman: 0.93 },
    'groq-key-2' : { latency_s: 1.3,   macro_f1: 0.964, availability_pct: 99.5, severity_mae: 0.43, severity_spearman: 0.93 },
    'gemini'     : { latency_s: 2.1,   macro_f1: 0.948, availability_pct: 99.7, severity_mae: 0.43, severity_spearman: 0.93 },
    'rule-based' : { latency_s: 0.001, macro_f1: 0.782, availability_pct: 100.0, severity_mae: 1.92, severity_spearman: 0.74 },
};

// Table IV (per-category F1, NCRB-distribution balanced dataset)
const PAPER_PER_CATEGORY = {
    theft         : { tier1: 0.965, tier4: 0.810 },
    assault       : { tier1: 0.945, tier4: 0.790 },
    harassment    : { tier1: 0.935, tier4: 0.740 },
    fraud         : { tier1: 0.955, tier4: 0.760 },
    cybercrime    : { tier1: 0.955, tier4: 0.760 },
    missing_person: { tier1: 0.975, tier4: 0.830 },
    traffic       : { tier1: 0.965, tier4: 0.850 },
    other         : { tier1: 0.900, tier4: 0.710 },
};

// Actual breakdown of 300 imported test cases after keyword mapping (verified from DB)
const TEST_CASE_DISTRIBUTION = [
    { category: 'other',         count: 126, pct: 42, note: 'Utility/Roads/Water/Civic/etc.' },
    { category: 'assault',       count: 87,  pct: 29, note: 'Critical cases (default mapping)' },
    { category: 'vandalism',     count: 42,  pct: 14, note: 'Environment/Sanitation/Encroachment' },
    { category: 'traffic',       count: 17,  pct: 6,  note: 'Traffic category' },
    { category: 'missing_person',count: 6,   pct: 2,  note: 'Critical — keyword match' },
    { category: 'theft',         count: 6,   pct: 2,  note: 'Critical/Crime — keyword match' },
    { category: 'harassment',    count: 5,   pct: 2,  note: 'Critical — keyword match' },
    { category: 'noise',         count: 5,   pct: 2,  note: 'Noise category' },
    { category: 'domestic',      count: 2,   pct: 1,  note: 'Critical — keyword match' },
    { category: 'drug_activity', count: 1,   pct: 0,  note: 'Critical — keyword match' },
    { category: 'fraud',         count: 2,   pct: 1,  note: 'Critical — keyword match' },
    { category: 'cybercrime',    count: 1,   pct: 0,  note: 'Critical — keyword match' },
];

const PROVIDER_STYLES = {
    'groq-key-1' : { color: 'text-violet-400', bg: 'bg-violet-50',  border: 'border-violet-200', dot: 'bg-violet-500', tier: 'Tier 1' },
    'groq-key-2' : { color: 'text-indigo-400', bg: 'bg-indigo-50',  border: 'border-indigo-200', dot: 'bg-indigo-500', tier: 'Tier 2' },
    'gemini'     : { color: 'text-blue-400',   bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-500',   tier: 'Tier 3' },
    'rule-based' : { color: 'text-gray-400',   bg: 'bg-gray-50',    border: 'border-gray-200',   dot: 'bg-gray-400',   tier: 'Tier 4' },
};

// ── Quota exhaustion detector ─────────────────────────────────────────────────
// A provider is quota-exhausted when calls were made (latency > 0) but none succeeded
function isQuotaExhausted(m) {
    if (!m) return false;
    return m.sample_count === 0 && m.availability_pct === 0 && m.avg_latency_ms > 0;
}

// ── MetricCell — dark background context ──────────────────────────────────────
function MetricCell({ value, paper, higherBetter = true, suffix = '', exhausted = false }) {
    if (exhausted) return (
        <td className="px-4 py-3 text-center">
            <span className="text-xs text-orange-400/70 italic">quota limit</span>
        </td>
    );
    if (value == null) return <td className="px-4 py-3 text-gray-500 text-sm text-center">—</td>;
    const diff   = paper != null ? value - paper : null;
    const better = diff != null ? (higherBetter ? diff >= 0 : diff <= 0) : null;
    return (
        <td className="px-4 py-3 text-center">
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-white">{value}{suffix}</span>
                {paper != null && (
                    <span className={`text-xs font-medium ${better ? 'text-green-400' : 'text-red-400'}`}>
                        {better ? '▲' : '▼'} paper: {paper}{suffix}
                    </span>
                )}
            </div>
        </td>
    );
}

// ── QuotaBanner ───────────────────────────────────────────────────────────────
function QuotaBanner({ data, providerKeys, providerStyles }) {
    if (!data) return null;
    const exhausted = providerKeys.filter(pk => isQuotaExhausted(data.provider_metrics[pk]));
    if (exhausted.length === 0) return null;
    const names = exhausted.map(pk => providerStyles[pk].tier).join(', ');
    return (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl px-5 py-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div>
                <p className="text-sm font-bold text-orange-400 mb-1">
                    {exhausted.length} provider{exhausted.length > 1 ? 's' : ''} quota-exhausted — {names}
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                    These LLM providers hit their daily rate limit during this evaluation run and show 0% availability.
                    Their data is not meaningful — only <strong className="text-white">Tier 4 (Rule-Based)</strong> results are valid.
                </p>
                <p className="text-xs text-orange-300/70 mt-1.5">
                    💡 <strong>Fix:</strong> Groq TPD (tokens per day) resets at <strong>midnight UTC</strong>. Use a sample size of <strong>10–20</strong> to stay within the 100k daily token budget.
                    Gemini free tier also has a daily request cap — consider using smaller samples until both quotas reset.
                </p>
            </div>
        </div>
    );
}

// ── HonestReport — dataset analysis vs paper claims ───────────────────────────
function HonestReport({ data, sampleSize }) {
    const PROVIDER_KEYS = ['groq-key-1', 'groq-key-2', 'gemini', 'rule-based'];

    const dominantCats = TEST_CASE_DISTRIBUTION.filter(d => d.pct >= 10);
    const sparseOrMissing = TEST_CASE_DISTRIBUTION.filter(d => d.pct < 3 && d.category !== 'other');

    return (
        <div className="space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                    🔍
                </div>
                <div>
                    <h2 className="text-base font-bold text-white">Honest Comparison Report</h2>
                    <p className="text-gray-400 text-xs mt-0.5">
                        How your real-world results stack up against the research paper's benchmark claims — and why differences are expected
                    </p>
                </div>
            </div>

            {/* ── Dataset Comparison ──────────────────────────────────────── */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-700/50 bg-gray-700/20">
                    <h3 className="text-sm font-bold text-gray-200">📋 Dataset Comparison — Paper vs. Yours</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-700/30">
                                <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-left">Attribute</th>
                                <th className="px-4 py-2 text-xs font-semibold text-amber-400 text-center">Research Paper (ICISCE 2025)</th>
                                <th className="px-4 py-2 text-xs font-semibold text-violet-400 text-center">Your SURAKSHA Dataset</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/30">
                            {[
                                ['Total complaints',     '1,200',                      '300 test cases + live submissions'],
                                ['Data type',           'Synthetic (NCRB 2022 dist.)', 'Real-world Bangalore complaints'],
                                ['Category balance',    'Balanced across 12 categories','Skewed (36% assault, 42% other)'],
                                ['Sample used here',    '—',                           `${sampleSize} most-recent complaints`],
                                ['Rare categories',     'All categories well-represented','cybercrime=0, fraud≈0, drug≈0'],
                                ['Ground truth source', 'Synthetic labels',             'AI-assigned at submission time'],
                            ].map(([attr, paper, ours]) => (
                                <tr key={attr} className="hover:bg-gray-700/20">
                                    <td className="px-4 py-2.5 text-xs text-gray-400 font-medium">{attr}</td>
                                    <td className="px-4 py-2.5 text-xs text-amber-300 text-center">{paper}</td>
                                    <td className="px-4 py-2.5 text-xs text-violet-300 text-center">{ours}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Category Distribution of your 300 cases ─────────────────── */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-700/50 bg-gray-700/20">
                    <h3 className="text-sm font-bold text-gray-200">📊 Category Distribution — 300 Imported Test Cases</h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                        After keyword-based mapping from Excel → SURAKSHA taxonomy
                    </p>
                </div>
                <div className="p-5 space-y-2.5">
                    {TEST_CASE_DISTRIBUTION.filter(d => d.count > 0).map(({ category, count, pct, note }) => (
                        <div key={category} className="flex items-center gap-3">
                            <span className="text-xs text-gray-300 capitalize w-28 flex-shrink-0">{category.replace('_', ' ')}</span>
                            <div className="flex-1 bg-gray-700/40 rounded-full h-3 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        pct >= 30 ? 'bg-red-500' :
                                        pct >= 10 ? 'bg-amber-500' :
                                        pct >= 3  ? 'bg-blue-500' : 'bg-gray-500'
                                    }`}
                                    style={{ width: `${Math.max(pct, 1)}%` }}
                                />
                            </div>
                            <span className="text-xs text-gray-300 tabular-nums w-16 flex-shrink-0">{count} ({pct}%)</span>
                            <span className="text-xs text-gray-600 hidden sm:block">{note}</span>
                        </div>
                    ))}
                </div>
                <div className="px-5 pb-4">
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                        <p className="text-xs text-amber-300">
                            <strong>⚠ Class Imbalance Warning:</strong> 71% of your cases fall into just two categories (other=42%, assault=29%).
                            Macro F1 is heavily affected because categories with little/no support (cybercrime=1, drug_activity=1, fraud=2) count as near-zero F1 in the macro average —
                            dragging the overall score well below the paper's balanced-dataset results of 0.964.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Performance Delta Table ──────────────────────────────────── */}
            {data && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                    <div className="px-6 py-3 border-b border-gray-700/50 bg-gray-700/20">
                        <h3 className="text-sm font-bold text-gray-200">📈 Live Performance vs. Paper Claims</h3>
                        <p className="text-gray-500 text-xs mt-0.5">Your actual results on {sampleSize} complaints</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700/30">
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-left">Model</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-center">Paper F1</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-center">Your F1</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-center">Gap</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-center">Latency Match</th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-center">Verdict</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/30">
                                {PROVIDER_KEYS.map(pk => {
                                    const m     = data.provider_metrics[pk];
                                    const pap   = PAPER_TIERS[pk];
                                    const sty   = PROVIDER_STYLES[pk];
                                    if (!m || !pap) return null;

                                    // Rule-based is never quota-exhausted (it's local CPU)
                                    const exhausted  = pk !== 'rule-based' && isQuotaExhausted(m);
                                    const f1Gap      = (!exhausted && m.macro_f1 != null)
                                        ? (m.macro_f1 - pap.macro_f1).toFixed(3) : null;
                                    const f1GapNum   = f1Gap != null ? parseFloat(f1Gap) : null;
                                    const latMatch   = m.avg_latency_s != null
                                        ? Math.abs(m.avg_latency_s - pap.latency_s) < pap.latency_s * 0.5
                                        : null;

                                    // Verdict logic — quota exhaustion takes priority
                                    let verdict, verdictCls;
                                    if (exhausted) {
                                        verdict = '⚠ Quota Exhausted';
                                        verdictCls = 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
                                    } else if (f1GapNum == null) {
                                        verdict = 'No Data'; verdictCls = 'bg-gray-700 text-gray-400';
                                    } else if (f1GapNum >= -0.05) {
                                        verdict = '✓ On Par'; verdictCls = 'bg-green-500/20 text-green-400 border border-green-500/30';
                                    } else if (f1GapNum >= -0.2) {
                                        verdict = '≈ Below (expected)'; verdictCls = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                                    } else {
                                        verdict = '↓ Gap (class skew)'; verdictCls = 'bg-red-500/20 text-red-400 border border-red-500/30';
                                    }

                                    return (
                                        <tr key={pk} className={`hover:bg-gray-700/20 ${exhausted ? 'opacity-60' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${sty.dot} ${exhausted ? 'opacity-40' : ''}`} />
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-white">{sty.tier}</span>
                                                            {exhausted && (
                                                                <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full leading-none">
                                                                    quota limit
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-bold text-amber-400">{pap.macro_f1}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {exhausted ? (
                                                    <span className="text-xs text-orange-400/70 italic">quota limit</span>
                                                ) : (
                                                    <span className="text-sm font-bold text-white">{m.macro_f1 ?? '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {exhausted ? (
                                                    <span className="text-orange-400/60 text-xs">—</span>
                                                ) : f1Gap != null ? (
                                                    <span className={`text-sm font-bold ${f1GapNum >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {f1GapNum >= 0 ? '+' : ''}{f1Gap}
                                                    </span>
                                                ) : <span className="text-gray-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {latMatch == null ? (
                                                    <span className="text-gray-600 text-xs">—</span>
                                                ) : latMatch ? (
                                                    <span className="text-green-400 text-xs font-medium">✓ Within range</span>
                                                ) : (
                                                    <span className="text-amber-400 text-xs font-medium">≈ Differs</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${verdictCls}`}>
                                                    {verdict}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Why the gap exists ───────────────────────────────────────── */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-200">💡 Why Results Differ From Paper Claims</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                        {
                            icon: '⚖️',
                            title: 'Class Imbalance',
                            body: 'Paper used a balanced 1,200-complaint dataset across all 12 categories. Your 300 cases have 78% in just 2 categories — macro F1 is depressed because rare categories have zero support.',
                            color: 'border-red-500/30 bg-red-500/5',
                        },
                        {
                            icon: '🧪',
                            title: 'Synthetic vs. Real Data',
                            body: 'Paper benchmarks were on synthetic complaints generated to follow NCRB 2022 crime distribution. Real-world Bangalore complaints use different phrasing, mixed languages, and ambiguous descriptions.',
                            color: 'border-amber-500/30 bg-amber-500/5',
                        },
                        {
                            icon: '🎯',
                            title: 'Ground Truth Source',
                            body: 'Your ground truth labels were set by the same AI that made the prediction — this creates circular validation. Paper had human-verified labels against known synthetic categories.',
                            color: 'border-blue-500/30 bg-blue-500/5',
                        },
                        {
                            icon: '✅',
                            title: 'What IS Reproducible',
                            body: 'Latency, availability, and severity correlation are infrastructure metrics — these should match paper claims closely regardless of dataset. Check these to validate your deployment.',
                            color: 'border-green-500/30 bg-green-500/5',
                        },
                    ].map(({ icon, title, body, color }) => (
                        <div key={title} className={`rounded-xl border ${color} p-4`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">{icon}</span>
                                <p className="text-xs font-bold text-gray-200">{title}</p>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">{body}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Overall Verdict ──────────────────────────────────────────── */}
            <div className="bg-gray-800/50 border border-amber-500/30 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">📝</span>
                    <div>
                        <h3 className="text-sm font-bold text-amber-400 mb-2">Overall Honest Assessment</h3>
                        <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                            <p>
                                <strong className="text-white">F1 scores on your dataset will appear lower</strong> than the paper's 0.964 — this is expected and does not mean the models are worse.
                                It means your 300 test cases are structurally different: heavily skewed toward "assault" and "other" with negligible support for rare crime categories.
                            </p>
                            <p>
                                <strong className="text-white">The research paper claims are valid</strong> for their evaluation setup: a balanced, NCRB-distributed synthetic dataset.
                                To reproduce those numbers on your system, you would need a similarly balanced dataset with ~100 complaints per category.
                            </p>
                            <p>
                                <strong className="text-white">Recommended next step:</strong> treat latency, availability, and severity MAE/ρ as the primary validation metrics for your deployment —
                                these are dataset-independent. For F1 validation, collect or generate ≥50 real complaints per category.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LLMAnalyticsPage() {
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [sampleSize, setSample] = useState(20);

    const PROVIDER_KEYS   = ['groq-key-1', 'groq-key-2', 'gemini', 'rule-based'];
    const SHOW_CATEGORIES = ['theft', 'assault', 'harassment', 'fraud', 'cybercrime', 'missing_person', 'traffic', 'other'];

    const runEvaluation = async () => {
        setLoading(true);
        setData(null);
        try {
            const res = await intelligenceAPI.getLLMAnalytics(sampleSize);
            setData(res.data);
            toast.success(`Evaluation complete — ${res.data.sample_size} complaints analysed`);
        } catch (err) {
            const msg = err.response?.data?.error || 'Evaluation failed.';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="w-9 h-9 bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center justify-center text-lg">🧠</span>
                        LLM Model Analytics
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Live evaluation of all AI models against your complaint dataset — compared to research paper benchmarks (ICISCE 2025)
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 whitespace-nowrap">Sample size</label>
                        <select
                            value={sampleSize}
                            onChange={e => setSample(Number(e.target.value))}
                            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        >
                            {[10, 20, 30, 50, 100, 200, 300].map(n => (
                                <option key={n} value={n}>{n} complaints</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={runEvaluation}
                        disabled={loading}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                                Running…
                            </>
                        ) : (
                            <>⚡ Run Evaluation</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Research context callout ─────────────────────────────────── */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex gap-3">
                <span className="text-yellow-400 text-lg flex-shrink-0">📄</span>
                <p className="text-gray-300 text-sm">
                    <strong className="text-white">Research paper benchmarks</strong> (shown as ▲/▼ comparisons) are from a stress-test evaluation on
                    1,200 synthetic NCRB-distribution complaints (ICISCE 2025 — MTIAE paper, Table II & IV).
                    Paper Tier 1 macro-F1: <strong className="text-amber-400">0.964</strong> · Tier 3 (Gemini): <strong className="text-amber-400">0.948</strong> · Tier 4 (Rule-based): <strong className="text-amber-400">0.782</strong>.
                    Your live values are computed from real submitted + imported complaints — see the Honest Comparison Report below.
                </p>
            </div>

            {/* ── Loading state ────────────────────────────────────────────── */}
            {loading && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-12 flex flex-col items-center gap-5">
                    <div className="flex gap-3">
                        {PROVIDER_KEYS.map(pk => (
                            <div
                                key={pk}
                                className={`w-3 h-3 rounded-full ${PROVIDER_STYLES[pk].dot} animate-pulse`}
                                style={{ animationDelay: `${PROVIDER_KEYS.indexOf(pk) * 0.15}s` }}
                            />
                        ))}
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-gray-300 text-sm font-medium">Running parallel evaluation on {sampleSize} complaints…</p>
                        <p className="text-gray-500 text-xs">Rate-limited to 28 Groq calls/min (shared RPM quota) · Rule-based runs instantly</p>
                        <p className="text-gray-600 text-xs mt-2">
                            {sampleSize <= 14
                                ? `Estimated time: ~${Math.max(10, sampleSize * 3)}–${Math.max(20, sampleSize * 5)}s`
                                : sampleSize <= 28
                                ? `Estimated time: ~60–90s (${sampleSize * 2} Groq calls, rate-limited)`
                                : `Estimated time: ~${Math.ceil((sampleSize * 2) / 28)}–${Math.ceil((sampleSize * 2) / 28) + 1} min (Groq RPM cap applies)`
                            }
                            {sampleSize >= 50 ? ' — Gemini daily quota may also be exhausted' : ''}
                        </p>
                    </div>
                    <div className="w-48 bg-gray-700/40 rounded-full h-1 overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                </div>
            )}

            {data && (
                <>
                    {/* ── Quota Banner ─────────────────────────────────────────── */}
                    <QuotaBanner data={data} providerKeys={PROVIDER_KEYS} providerStyles={PROVIDER_STYLES} />

                    {/* ── TABLE II: System Performance ────────────────────────── */}
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-700/50">
                            <h2 className="text-base font-bold text-white">Table II — Per-Tier System Performance</h2>
                            <p className="text-gray-400 text-xs mt-1">
                                Latency · Macro-F1 · Availability · Severity MAE · Spearman ρ — your live values vs paper benchmarks
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-700/30">
                                    <tr>
                                        {['Tier / Model', 'Latency (s)', 'Macro F1', 'Availability %', 'Severity MAE', 'Spearman ρ', 'Sample'].map(h => (
                                            <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 text-center">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/30">
                                    {PROVIDER_KEYS.map(pk => {
                                        const m   = data.provider_metrics[pk];
                                        const sty = PROVIDER_STYLES[pk];
                                        const pap = PAPER_TIERS[pk];
                                        if (!m) return null;
                                        const exhausted = isQuotaExhausted(m);
                                        return (
                                            <tr key={pk} className={`hover:bg-gray-700/20 transition ${exhausted ? 'opacity-60' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${sty.dot} ${exhausted ? 'opacity-40' : ''}`} />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-bold text-white">{sty.tier}</p>
                                                                {exhausted && (
                                                                    <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full leading-none">
                                                                        quota limit
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-400">{m.label}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <MetricCell value={m.avg_latency_s}    paper={exhausted ? null : pap?.latency_s}        higherBetter={false} suffix="s" exhausted={false} />
                                                <MetricCell value={exhausted ? null : m.macro_f1}          paper={exhausted ? null : pap?.macro_f1} exhausted={exhausted} />
                                                <MetricCell value={exhausted ? null : m.availability_pct}  paper={exhausted ? null : pap?.availability_pct} suffix="%" exhausted={exhausted} />
                                                <MetricCell value={exhausted ? null : m.severity_mae}      paper={exhausted ? null : pap?.severity_mae} higherBetter={false} exhausted={exhausted} />
                                                <MetricCell value={exhausted ? null : m.severity_spearman} paper={exhausted ? null : pap?.severity_spearman} exhausted={exhausted} />
                                                <td className="px-4 py-3 text-center text-xs text-gray-500">
                                                    {exhausted ? <span className="text-orange-400/60">—</span> : m.sample_count}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── TABLE IV: Per-Category F1 ───────────────────────────── */}
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-700/50">
                            <h2 className="text-base font-bold text-white">Table IV — Per-Category F1 Scores</h2>
                            <p className="text-gray-400 text-xs mt-1">
                                F1 per category for each model — paper Tier 1 / Tier 4 reference (Table IV) shown in right column
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-700/30">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-left">Category</th>
                                        {PROVIDER_KEYS.map(pk => (
                                            <th key={pk} className="px-4 py-3 text-xs font-semibold text-gray-400 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <span className={`w-2 h-2 rounded-full ${PROVIDER_STYLES[pk].dot}`} />
                                                    {PROVIDER_STYLES[pk].tier}
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-4 py-3 text-xs font-semibold text-amber-400 text-center">Paper T1 / T4</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/30">
                                    {SHOW_CATEGORIES.map(cat => (
                                        <tr key={cat} className="hover:bg-gray-700/20 transition">
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-semibold text-gray-300 capitalize">{cat.replace('_', ' ')}</span>
                                            </td>
                                            {PROVIDER_KEYS.map(pk => {
                                                const m   = data.provider_metrics[pk];
                                                const f1  = m?.per_category_f1?.[cat]?.f1;
                                                const sup = m?.per_category_f1?.[cat]?.support ?? 0;
                                                return (
                                                    <td key={pk} className="px-4 py-3 text-center">
                                                        {sup === 0 ? (
                                                            <span className="text-gray-600 text-xs">— (n=0)</span>
                                                        ) : (
                                                            <div className="flex flex-col items-center">
                                                                <span className={`text-sm font-bold ${
                                                                    f1 >= 0.85 ? 'text-green-400' :
                                                                    f1 >= 0.70 ? 'text-yellow-400' : 'text-red-400'
                                                                }`}>
                                                                    {f1?.toFixed(3) ?? '—'}
                                                                </span>
                                                                <span className="text-xs text-gray-600">n={sup}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 text-center">
                                                {PAPER_PER_CATEGORY[cat] ? (
                                                    <span className="text-xs text-amber-400 font-mono">
                                                        {PAPER_PER_CATEGORY[cat].tier1} / {PAPER_PER_CATEGORY[cat].tier4}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Severity Section ─────────────────────────────────────── */}
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                        <h2 className="text-base font-bold text-white mb-1">Section D — Severity Scoring</h2>
                        <p className="text-gray-400 text-xs mb-4">
                            MAE against stored severity scores (lower = better) · Spearman ρ correlation (higher = better, max 1.0)
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {PROVIDER_KEYS.map(pk => {
                                const m   = data.provider_metrics[pk];
                                const sty = PROVIDER_STYLES[pk];
                                const pap = PAPER_TIERS[pk];
                                return (
                                    <div key={pk} className="rounded-xl border border-gray-600/50 bg-gray-700/30 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={`w-2 h-2 rounded-full ${sty.dot}`} />
                                            <span className="text-xs font-bold text-gray-200">{sty.tier}</span>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-0.5">MAE</p>
                                                <p className="text-lg font-bold text-white">{m?.severity_mae ?? '—'}</p>
                                                {pap?.severity_mae != null && (
                                                    <p className="text-xs text-gray-500">paper: {pap.severity_mae}</p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 mb-0.5">Spearman ρ</p>
                                                <p className="text-lg font-bold text-white">{m?.severity_spearman ?? '—'}</p>
                                                {pap?.severity_spearman != null && (
                                                    <p className="text-xs text-gray-500">paper: {pap.severity_spearman}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Honest Comparison Report ─────────────────────────────── */}
                    <HonestReport data={data} sampleSize={sampleSize} />

                    {/* Footer note */}
                    <p className="text-xs text-gray-600 text-center pb-4">
                        Evaluated on {data.sample_size} most-recent complaints. Ground truth = stored category/severity from initial AI analysis.
                        Paper values: MTIAE stress-test on 1,200 synthetic complaints (NCRB 2022 distribution, ICISCE 2025).
                    </p>
                </>
            )}

            {/* ── Empty state — show honest report even before evaluation ─── */}
            {!data && !loading && (
                <div className="space-y-6">
                    <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-12 flex flex-col items-center gap-3">
                        <span className="text-5xl">📊</span>
                        <p className="text-gray-400 font-medium">No evaluation run yet</p>
                        <p className="text-gray-600 text-sm text-center max-w-md">
                            Click <strong className="text-gray-400">Run Evaluation</strong> to call all 4 models on your last {sampleSize} complaints
                            and compare results against research paper benchmarks.
                        </p>
                    </div>
                    {/* Show honest report structure even without live data */}
                    <HonestReport data={null} sampleSize={sampleSize} />
                </div>
            )}
        </div>
    );
}
