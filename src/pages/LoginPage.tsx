import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PasswordChangeDialog } from '@/components/auth/PasswordChangeDialog';
import { SnexusLogo } from '@/components/layout/SnexusLogo';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginPage() {
  const { login, isAuthenticated, orgReady, mustChangePassword } = useAuth();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const message = login(name, pin);
    if (message) setError(message);
    setSubmitting(false);
  };

  return (
    <div className="login-page">
      <div className="login-page__backdrop" aria-hidden />
      <div className="login-page__glow login-page__glow--left" aria-hidden />
      <div className="login-page__glow login-page__glow--right" aria-hidden />

      <div className="login-page__content">
        <div className="login-page__brand">
          <SnexusLogo />
          <p className="login-page__tagline">Performance Intelligence Platform</p>
        </div>

        <div className="login-page__card">
          <h1 className="login-page__title">로그인</h1>
          <p className="login-page__subtitle">
            조직관리에 등록된 이름과 비밀번호(4자리)로 접속합니다.
          </p>

          {!orgReady ? (
            <p className="login-page__loading">조직 정보를 불러오는 중…</p>
          ) : (
            <form className="login-page__form" onSubmit={handleSubmit}>
              <Input
                label="ID (이름)"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 홍길동"
                autoComplete="username"
                autoFocus
              />
              <Input
                label="PW (4자리)"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={4}
                pattern="\d{4}"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
              />
              {error && <p className="login-page__error">{error}</p>}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="login-page__submit"
                disabled={submitting || !name.trim() || pin.length !== 4}
              >
                {submitting ? '로그인 중…' : '로그인'}
              </Button>
              <p className="login-page__hint">최초 비밀번호: 1111 (로그인 후 1회 변경)</p>
            </form>
          )}
        </div>
      </div>

      {mustChangePassword && <PasswordChangeDialog />}
    </div>
  );
}
