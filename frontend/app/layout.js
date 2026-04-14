import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata = {
  title: 'SmartHostel — Hostel Management System',
  description: 'Real-time hostel management with digital attendance, gate pass system, and live dashboard for wardens.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
