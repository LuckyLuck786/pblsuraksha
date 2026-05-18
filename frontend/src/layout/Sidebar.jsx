import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_CONFIG = {
  citizen: {
    gradient: 'from-blue-900/60 to-blue-950',
    accent: 'bg-blue-500',
    activeGlow: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    hoverBg: 'hover:bg-blue-500/10',
    iconColor: 'text-blue-400',
    badge: 'bg-blue-900/80 text-blue-300 border border-blue-700',
    dot: 'bg-blue-400',
    label: 'Citizen Portal',
  },
  authority: {
    gradient: 'from-purple-900/60 to-purple-950',
    accent: 'bg-purple-500',
    activeGlow: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    hoverBg: 'hover:bg-purple-500/10',
    iconColor: 'text-purple-400',
    badge: 'bg-purple-900/80 text-purple-300 border border-purple-700',
    dot: 'bg-purple-400',
    label: 'Authority Dashboard',
  },
  admin: {
    gradient: 'from-rose-900/60 to-rose-950',
    accent: 'bg-rose-500',
    activeGlow: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    hoverBg: 'hover:bg-rose-500/10',
    iconColor: 'text-rose-400',
    badge: 'bg-rose-900/80 text-rose-300 border border-rose-700',
    dot: 'bg-rose-400',
    label: 'Admin Control',
  },
};

const ICONS = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  profile: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  complaint: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  list: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  bell: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  map: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  chart: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  truck: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1.5 1.5M13 16H4m9 0l1.5 1.5M13 6l2.2 4H21l-1 6h-1.5" />
    </svg>
  ),
  factory: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  route: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  brain: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  trend: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  anonymous: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const getMenuItems = (role) => {
  const common = [
    { label: 'Dashboard', path: (role === 'admin' || role === 'authority') ? '/admin/dashboard' : '/dashboard', icon: ICONS.dashboard },
    { label: 'Profile', path: '/profile', icon: ICONS.profile },
  ];

  if (role === 'citizen') return [
    ...common,
    { label: 'File Complaint', path: '/citizen/complaint/new', icon: ICONS.complaint, badge: 'New' },
    { label: 'My Complaints', path: '/citizen/complaints', icon: ICONS.list },
    { label: 'Anonymous Tip', path: '/citizen/tip', icon: ICONS.anonymous },
    { label: 'Notifications', path: '/citizen/notifications', icon: ICONS.bell },
  ];

  if (role === 'authority' || role === 'admin') return [
    ...common,
    { label: 'All Complaints', path: '/admin/complaints', icon: ICONS.list },
    { label: 'Crime Hotspots', path: '/admin/hotspots', icon: ICONS.map },
    { label: 'Predicted Hotspots', path: '/admin/predicted-hotspots', icon: ICONS.shield },
    { label: 'Analytics', path: '/admin/analytics', icon: ICONS.chart },
    { label: 'Crime Trends', path: '/admin/trends', icon: ICONS.trend },
    { label: 'NL Query', path: '/admin/nl-query', icon: ICONS.search },
    { label: 'Users', path: '/admin/users', icon: ICONS.users },
    { label: 'LLM Analytics', path: '/admin/llm-analytics', icon: ICONS.brain },
  ];

  return common;
};

const CollapseIcon = ({ collapsed }) => (
  <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const Sidebar = () => {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const role = user.role ?? 'citizen';
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.citizen;
  const menuItems = getMenuItems(role);

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-gray-900 border-r border-gray-700/50 flex flex-col transition-all duration-300 ease-in-out overflow-hidden`}
    >
      {/* Role header strip */}
      <div className={`relative flex items-center justify-between px-3 py-3 bg-gradient-to-r ${cfg.gradient} border-b border-gray-700/50`}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full ${cfg.dot} shadow-glow flex-shrink-0`} />
            <span className="text-xs font-semibold text-gray-300 truncate">{cfg.label}</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="ml-auto p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
                isActive
                  ? `${cfg.activeGlow} shadow-sm`
                  : `text-gray-400 ${cfg.hoverBg} hover:text-gray-200`
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex-shrink-0 ${isActive ? '' : `group-hover:${cfg.iconColor}`}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-gray-700/50">
          <div className={`rounded-lg p-2.5 bg-gradient-to-r ${cfg.gradient} border border-gray-700/50`}>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Logged in as</p>
            <p className="text-sm font-semibold text-white truncate mt-0.5">{user.first_name || user.username}</p>
            <p className={`text-[10px] ${cfg.iconColor} font-medium mt-0.5`}>{cfg.label}</p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
