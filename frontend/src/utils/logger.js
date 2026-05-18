/**
 * Safe City Connect - Frontend Logger
 * ===========================
 * Structured client-side logging with levels, timestamps, and optional
 * remote reporting to the backend.
 *
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.info('User logged in', { username: 'rajan' });
 *   logger.error('API call failed', error);
 *   logger.warn('Retrying request...', { attempt: 2 });
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
const LOG_LABELS = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR', 4: 'CRITICAL' };

// Change to LOG_LEVELS.WARN in production to silence debug/info
const ACTIVE_LEVEL = process.env.NODE_ENV === 'production'
  ? LOG_LEVELS.WARN
  : LOG_LEVELS.DEBUG;

// Keep last 100 log entries in memory for debugging (accessible via logger.history())
const _history = [];
const MAX_HISTORY = 100;

// ── Remote error reporting ─────────────────────────────────────────────────
// Only WARN and above are sent to the backend; rate-limited to 1 per 2s
let _lastRemoteAt = 0;
const REMOTE_COOLDOWN_MS = 2000;
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const _sendRemote = async (level, module, message, extra) => {
  if (level < LOG_LEVELS.WARN) return;
  const now = Date.now();
  if (now - _lastRemoteAt < REMOTE_COOLDOWN_MS) return;
  _lastRemoteAt = now;

  try {
    const token = localStorage.getItem('access_token');
    await fetch(`${BASE_URL}/logs/frontend/`, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        level  : LOG_LABELS[level],
        module,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        extra  : extra ? String(extra) : undefined,
        url    : window.location.href,
        ua     : navigator.userAgent,
        ts     : new Date().toISOString(),
      }),
    });
  } catch {
    // Silently fail — never let the logger crash the app
  }
};

// ── Core log function ──────────────────────────────────────────────────────
const _log = (level, module, message, extra) => {
  if (level < ACTIVE_LEVEL) return;

  const ts    = new Date().toISOString();
  const label = LOG_LABELS[level] ?? 'LOG';
  const prefix = `[${ts}] ${label.padEnd(8)} [${module}]`;

  // Console output with appropriate method
  const consoleFn = {
    [LOG_LEVELS.DEBUG]   : console.debug,
    [LOG_LEVELS.INFO]    : console.info,
    [LOG_LEVELS.WARN]    : console.warn,
    [LOG_LEVELS.ERROR]   : console.error,
    [LOG_LEVELS.CRITICAL]: console.error,
  }[level] ?? console.log;

  if (extra !== undefined) {
    consoleFn(`%c${prefix}`, _style(level), message, extra);
  } else {
    consoleFn(`%c${prefix}`, _style(level), message);
  }

  // Save to history
  const entry = { ts, level, label, module, message: String(message) };
  _history.push(entry);
  if (_history.length > MAX_HISTORY) _history.shift();

  // Remote reporting (async, fire-and-forget)
  _sendRemote(level, module, message, extra);
};

const _style = (level) => {
  const styles = {
    [LOG_LEVELS.DEBUG]   : 'color:#6b7280;font-size:11px',
    [LOG_LEVELS.INFO]    : 'color:#3b82f6;font-weight:600',
    [LOG_LEVELS.WARN]    : 'color:#f59e0b;font-weight:700',
    [LOG_LEVELS.ERROR]   : 'color:#ef4444;font-weight:700',
    [LOG_LEVELS.CRITICAL]: 'color:#fff;background:#dc2626;font-weight:700;padding:2px 4px',
  };
  return styles[level] ?? '';
};

// ── Module logger factory ──────────────────────────────────────────────────
/**
 * Create a module-scoped logger:
 *   const log = logger.module('CreateComplaintPage');
 *   log.info('Submitted');
 */
const createModuleLogger = (module) => ({
  debug : (msg, extra) => _log(LOG_LEVELS.DEBUG,    module, msg, extra),
  info  : (msg, extra) => _log(LOG_LEVELS.INFO,     module, msg, extra),
  warn  : (msg, extra) => _log(LOG_LEVELS.WARN,     module, msg, extra),
  error : (msg, extra) => _log(LOG_LEVELS.ERROR,    module, msg, extra),
  critical: (msg, extra) => _log(LOG_LEVELS.CRITICAL, module, msg, extra),
});

// ── Global uncaught error capture ─────────────────────────────────────────
window.addEventListener('error', (event) => {
  _log(LOG_LEVELS.ERROR, 'window.onerror',
    `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
    event.error
  );
});

window.addEventListener('unhandledrejection', (event) => {
  _log(LOG_LEVELS.ERROR, 'unhandledRejection',
    `Unhandled Promise rejection: ${event.reason}`,
    event.reason
  );
});

// ── Default export ─────────────────────────────────────────────────────────
const logger = {
  debug   : (msg, extra) => _log(LOG_LEVELS.DEBUG,    'app', msg, extra),
  info    : (msg, extra) => _log(LOG_LEVELS.INFO,     'app', msg, extra),
  warn    : (msg, extra) => _log(LOG_LEVELS.WARN,     'app', msg, extra),
  error   : (msg, extra) => _log(LOG_LEVELS.ERROR,    'app', msg, extra),
  critical: (msg, extra) => _log(LOG_LEVELS.CRITICAL, 'app', msg, extra),
  module  : createModuleLogger,
  history : () => [..._history],
  levels  : LOG_LEVELS,
};

export default logger;
