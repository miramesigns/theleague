import type { Ref } from 'react';

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
      <label className="stack" htmlFor={usernameId}>
        <span className="small muted">MFL username</span>
        <input
          ref={usernameRef}
          id={usernameId}
          className="field auth-field"
          name="username"
          autoComplete="username"
          required
        />
      </label>
      <label className="stack" htmlFor={passwordId}>
        <span className="small muted">Password</span>
        <input
          id={passwordId}
          className="field auth-field"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <button className="button primary auth-submit" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
