'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push('/automations');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0e17;
          position: relative;
          overflow: hidden;
        }

        .login-page::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background:
            radial-gradient(ellipse at 20% 50%, rgba(80, 161, 254, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(80, 161, 254, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(30, 60, 120, 0.06) 0%, transparent 50%);
          animation: drift 20s ease-in-out infinite alternate;
        }

        @keyframes drift {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-2%, 1%) rotate(1deg); }
        }

        .login-card {
          position: relative;
          width: 100%;
          max-width: 400px;
          margin: 0 24px;
          padding: 48px 40px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          backdrop-filter: blur(40px);
        }

        .login-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 1px;
          background: linear-gradient(160deg, rgba(80, 161, 254, 0.15), transparent 40%, transparent 60%, rgba(80, 161, 254, 0.05));
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          pointer-events: none;
        }

        .brand-mark {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 36px;
        }

        .brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #50a1fe 0%, #3b82f6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          color: white;
          letter-spacing: -0.5px;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-name {
          font-size: 17px;
          font-weight: 700;
          color: #e8ecf4;
          letter-spacing: -0.3px;
          line-height: 1.2;
        }

        .brand-sub {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.35);
          font-weight: 500;
          letter-spacing: 0.3px;
        }

        .login-title {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 28px;
          letter-spacing: 0.2px;
        }

        .form-group {
          margin-bottom: 18px;
        }

        .form-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #e8ecf4;
          font-size: 14px;
          font-family: inherit;
          transition: all 0.2s;
          outline: none;
          box-sizing: border-box;
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.2);
        }

        .form-input:focus {
          border-color: rgba(80, 161, 254, 0.4);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 3px rgba(80, 161, 254, 0.08);
        }

        .login-btn {
          width: 100%;
          padding: 13px;
          margin-top: 8px;
          background: linear-gradient(135deg, #50a1fe 0%, #3b82f6 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.2px;
        }

        .login-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(80, 161, 254, 0.25);
        }

        .login-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.99);
        }

        .login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-msg {
          margin-top: 16px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 10px;
          color: #f87171;
          font-size: 13px;
          text-align: center;
        }
      `}</style>

      <div className="login-card">
        <div className="brand-mark">
          <div className="brand-icon">AIT</div>
          <div className="brand-text">
            <span className="brand-name">Operations Center</span>
            <span className="brand-sub">All In IT Solutions</span>
          </div>
        </div>

        <p className="login-title">Sign in to continue</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="form-input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>
    </div>
  );
}
