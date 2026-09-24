"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { describeLoginAuthState } from '@/lib/mfl-auth';
import { SignInForm } from '@/components/sign-in-form';

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AuthControls({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const authState = describeLoginAuthState(auth);
  // Landing gate has its own always-visible form; skip auto-modal there.
  const onLandingGate = pathname === '/';
  const usernameId = useId();
  const passwordId = useId();
  const dialogTitleId = useId();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const handledAuthRef = useRef<string | null>(null);
  const [open, setOpen] = useState(() => Boolean(authState?.openModal) && !onLandingGate);
  const [banner, setBanner] = useState(() => (onLandingGate ? null : authState?.banner ?? null));
  const isClient = useIsClient();

  useEffect(() => {
    // LandingSignIn owns `auth` query UX on the public gate.
    if (onLandingGate) {
      return;
    }

    if (!auth || handledAuthRef.current === auth) {
      return;
    }

    handledAuthRef.current = auth;
    setOpen(Boolean(authState?.openModal));
    setBanner(authState?.banner ?? null);

    const next = new URLSearchParams(searchParams.toString());
    next.delete('auth');
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }, [auth, authState, onLandingGate, pathname, router, searchParams]);

  useEffect(() => {
    if (!banner || banner.kind !== 'success') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setBanner(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [banner]);

  useEffect(() => {
    if (!open) {
      return;
    }

    usernameRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        if (banner?.kind === 'error') {
          setBanner(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [banner?.kind, open]);

  const closeDialog = () => {
    setOpen(false);
    if (banner?.kind === 'error') {
      setBanner(null);
    }
  };

  const modal = open ? (
    <div className="modal-backdrop" role="presentation" onClick={closeDialog}>
      <div
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row auth-modal-head">
          <div>
            <h3 id={dialogTitleId}>Sign in to MFL</h3>
            <p className="muted small">Credentials post to the server and stay out of the browser.</p>
          </div>
          <button type="button" className="button ghost auth-cancel" onClick={closeDialog}>
            Cancel
          </button>
        </div>

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
      </div>
    </div>
  ) : null;

  return (
    <div className="auth-controls">
      {banner?.kind === 'success' ? (
        <div className={`banner login-state ${banner.kind}`} role="status">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>
              {banner.title}
            </div>
            <div className="small muted">{banner.detail}</div>
          </div>
        </div>
      ) : null}

      {authenticated ? (
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="button auth-button">
            Sign out
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="button auth-button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Sign in
        </button>
      )}

      {isClient && modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
