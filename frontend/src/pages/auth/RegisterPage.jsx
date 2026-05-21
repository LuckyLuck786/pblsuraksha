import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const STEPS = ['Role & Name', 'Account Details', 'Contact Info'];
const ROLES = [
  { value: 'citizen',   label: 'Citizen',          icon: '👤', desc: 'Report incidents & track cases' },
  { value: 'authority', label: 'Police Authority',  icon: '🚔', desc: 'Manage & resolve complaints' },
];

const InputField = ({ label, icon, error, ...props }) => (
  <div>
    {label && <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>}
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{icon}</span>}
      <input
        className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-700'} text-white placeholder-gray-500 rounded-xl ${icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition`}
        {...props}
      />
    </div>
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [role, setRole]       = useState('citizen');
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors]   = useState({});

  const [form, setForm] = useState({
    username: '', email: '', password: '', password_confirm: '',
    first_name: '', last_name: '', phone: '', city: '', state: 'Karnataka',
    badge_number: '', station_name: '',
  });

  const update = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(e => ({ ...e, [name]: undefined }));
  };

  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!form.first_name.trim()) errs.first_name = 'Required';
    }
    if (step === 1) {
      if (!form.username.trim()) errs.username = 'Required';
      if (!form.email.includes('@')) errs.email = 'Valid email required';
      if (form.password.length < 6) errs.password = 'Minimum 6 characters';
      if (form.password !== form.password_confirm) errs.password_confirm = 'Passwords do not match';
    }
    if (step === 2) {
      if (!form.phone.trim()) errs.phone = 'Phone number is required';
      else if (!/^\+?[\d\s\-().]{7,15}$/.test(form.phone.trim())) errs.phone = 'Enter a valid phone number';
      if (!form.city.trim()) errs.city = 'Required';
      if (role === 'authority' && !form.badge_number.trim()) errs.badge_number = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep(s => s + 1);
  };

  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);
    try {
      const payload = { ...form, role };
      if (role !== 'authority') { delete payload.badge_number; delete payload.station_name; }
      const data = await register(payload);

      // Prompt the browser to save credentials (shows native "Save password?" dialog)
      if (window.PasswordCredential) {
        try {
          const credential = new window.PasswordCredential({
            id: form.username,
            password: form.password,
            name: `${form.first_name} ${form.last_name}`.trim() || form.username,
          });
          await navigator.credentials.store(credential);
        } catch {
          // Credential Management API not available or user dismissed — non-fatal
        }
      }

      toast.success('Account created! Welcome to Safe City Connect 🛡️');
      const r = data?.user?.role;
      if (r === 'admin' || r === 'authority') navigate('/admin/dashboard');
      else navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.username?.[0]
        || err.response?.data?.email?.[0]
        || err.response?.data?.phone?.[0]
        || err.response?.data?.detail
        || 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ── Step content ───────────────────────────────────────────────────────── */
  const stepContent = {
    0: (
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">I am registering as a:</label>
          <div className="space-y-2">
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                  role === r.value
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-900/20'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <span className="text-2xl">{r.icon}</span>
                <div>
                  <p className={`font-semibold text-sm ${role === r.value ? 'text-indigo-300' : 'text-white'}`}>{r.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
                </div>
                {role === r.value && (
                  <svg className="ml-auto w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="First Name *" name="first_name" value={form.first_name} onChange={update} placeholder="First name" error={errors.first_name} required />
          <InputField label="Last Name" name="last_name" value={form.last_name} onChange={update} placeholder="Last name" />
        </div>
      </div>
    ),

    1: (
      <div className="space-y-4">
        <InputField label="Username *" icon="@" name="username" value={form.username} onChange={update} placeholder="Choose a username" error={errors.username} required autoComplete="username" />
        <InputField label="Email *" icon="✉" name="email" type="email" value={form.email} onChange={update} placeholder="your@email.com" error={errors.email} required autoComplete="email" />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Password *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔒</span>
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={update}
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
              className={`w-full bg-gray-800 border ${errors.password ? 'border-red-500' : 'border-gray-700'} text-white placeholder-gray-500 rounded-xl pl-10 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition`}
            />
            <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition text-xs">
              {showPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔒</span>
            <input
              name="password_confirm"
              type={showPwd ? 'text' : 'password'}
              value={form.password_confirm}
              onChange={update}
              placeholder="Repeat your password"
              autoComplete="new-password"
              className={`w-full bg-gray-800 border ${errors.password_confirm ? 'border-red-500' : 'border-gray-700'} text-white placeholder-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition`}
            />
          </div>
          {errors.password_confirm && <p className="text-red-400 text-xs mt-1">{errors.password_confirm}</p>}
        </div>
      </div>
    ),

    2: (
      <div className="space-y-4">
        <InputField
          label="Phone Number *"
          icon="📞"
          name="phone"
          type="tel"
          value={form.phone}
          onChange={update}
          placeholder="+91 XXXXX XXXXX"
          autoComplete="tel"
          error={errors.phone}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="City *" name="city" value={form.city} onChange={update} placeholder="Your city" error={errors.city} required />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">State</label>
            <select
              name="state"
              value={form.state}
              onChange={update}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            >
              {['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Goa'].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {role === 'authority' && (
          <div className="p-4 bg-purple-900/20 border border-purple-700/40 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Authority Details</p>
            <InputField label="Badge Number *" name="badge_number" value={form.badge_number} onChange={update} placeholder="e.g., KA-B-1234" error={errors.badge_number} required />
            <InputField label="Police Station" name="station_name" value={form.station_name} onChange={update} placeholder="Station name" />
          </div>
        )}
      </div>
    ),
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex bg-gray-950">
      {/* Left branding strip */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-center items-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 p-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <svg viewBox="0 0 40 48" fill="none" className="w-12 h-12">
              <path d="M20 2L4 9v13c0 11.5 6.8 21.3 16 25 9.2-3.7 16-13.5 16-25V9L20 2z" fill="white" fillOpacity="0.9" />
              <path d="M14 24l4 4 8-8" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-widest mb-2">SAFE CITY CONNECT</h1>
          <p className="text-indigo-300 text-sm tracking-wider mb-8">URBAN SAFETY PLATFORM</p>
          <p className="text-indigo-200/70 text-sm leading-relaxed max-w-xs">
            Join thousands of citizens and authorities using AI-powered tools to build safer communities.
          </p>

          {/* Step indicators */}
          <div className="mt-10 space-y-3 text-left w-full max-w-xs mx-auto">
            {STEPS.map((label, i) => (
              <div key={i} className={`flex items-center gap-3 transition-all ${i <= step ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                  i < step ? 'bg-green-500 text-white' : i === step ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/40'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${i === step ? 'text-indigo-200 font-semibold' : 'text-indigo-300/60'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-white">Create Account</h2>
            <p className="text-gray-400 text-sm mt-1">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1 mb-8">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= step ? 'bg-indigo-500' : 'bg-gray-700'}`}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {stepContent[step]}

            <div className="flex gap-3 mt-8">
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-800 transition text-sm font-medium"
                >
                  ← Back
                </button>
              )}
              {!isLastStep ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition text-sm shadow-lg shadow-indigo-900/40"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition text-sm shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating Account...
                    </>
                  ) : '🛡️ Create Account'}
                </button>
              )}
            </div>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
