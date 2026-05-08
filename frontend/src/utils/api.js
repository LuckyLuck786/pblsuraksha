/**
 * SURAKSHA - API Service Layer
 * Centralized axios instance with JWT auth interceptors
 * Module 5: jQuery/AJAX equivalent in React using axios
 */

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// ── Axios Instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor: attach JWT token ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: handle 401 + refresh token ──────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
          return api(originalRequest);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth APIs ──────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register/', data),
  login: (data) => api.post('/auth/login/', data),
  getProfile: () => api.get('/auth/profile/'),
  updateProfile: (data) => api.patch('/auth/profile/', data),
  getDashboardStats: () => api.get('/auth/dashboard-stats/'),
};

// ── Complaints APIs ────────────────────────────────────────────────────────
export const complaintsAPI = {
  getAll: (params) => api.get('/complaints/', { params }),
  getOne: (complaintId) => api.get(`/complaints/${complaintId}/`),
  create: (data) => api.post('/complaints/', data),
  updateStatus: (complaintId, data) => api.post(`/complaints/${complaintId}/update/`, data),
  uploadEvidence: (complaintId, formData) =>
    api.post(`/complaints/${complaintId}/evidence/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAnalytics: () => api.get('/complaints/data/analytics/'),
  getNotifications: () => api.get('/complaints/data/notifications/'),
  markNotificationsRead: () => api.post('/complaints/data/notifications/read/'),
};

// ── Transport APIs ─────────────────────────────────────────────────────────
export const transportAPI = {
  getAll: () => api.get('/transport/'),
  create: (data) => api.post('/transport/', data),
  confirm: (requestId) => api.post(`/transport/${requestId}/confirm/`),
  getNearbyFacilities: (lat, lon, type = '', radius = 100) =>
    api.get('/transport/facilities/', { params: { lat, lon, type, radius } }),
  getAllFacilities: () => api.get('/transport/facilities/all/'),
};

// ── Intelligence APIs ──────────────────────────────────────────────────────
export const intelligenceAPI = {
  analyzeText: (title, description) =>
    api.post('/intelligence/analyze/', { title, description }),
  getHotspots: () => api.get('/intelligence/hotspots/'),
  getMapData: () => api.get('/intelligence/map-data/'),
  getInsights: () => api.get('/intelligence/insights/'),
};

export default api;