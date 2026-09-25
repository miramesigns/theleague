import type { Ref } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SignInFormProps = {
  usernameId: string;
  passwordId: string;
  usernameRef?: Ref<HTMLInputElement>;
  submitLabel?: string;
};

export function SignInForm({
  usernameId,
  passwordId,
  usernameRef,
  submitLabel = 'Sign in',
}: SignInFormProps) {
  return (
    <form action="/api/auth/login-form" method="post" className="stack auth-form">
      <div className="stack gap-1.5">
        <Label htmlFor={usernameId} className="small muted">
          MFL username
        </Label>
        <Input
          ref={usernameRef}
          id={usernameId}
          className="auth-field min-h-11"
          name="username"
          autoComplete="username"
          required
        />
      </div>
      <div className="stack gap-1.5">
        <Label htmlFor={passwordId} className="small muted">
          Password
        </Label>
        <Input
          id={passwordId}
          className="auth-field min-h-11"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button className="auth-submit min-h-11" type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
