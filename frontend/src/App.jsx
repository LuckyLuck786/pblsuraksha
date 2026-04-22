import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// IMPORT AuthProvider here!
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layout/Layout';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

import DashboardPage from './pages/citizen/DashboardPage';
import CreateComplaintPage from './pages/citizen/CreateComplaintPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import HotspotMapPage from './pages/admin/HotspotMapPage';
import TransportDashboardPage from './pages/transport/TransportDashboardPage';
import CreateRequestPage from './pages/transport/CreateRequestPage';
// Role-Based Route Guard
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading Suraksha System...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />; // Redirect if wrong role
  }
  
  return children;
};

function App() {
  return (
    <Router>
      {/* WRAP ALL ROUTES IN THE AUTH PROVIDER */}
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Routes inside Main Layout */}
          <Route path="/" element={<Layout />}>
            {/* Default redirect based on role */}
            <Route index element={<Navigate to="/dashboard" replace />} />
            
            <Route path="dashboard" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />

            {/* Citizen Routes */}
            <Route path="citizen/complaint/new" element={
              <ProtectedRoute allowedRoles={['citizen']}>
                <CreateComplaintPage />
              </ProtectedRoute>
            } />
            
            {/* We will add the rest here later */}
          </Route>
          {/* Admin/Authority Routes */}
          <Route path="admin/dashboard" element={
            <ProtectedRoute allowedRoles={['admin', 'authority']}>
            <AdminDashboardPage />
            </ProtectedRoute>
          } />

          <Route path="admin/hotspots" element={
            <ProtectedRoute allowedRoles={['admin', 'authority']}>
            <HotspotMapPage />
            </ProtectedRoute>
          } />
          {/* Farmer Transport Routes */}
<Route path="transport/dashboard" element={
  <ProtectedRoute allowedRoles={['farmer']}>
    <TransportDashboardPage />
  </ProtectedRoute>
} />

<Route path="transport/new" element={
  <ProtectedRoute allowedRoles={['farmer']}>
    <CreateRequestPage />
  </ProtectedRoute>
} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;