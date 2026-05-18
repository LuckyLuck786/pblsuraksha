import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { intelligenceAPI } from '../../utils/api';

const EXAMPLE_QUERIES = [
  'How many pending complaints?',
  'Top 3 crime categories this month',
  'Which city has most incidents?',
  'How many critical cases?',
];

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function ResultCard({ result }) {
  const hasCount =
    result.count != null ||
    (typeof result.answer === 'string' && /^\d+$/.test(result.answer.trim()));

  const bigNumber =
    result.count != null
      ? result.count
      : typeof result.answer === 'string' && /^\d+$/.test(result.answer.trim())
      ? result.answer.trim()
      : null;

  return (
    <div className="bg-gray-800 border border-indigo-500/30 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">AI Response</span>
      </div>

      {bigNumber != null && (
        <div className="text-center py-4">
          <p className="text-6xl font-black text-white tabular-nums">{bigNumber}</p>
          {result.label && (
            <p className="text-sm text-gray-400 mt-2">{result.label}</p>
          )}
        </div>
      )}

      {result.answer && (
        <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
      )}

      {!result.answer && !bigNumber && (
        <pre className="text-xs text-gray-300 bg-gray-900/60 rounded-lg p-4 overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {result.sql && (
        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 select-none">
            Show generated query
          </summary>
          <pre className="mt-2 text-xs text-indigo-300 bg-gray-900/60 rounded-lg p-3 overflow-x-auto">
            {result.sql}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function NLQueryPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [asked, setAsked] = useState('');

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) {
      toast.error('Please enter a question.');
      return;
    }
    setLoading(true);
    setResult(null);
    setAsked(q);
    try {
      const res = await intelligenceAPI.nlQuery(q);
      setResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Query failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAsk();
    }
  };

  const handleChip = (q) => {
    setQuestion(q);
    setResult(null);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="w-9 h-9 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center text-lg">
            💬
          </span>
          Natural Language Query
        </h1>
        <p className="text-gray-400 text-sm mt-1">Ask questions about crime data in plain English</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. How many theft complaints last week? Which area has most incidents?"
          rows={4}
          className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-600">Ctrl + Enter to submit</p>
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            {loading ? <><Spinner /> Thinking…</> : <>Ask AI</>}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleChip(q)}
              className="text-xs bg-gray-700 hover:bg-indigo-600/30 border border-gray-600 hover:border-indigo-500/50 text-gray-300 hover:text-indigo-300 px-3 py-1.5 rounded-full transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-10 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-gray-400 text-sm">Processing your query…</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-3">
          {asked && (
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 flex-shrink-0 mt-0.5">
                You
              </span>
              <p className="text-gray-300 text-sm bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
                {asked}
              </p>
            </div>
          )}
          <ResultCard result={result} />
        </div>
      )}

      {!result && !loading && (
        <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-10 flex flex-col items-center gap-2">
          <span className="text-4xl">🔍</span>
          <p className="text-gray-500 text-sm">Your answer will appear here</p>
        </div>
      )}
    </div>
  );
}
