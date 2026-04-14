'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    // Redirect to role-specific dashboard
    switch (user.role) {
      case 'student':
        router.replace('/student');
        break;
      case 'warden':
        router.replace('/warden');
        break;
      case 'security':
        router.replace('/security');
        break;
      default:
        router.replace('/login');
    }
  }, [user, loading, router]);

  return (
    <div className="loading-screen">
      <div className="spinner spinner-lg"></div>
      <p style={{ color: 'var(--text-secondary)' }}>Loading SmartHostel...</p>
    </div>
  );
}
