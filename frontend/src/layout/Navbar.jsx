import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { complaintsAPI } from '../utils/api';

const ROLE_COLORS = {
  citizen: { bg: 'from-blue-600 to-blue-700', dot: 'bg-blue-400', text: 'text-blue-300', label: 'Citizen' },
  authority: { bg: 'from-purple-600 to-purple-700', dot: 'bg-purple-400', text: 'text-purple-300', label: 'Authority' },
  admin: { bg: 'from-rose-600 to-rose-700', dot: 'bg-rose-400', text: 'text-rose-300', label: 'Admin' },
};

const ShieldIcon = () => (
  <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path d="M20 2L4 9v13c0 11.5 6.8 21.3 16 25 9.2-3.7 16-13.5 16-25V9L20 2z" fill="url(#shieldGrad)" />
    <path d="M20 2L4 9v13c0 11.5 6.8 21.3 16 25 9.2-3.7 16-13.5 16-25V9L20 2z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
    <path d="M14 24l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="shieldGrad" x1="4" y1="2" x2="36" y2="47" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
  </svg>
);

const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden md:flex flex-col items-end">
      <span className="text-xs font-mono text-gray-300 leading-none">
        {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-xs text-gray-500 leading-none mt-0.5">
        {time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
    </div>
  );
};

const NotificationBell = ({ user }) => {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref = useRef();

  useEffect(() => {
    if (!user) return;
    complaintsAPI.getNotifications()
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : (data.results ?? []);
        setNotifications(items.slice(0, 6));
        setCount(items.filter(n => !n.is_read).length);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async () => {
    try {
      await complaintsAPI.markNotificationsRead();
      setCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl hover:bg-white/10 transition-all duration-200 group"
        title="Notifications"
      >
        <svg className="w-5 h-5 text-gray-300 group-hover:text-white transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse-once">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {count > 0 && (
              <button onClick={markRead} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">No notifications</div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} className={`px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/50 transition ${!n.is_read ? 'bg-gray-700/30' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />}
                    <div className={!n.is_read ? '' : 'ml-4'}>
                      <p className="text-xs text-gray-200 leading-relaxed">{n.message || 'Status updated'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.created_at || ''}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/80">
            <Link to="/citizen/notifications" onClick={() => setOpen(false)} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

const UserMenu = ({ user, logout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();
  const role = ROLE_COLORS[user?.role] ?? ROLE_COLORS.citizen;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user ? `${(user.first_name?.[0] || user.username?.[0] || 'U').toUpperCase()}${(user.last_name?.[0] || '').toUpperCase()}` : 'U';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/10 transition-all duration-200">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${role.bg} flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
          {initials}
        </div>
        <div className="hidden md:flex flex-col items-start">
          <span className="text-xs font-semibold text-white leading-none">{user?.first_name || user?.username}</span>
          <span className={`text-[10px] font-medium ${role.text} leading-none mt-0.5`}>{role.label}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm font-semibold text-white">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="py-1">
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              My Profile
            </Link>
          </div>
          <div className="py-1 border-t border-gray-700">
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-gray-900 border-b border-gray-700/50 shadow-xl z-40 flex-shrink-0">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <ShieldIcon />
          <div>
            <h1 className="text-base font-extrabold text-white tracking-widest leading-none">SURAKSHA</h1>
            <p className="text-[9px] text-gray-500 tracking-widest leading-none mt-0.5">SAFETY INTELLIGENCE PLATFORM</p>
          </div>
        </div>

        {/* Right Controls */}
        {user && (
          <div className="flex items-center gap-3">
            <LiveClock />
            <div className="w-px h-6 bg-gray-700" />
            <NotificationBell user={user} />
            <div className="w-px h-6 bg-gray-700" />
            <UserMenu user={user} logout={logout} />
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
