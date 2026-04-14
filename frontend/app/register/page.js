'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    room_no: '',
    hostel_id: 'HOSTEL-A',
    phone: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (form.password.length < 6) {
        throw { message: 'Password must be at least 6 characters.' };
      }

      await register(form);
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🏨</div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join SmartHostel</p>
        </div>

        {error && (
          <div className="alert alert-error" id="register-error">
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" id="register-success">
            <span>✅</span> {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Role Selector */}
          <div className="role-selector">
            {['student', 'warden', 'security'].map((role) => (
              <button
                key={role}
                type="button"
                className={`role-option ${form.role === role ? 'active' : ''}`}
                onClick={() => setForm((prev) => ({ ...prev, role }))}
                id={`role-${role}`}
              >
                {role === 'student' ? '🎓' : role === 'warden' ? '👔' : '🛡️'}{' '}
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className="form-input"
              placeholder="Enter your full name"
              value={form.name}
              onChange={handleChange('name')}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              className="form-input"
              placeholder="Enter your email"
              value={form.email}
              onChange={handleChange('email')}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              className="form-input"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={handleChange('password')}
              required
              minLength={6}
            />
          </div>

          {form.role === 'student' && (
            <div className="form-group">
              <label className="form-label" htmlFor="reg-room">Room Number</label>
              <input
                id="reg-room"
                type="text"
                className="form-input"
                placeholder="e.g. 101"
                value={form.room_no}
                onChange={handleChange('room_no')}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="reg-hostel">Hostel</label>
            <select
              id="reg-hostel"
              className="form-select"
              value={form.hostel_id}
              onChange={handleChange('hostel_id')}
              required
            >
              <option value="HOSTEL-A">Hostel A</option>
              <option value="HOSTEL-B">Hostel B</option>
              <option value="HOSTEL-C">Hostel C</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            id="register-submit"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
