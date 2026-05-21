import React, { useState, useRef, useEffect, useCallback } from 'react';
import { intelligenceAPI } from '../../utils/api';

// ── Icons ─────────────────────────────────────────────────────────────────

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const ToolIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

// ── Suggested questions ───────────────────────────────────────────────────

const SUGGESTIONS = [
  'How many pending complaints are there?',
  'Show me the latest 5 critical cases',
  'What are the top crime categories this month?',
  'Which IPC sections apply to case SRK8533482?',
  'Are there any unresolved assault cases in JP Nagar?',
  'Give me a summary of all fraud cases',
];

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mb-0.5
        ${isUser ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-indigo-300 border border-gray-600'}`}>
        {isUser ? 'You' : 'AI'}
      </div>

      <div className={`max-w-[80%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Tool use badge */}
        {!isUser && msg.tools_used && msg.tools_used.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(msg.tools_used)].map(tool => (
              <span key={tool}
                className="flex items-center gap-1 text-xs bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full">
                <ToolIcon />
                {tool.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-bl-sm'
          }`}>
          {msg.content}
        </div>

        {/* Timestamp */}
        {msg.time && (
          <span className="text-xs text-gray-600 px-1">{msg.time}</span>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ onSuggestion }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-10 px-4">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-3xl mx-auto">
          🔍
        </div>
        <h3 className="text-gray-300 font-semibold text-lg">SURAKSHA Intelligence</h3>
        <p className="text-gray-500 text-sm max-w-sm">
          Ask anything about crime data — case lookups, IPC sections, statistics, trends, or investigation insights.
        </p>
      </div>

      <div className="w-full max-w-lg space-y-2">
        <p className="text-xs text-gray-600 uppercase tracking-wider text-center">Try asking</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="text-left text-xs text-gray-400 bg-gray-800/60 hover:bg-indigo-600/20 hover:text-indigo-300
                border border-gray-700 hover:border-indigo-500/40 rounded-xl px-3 py-2.5 transition"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function NLQueryPage() {
  const [messages, setMessages]   = useState([]);   // {role, content, tools_used?, time}
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const bottomRef                 = useRef(null);
  const textareaRef               = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }, [input]);

  // Build conversation history for the API (only role + content)
  const buildHistory = useCallback(() =>
    messages.map(m => ({ role: m.role, content: m.content }))
  , [messages]);

  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setError('');

    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Add user message immediately
    setMessages(prev => [...prev, { role: 'user', content: q, time: now }]);
    setLoading(true);

    try {
      const history = buildHistory();
      const res = await intelligenceAPI.nlQuery(q, history);
      const { answer, tools_used } = res.data;

      const aiTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer || 'No response received.',
        tools_used: tools_used || [],
        time: aiTime,
      }]);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Request failed. Please try again.';
      setError(msg);
      // Remove the user message we optimistically added if the request failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [input, loading, buildHistory]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError('');
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center text-lg">
            💬
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-100">SURAKSHA Intelligence</h1>
            <p className="text-xs text-gray-500">AI crime analyst · case lookups · IPC sections · statistics</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-700
              hover:border-red-500/40 px-3 py-1.5 rounded-lg transition"
          >
            <TrashIcon /> Clear chat
          </button>
        )}
      </div>

      {/* ── Message thread ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {messages.length === 0 && !loading ? (
          <EmptyState onSuggestion={(s) => sendMessage(s)} />
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-end gap-2.5">
            <div className="w-7 h-7 rounded-full flex-shrink-0 bg-gray-700 border border-gray-600 flex items-center justify-center text-xs font-bold text-indigo-300">
              AI
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-sm">
              <TypingDots />
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-800">
        {/* Suggestion chips — only show when there are messages already */}
        {messages.length > 0 && messages.length < 3 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.slice(0, 3).map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                disabled={loading}
                className="text-xs text-gray-500 hover:text-indigo-300 border border-gray-700 hover:border-indigo-500/40
                  bg-gray-800/50 hover:bg-indigo-600/10 px-3 py-1 rounded-full transition disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3
          focus-within:border-indigo-500/60 transition">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about cases, IPC sections, statistics… (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none
              disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '150px' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-9 h-9 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
              disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition mb-0.5"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <SendIcon />
            }
          </button>
        </div>
        <p className="text-xs text-gray-700 mt-2 text-center">
          AI can make mistakes · For legal proceedings, verify with a qualified officer
        </p>
      </div>
    </div>
  );
}
