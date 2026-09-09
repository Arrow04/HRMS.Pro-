import React from 'react';
import { Link } from 'react-router-dom';
import { FileX2 } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center animate-page-enter" style={{ background: 'var(--background)' }}>
      <div className="text-center px-6">
        {/* Illustration-like element */}
        <div className="relative mx-auto mb-6" style={{ width: '120px', height: '120px' }}>
          <div className="absolute inset-0 rounded-full opacity-10"
            style={{ background: 'var(--gradient-primary)' }} />
          <div className="absolute inset-3 rounded-full opacity-20"
            style={{ background: 'var(--gradient-primary)' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <FileX2 className="w-12 h-12" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </div>

        {/* Large gradient 404 */}
        <h1 className="text-8xl font-extrabold leading-none"
          style={{
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
          404
        </h1>

        <p className="mt-4 text-xl font-medium" style={{ color: 'var(--text-heading)' }}>
          Page not found
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Link to="/login"
          className="btn-primary mt-8 inline-flex items-center gap-2"
          style={{ textDecoration: 'none' }}>
          Go to login
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
