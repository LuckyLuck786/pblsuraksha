import React, { useState } from 'react';
import { intelligenceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// Paper reference values
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

const PROVIDER_STYLES = {
    'groq-key-1' : { color: 'text-violet-600', bg: 'bg-violet-50',  border: 'border-violet-200', dot: 'bg-violet-500', tier: 'Tier 1' },
    'groq-key-2' : { color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200', dot: 'bg-indigo-500', tier: 'Tier 2' },
    'gemini'     : { color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-500',   tier: 'Tier 3' },
    'rule-based' : { color: 'text-gray-600',   bg: 'bg-gray-50',    border: 'border-gray-200',   dot: 'bg-gray-400',   tier: 'Tier 4' },
};

function MetricCell({ value, paper, higherBetter = true, suffix = '' }) {
    if (value == null) return <td className="px-4 py-3 text-gray-400 text-sm text-center">—</td>;
    const diff = paper != null ? value - paper : null;
    const better = diff != null ? (higherBetter ? diff >= 0 : diff <= 0) : null;
    return (
        <td className="px-4 py-3 text-center">
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-gray-800">{value}{suffix}</span>
                {paper != null && (
                    <span className={`text-xs ${better ? 'text-green-600' : 'text-red-500'}`}>
                        {better ? '▲' : '▼'} paper: {paper}{suffix}
                    </span>
                )}
            </div>
        </td>
    );
}

const PAPER_TIERS = {
    'groq-key-1' : { latency_s: 1.2, macro_f1: 0.949, availability_pct: 99.5, severity_mae: 0.43, severity_spearman: 0.93 },
    'groq-key-2' : { latency_s: 1.3, macro_f1: 0.964, availability_pct: 99.5, severity_mae: 0.43, severity_spearman: 0.93 },
    'gemini'     : { latency_s: 2.1, macro_f1: 0.948, availability_pct: 99.7, severity_mae: 0.43, severity_spearman: 0.93 },
    'rule-based' : { latency_s: 0.001, macro_f1: 0.782, availability_pct: 100.0, severity_mae: 1.92, severity_spearman: 0.74 },
};

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
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="w-9 h-9 bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center justify-center text-lg">🧠</span>
                        LLM Model Analytics
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Live evaluation of all AI models against your complaint dataset — compared to research paper benchmarks
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
                            {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} complaints</option>)}
                        </select>
                    </div>
                    <button
                        onClick={runEvaluation}
                        disabled={loading}
                        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                    >
                        {loading ? (
                            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg> Running…</>
                        ) : (
                            <>⚡ Run Evaluation</>
                        )}
                    </button>
                </div>
            </div>

            {/* Callout */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 flex gap-3">
                <span className="text-yellow-400 text-lg flex-shrink-0">📄</span>
                <p className="text-gray-300 text-sm">
                    <strong className="text-white">Research paper benchmarks</strong> (shown as ▲/▼ comparisons) are from a stress-test evaluation on 1,200 synthetic NCRB-distribution complaints.
                    Your live values are computed from real submitted complaints — differences are expected given dataset size and domain distribution.
                </p>
            </div>

            {/* Loading state */}
            {loading && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-12 flex flex-col items-center gap-4">
                    <div className="flex gap-3">
                        {PROVIDER_KEYS.map(pk => (
                            <div key={pk} className={`w-3 h-3 rounded-full ${PROVIDER_STYLES[pk].dot} animate-pulse`} style={{animationDelay: `${PROVIDER_KEYS.indexOf(pk)*0.15}s`}} />
                        ))}
                    </div>
                    <p className="text-gray-400 text-sm">Calling all models on {sampleSize} complaints in parallel…</p>
                    <p className="text-gray-600 text-xs">This may take 30–60 seconds depending on API latency</p>
                </div>
            )}

            {data && (
                <>
                    {/* ── TABLE II: System Performance ─────────────────────── */}
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-700/50">
                            <h2 className="text-base font-bold text-white">Table II — Per-Tier System Performance</h2>
                            <p className="text-gray-400 text-xs mt-1">Latency · Macro-F1 · Availability · Severity MAE · Spearman ρ — your live values vs paper benchmarks</p>
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
                                        return (
                                            <tr key={pk} className="hover:bg-gray-700/20 transition">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${sty.dot}`} />
                                                        <div>
                                                            <p className="text-xs font-bold text-white">{sty.tier}</p>
                                                            <p className="text-xs text-gray-400">{m.label}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <MetricCell value={m.avg_latency_s} paper={pap?.latency_s} higherBetter={false} suffix="s" />
                                                <MetricCell value={m.macro_f1}      paper={pap?.macro_f1} />
                                                <MetricCell value={m.availability_pct} paper={pap?.availability_pct} suffix="%" />
                                                <MetricCell value={m.severity_mae}  paper={pap?.severity_mae} higherBetter={false} />
                                                <MetricCell value={m.severity_spearman} paper={pap?.severity_spearman} />
                                                <td className="px-4 py-3 text-center text-xs text-gray-500">{m.sample_count}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── TABLE IV: Per-Category F1 ─────────────────────────── */}
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-700/50">
                            <h2 className="text-base font-bold text-white">Table IV — Per-Category F1 Scores</h2>
                            <p className="text-gray-400 text-xs mt-1">F1 per category for each model — paper Tier 1 / Tier 4 reference shown in brackets</p>
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
                                                            <span className="text-gray-600 text-xs">—</span>
                                                        ) : (
                                                            <div className="flex flex-col items-center">
                                                                <span className={`text-sm font-bold ${f1 >= 0.85 ? 'text-green-400' : f1 >= 0.70 ? 'text-yellow-400' : 'text-red-400'}`}>
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
                                                ) : <span className="text-gray-600 text-xs">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Severity Section ────────────────────────────────── */}
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
                                    <div key={pk} className={`rounded-xl border ${sty.border} ${sty.bg} p-4`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={`w-2 h-2 rounded-full ${sty.dot}`} />
                                            <span className="text-xs font-bold text-gray-700">{sty.tier}</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-xs text-gray-500">MAE</p>
                                                <p className="text-lg font-bold text-gray-800">{m?.severity_mae ?? '—'}</p>
                                                {pap?.severity_mae != null && (
                                                    <p className="text-xs text-gray-400">paper: {pap.severity_mae}</p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Spearman ρ</p>
                                                <p className="text-lg font-bold text-gray-800">{m?.severity_spearman ?? '—'}</p>
                                                {pap?.severity_spearman != null && (
                                                    <p className="text-xs text-gray-400">paper: {pap.severity_spearman}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer note */}
                    <p className="text-xs text-gray-600 text-center">
                        Evaluated on {data.sample_size} most recent complaints. Ground truth = stored category/severity from initial AI analysis.
                        Paper values from MTIAE stress-test on 1,200 synthetic complaints (NCRB 2022 distribution).
                    </p>
                </>
            )}

            {/* Empty state */}
            {!data && !loading && (
                <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-16 flex flex-col items-center gap-3">
                    <span className="text-5xl">📊</span>
                    <p className="text-gray-400 font-medium">No evaluation run yet</p>
                    <p className="text-gray-600 text-sm text-center max-w-md">
                        Click <strong className="text-gray-400">Run Evaluation</strong> to call all 4 models on your last {sampleSize} complaints
                        and compare results against research paper benchmarks.
                    </p>
                </div>
            )}
        </div>
    );
}
