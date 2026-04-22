import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const navigate = useNavigate();

  if (!user) return null;

  const getMenuItems = () => {
    const commonItems = [
      { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      { label: 'Profile', path: '/profile', icon: '👤' },
    ];

    switch (user.role) {
      case 'citizen':
        return [
          ...commonItems,
          { label: 'File Complaint', path: '/citizen/complaint/new', icon: '🚨' },
          { label: 'My Complaints', path: '/citizen/complaints', icon: '📋' },
          { label: 'Notifications', path: '/citizen/notifications', icon: '🔔' },
        ];

      case 'authority':
      case 'admin':
        return [
          ...commonItems,
          { label: 'All Complaints', path: '/admin/complaints', icon: '🚨' },
          { label: 'Assigned to Me', path: '/admin/assigned', icon: '✅' },
          { label: 'Crime Hotspots', path: '/admin/hotspots', icon: '🗺️' },
          { label: 'Analytics', path: '/admin/analytics', icon: '📈' },
          { label: 'Users', path: '/admin/users', icon: '👥' },
        ];

      case 'farmer':
        return [
          ...commonItems,
          { label: 'New Request', path: '/transport/new', icon: '📦' },
          { label: 'My Requests', path: '/transport/requests', icon: '📋' },
          { label: 'Find Facilities', path: '/transport/facilities', icon: '🏭' },
          { label: 'Active Routes', path: '/transport/active', icon: '🚗' },
        ];

      default:
        return commonItems;
    }
  };

  const menuItems = getMenuItems();

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-20'
      } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300 overflow-y-auto`}
    >
      {/* Toggle Button */}
      <div className="flex items-center justify-between p-4">
        {isOpen && (
          <h2 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">Menu</h2>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          title={isOpen ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition ${isOpen ? '' : 'rotate-180'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Menu Items */}
      <nav className="px-2 py-4 space-y-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            {isOpen && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      {isOpen && (
        <div className="p-4 mt-auto border-t border-gray-200 dark:border-gray-700">
          <div className="bg-indigo-50 dark:bg-indigo-900 rounded-lg p-3">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
              Current Role
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
