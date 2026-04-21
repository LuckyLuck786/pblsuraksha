import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import './App.css';

// Placeholder pages - will be implemented
const HomePage = () => <div className="page"><h1>Welcome to SURAKSHA</h1></div>;
const LoginPage = () => <div className="page"><h1>Login</h1></div>;
const DashboardPage = () => <div className="page"><h1>Dashboard</h1></div>;
const NotFoundPage = () => <div className="page"><h1>404 - Page Not Found</h1></div>;

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
