import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function PasswordChangeDialog() {
  const { mustChangePassword, completePasswordChange, session } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mustChangePassword) {
      setNewPin('');
      setConfirmPin('');
      setError('');
    }
  }, [mustChangePassword]);

  if (!mustChangePassword) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = completePasswordChange(newPin, confirmPin);
    if (message) {
      setError(message);
      return;
    }
    setError('');
  };

  return (
    <div className="login-password-change" role="dialog" aria-modal="true">
      <div className="login-password-change__panel">
        <h2 className="login-password-change__title">PW 재설정</h2>
        <p className="login-password-change__lead">
          <strong>{session?.name}</strong> 님, 최초 로그인입니다.
        </p>
        <p className="login-password-change__guide">
          보안을 위해 <strong>단 1회만</strong> 사용할 새 비밀번호(4자리 숫자)를 설정해 주세요.
        </p>

        <form className="login-password-change__form" onSubmit={handleSubmit}>
          <Input
            label="새 비밀번호"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="\d{4}"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4자리 숫자"
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="\d{4}"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4자리 숫자"
          />
          {error && <p className="login-password-change__error">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="login-password-change__submit">
            비밀번호 저장 후 시작
          </Button>
        </form>
      </div>
    </div>
  );
}
