"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { describeLoginAuthState } from '@/lib/mfl-auth';
import { SignInForm } from '@/components/sign-in-form';

/**
 * Always-visible MFL credential form for the signed-out landing gate.
 * Prefer this over the header modal on iOS Safari (no popup / no clipped dialog).
 */
export function LandingSignIn() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const authState = describeLoginAuthState(auth);
  const usernameId = useId();
  const passwordId = useId();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const handledAuthRef = useRef<string | null>(null);
  const [banner, setBanner] = useState(authState?.banner ?? null);

  useEffect(() => {
    if (!auth || handledAuthRef.current === auth) {
      return;
    }

    handledAuthRef.current = auth;
    setBanner(authState?.banner ?? null);

    const next = new URLSearchParams(searchParams.toString());
    next.delete('auth');
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });

    // Focus the always-visible form when redirected here for sign-in.
    if (authState?.openModal || auth === 'open') {
      window.requestAnimationFrame(() => usernameRef.current?.focus());
    }
  }, [auth, authState, pathname, router, searchParams]);

  return (
    <div className="stack landing-sign-in">
      {banner?.kind === 'error' ? (
        <div className="banner login-state error" role="alert">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>
              {banner.title}
            </div>
            <div className="small muted">{banner.detail}</div>
          </div>
        </div>
      ) : null}

      <SignInForm
        usernameId={usernameId}
        passwordId={passwordId}
        usernameRef={usernameRef}
      />

      <p className="small muted">
        Enter your MyFantasyLeague username and password. Sign-in posts to this app and sets a secure session cookie — no popup window required.
      </p>
    </div>
  );
}
