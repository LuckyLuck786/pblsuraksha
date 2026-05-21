/**
 * Safe City Connect - API Service Layer
 * Centralized axios instance with JWT auth interceptors and structured logging.
 */

import axios from 'axios';
import logger from './logger';

const apiLogger = logger.module('API');
const BASE_URL  = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// ── Axios Instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL : BASE_URL,
  timeout : 30000,
  headers : { 'Content-Type': 'application/json' },
});

// ── Request Interceptor: attach JWT token + log request ───────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;

    // Tag request with start time for latency logging
    config.metadata = { startTime: Date.now() };
    apiLogger.debug(`→ ${config.method?.toUpperCase()} ${config.url}`, config.params ?? config.data);
    return config;
  },
  (error) => {
    apiLogger.error('Request setup error', error);
    return Promise.reject(error);
  }
);

// ── Response Interceptor: log response, handle 401 + refresh ─────────────
api.interceptors.response.use(
  (response) => {
    const ms = Date.now() - (response.config.metadata?.startTime ?? Date.now());
    apiLogger.info(
      `← ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url} (${ms}ms)`
    );
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status  = error.response?.status;
    const method  = originalRequest?.method?.toUpperCase() ?? '?';
    const url     = originalRequest?.url ?? '?';
    const ms      = Date.now() - (originalRequest?.metadata?.startTime ?? Date.now());

    // ── 401: attempt token refresh ────────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          apiLogger.info('Token expired — attempting refresh...');
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
          apiLogger.info('Token refreshed successfully — retrying original request.');
          return api(originalRequest);
        } catch (refreshErr) {
          apiLogger.error('Token refresh failed — redirecting to login.', refreshErr);
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        apiLogger.warn('401 received with no refresh token — redirecting to login.');
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    // ── Log the error at appropriate level ────────────────────────────
    const errMsg = error.response?.data?.detail
      || error.response?.data?.error
      || error.message
      || 'Unknown error';

    if (status >= 500) {
      apiLogger.error(
        `✗ ${status} ${method} ${url} (${ms}ms) — SERVER ERROR: ${errMsg}`,
        error.response?.data
      );
    } else if (status === 404) {
      apiLogger.warn(`✗ ${status} ${method} ${url} (${ms}ms) — Not Found`);
    } else if (status === 403) {
      apiLogger.warn(`✗ ${status} ${method} ${url} (${ms}ms) — Forbidden: ${errMsg}`);
    } else if (status >= 400) {
      apiLogger.warn(
        `✗ ${status} ${method} ${url} (${ms}ms) — Client Error: ${errMsg}`,
        error.response?.data
      );
    } else {
      apiLogger.error(
        `✗ Network error ${method} ${url} (${ms}ms): ${error.message}`
      );
    }

    return Promise.reject(error);
  }
);

// ── Auth APIs ──────────────────────────────────────────────────────────────
export const authAPI = {
  register           : (data) => api.post('/auth/register/', data),
  login              : (data) => api.post('/auth/login/', data),
  getProfile         : ()     => api.get('/auth/profile/'),
  updateProfile      : (data) => api.patch('/auth/profile/', data),
  getDashboardStats  : ()     => api.get('/auth/dashboard-stats/'),

  // ── Email verification ─────────────────────────────────────────────────
  sendEmailVerification: ()      => api.post('/auth/send-email-verification/'),
  verifyEmail          : (token) => api.post('/auth/verify-email/', { token }),

  // ── Admin user management ──────────────────────────────────────────────
  // action: 'block' | 'unblock' | 'delete'
  manageUser           : (userId, action) => api.post(`/auth/users/${userId}/manage/`, { action }),
};

// ── Complaints APIs ────────────────────────────────────────────────────────
export const complaintsAPI = {
  getAll              : (params)               => api.get('/complaints/', { params }),
  getOne              : (complaintId)          => api.get(`/complaints/${complaintId}/`),
  create              : (data)                 => api.post('/complaints/', data),
  updateStatus        : (complaintId, data)    => api.post(`/complaints/${complaintId}/update/`, data),
  uploadEvidence      : (complaintId, formData) =>
    api.post(`/complaints/${complaintId}/evidence/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAnalytics        : ()     => api.get('/complaints/data/analytics/'),
  getNotifications    : ()     => api.get('/complaints/data/notifications/'),
  markNotificationsRead: ()    => api.post('/complaints/data/notifications/read/'),

  // ── Export ────────────────────────────────────────────────────────────
  exportComplaints    : (format = 'xlsx', params = {}) =>
    api.get('/complaints/export/', { params: { export_format: format, ...params }, responseType: 'blob' }),

  // ── Anonymous Tip ─────────────────────────────────────────────────────
  submitAnonymousTip  : (data) => api.post('/complaints/anonymous-tip/', data),
};

// ── Intelligence APIs ──────────────────────────────────────────────────────
export const intelligenceAPI = {
  analyzeText       : (title, description) => api.post('/intelligence/analyze/', { title, description }),
  getHotspots       : ()                   => api.get('/intelligence/hotspots/'),
  getMapData        : ()                   => api.get('/intelligence/map-data/'),
  getInsights       : ()                   => api.get('/intelligence/insights/'),
  analyzeAll        : (title, description) => api.post('/intelligence/analyze-all/', { title, description }),
  getLLMAnalytics   : (sample = 20, force = false) =>
    api.get('/intelligence/llm-analytics/', {
      params  : { sample, ...(force && { force: 1 }) },
      timeout : 1500000,   // 25 min — free-tier LLMs are slow; use ?force=1 to bypass 1-hr cache
    }),

  // ── New AI features ───────────────────────────────────────────────────
  checkDuplicate    : (title, description, incident_location) =>
    api.post('/intelligence/check-duplicate/', { title, description, incident_location }),

  investigationSummary: (complaintId) =>
    api.post(`/intelligence/investigation-summary/${complaintId}/`),

  nlQuery           : (question) => api.post('/intelligence/nl-query/', { question }),

  getCrimeTrends    : (days = 90) => api.get(`/intelligence/trends/?days=${days}`),

  getPredictedHotspots: (days = 30) => api.get(`/intelligence/predicted-hotspots/?days=${days}`),

  translateComplaint: (title, description) =>
    api.post('/intelligence/translate/', { title, description }),
};

export default api;
