import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layout/Layout';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Citizen Pages
import DashboardPage from './pages/citizen/DashboardPage';
import CreateComplaintPage from './pages/citizen/CreateComplaintPage';
import CitizenComplaintsPage from './pages/citizen/CitizenComplaintsPage';
import NotificationsPage from './pages/citizen/NotificationsPage';

// Admin / Authority Pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import HotspotMapPage from './pages/admin/HotspotMapPage';
import AdminComplaintsPage from './pages/admin/AdminComplaintsPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import LLMAnalyticsPage from './pages/admin/LLMAnalyticsPage';

// Profile
import ProfilePage from './pages/profile/ProfilePage';

// Role-based guard
const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
            <div className="text-center">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Loading Suraksha...</p>
            </div>
        </div>
    );
    if (!user) return <Navigate to="/login" replace />;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // Redirect to appropriate default for their role
        if (user.role === 'citizen') return <Navigate to="/dashboard" replace />;
        return <Navigate to="/admin/dashboard" replace />;
    }
    return children;
};

// Smart default redirect after login based on role
const RoleRedirect = () => {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === 'admin' || user.role === 'authority') return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
};

function App() {
    return (
        <Router>
            <AuthProvider>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        duration: 3500,
                        style: { background: '#1f2937', color: '#f9fafb', borderRadius: '8px' },
                        success: { iconTheme: { primary: '#4ade80', secondary: '#1f2937' } },
                        error: { iconTheme: { primary: '#f87171', secondary: '#1f2937' } },
                    }}
                />
                <Routes>
                    {/* Public */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />

                    {/* All protected routes inside layout */}
                    <Route path="/" element={<Layout />}>
                        <Route index element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

                        {/* Profile (all roles) */}
                        <Route path="profile" element={
                            <ProtectedRoute><ProfilePage /></ProtectedRoute>
                        } />

                        {/* ── Citizen ────────────────────────────────── */}
                        <Route path="dashboard" element={
                            <ProtectedRoute allowedRoles={['citizen']}><DashboardPage /></ProtectedRoute>
                        } />
                        <Route path="citizen/complaint/new" element={
                            <ProtectedRoute allowedRoles={['citizen']}><CreateComplaintPage /></ProtectedRoute>
                        } />
                        <Route path="citizen/complaints" element={
                            <ProtectedRoute allowedRoles={['citizen']}><CitizenComplaintsPage /></ProtectedRoute>
                        } />
                        <Route path="citizen/notifications" element={
                            <ProtectedRoute allowedRoles={['citizen']}><NotificationsPage /></ProtectedRoute>
                        } />

                        {/* ── Admin / Authority ──────────────────────── */}
                        <Route path="admin/dashboard" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><AdminDashboardPage /></ProtectedRoute>
                        } />
                        <Route path="admin/complaints" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><AdminComplaintsPage /></ProtectedRoute>
                        } />
                        <Route path="admin/assigned" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><AdminComplaintsPage assignedOnly={true} /></ProtectedRoute>
                        } />
                        <Route path="admin/hotspots" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><HotspotMapPage /></ProtectedRoute>
                        } />
                        <Route path="admin/analytics" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><AdminAnalyticsPage /></ProtectedRoute>
                        } />
                        <Route path="admin/users" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><AdminUsersPage /></ProtectedRoute>
                        } />
                        <Route path="admin/llm-analytics" element={
                            <ProtectedRoute allowedRoles={['admin', 'authority']}><LLMAnalyticsPage /></ProtectedRoute>
                        } />

                        {/* Catch-all */}
                        <Route path="*" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
                    </Route>
                </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;
