"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { describeLoginAuthState } from '@/lib/mfl-auth';
import { SignInForm } from '@/components/sign-in-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const handledAuthRef = useRef<string | null>(null);
  const [open, setOpen] = useState(() => Boolean(authState?.openModal) && !onLandingGate);
  const [banner, setBanner] = useState(() => {
    if (onLandingGate) return null;
    // Success feedback is a toast — never seed a success banner in the header.
    if (authState?.banner?.kind === 'success') return null;
    return authState?.banner ?? null;
  });

  useEffect(() => {
    // LandingSignIn owns `auth` query UX on the public gate.
    if (onLandingGate) {
      return;
    }

    if (!auth || handledAuthRef.current === auth) {
      return;
    }

    handledAuthRef.current = auth;

    if (authState?.banner?.kind === 'success') {
      toast.success(authState.banner.title, { description: authState.banner.detail });
    }

    const nextOpen = Boolean(authState?.openModal);
    const nextBanner = authState?.banner?.kind === 'error' ? authState.banner : null;
    // Defer React state updates so this effect only syncs the URL + toast immediately.
    const timer = window.setTimeout(() => {
      setOpen(nextOpen);
      setBanner(nextBanner);
    }, 0);

    const next = new URLSearchParams(searchParams.toString());
    next.delete('auth');
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });

    return () => window.clearTimeout(timer);
  }, [auth, authState, onLandingGate, pathname, router, searchParams]);

  useEffect(() => {
    if (!open) {
      return;
    }

    usernameRef.current?.focus();
  }, [open]);

  const closeDialog = () => {
    setOpen(false);
    if (banner?.kind === 'error') {
      setBanner(null);
    }
  };

  // Landing gate already has the credential form — no floating header Sign in.
  if (onLandingGate && !authenticated) {
    return null;
  }

  return (
    <div className="auth-controls">
      {authenticated ? (
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="auth-button min-h-11 min-w-24">
            Sign out
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="auth-button min-h-11 min-w-24"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Sign in
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            closeDialog();
          } else {
            setOpen(true);
          }
        }}
      >
        <DialogContent className="auth-modal sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Sign in to MFL</DialogTitle>
            <DialogDescription>
              Credentials post to the server and stay out of the browser.
            </DialogDescription>
          </DialogHeader>

          {banner?.kind === 'error' ? (
            <Alert variant="destructive">
              <AlertTitle>{banner.title}</AlertTitle>
              <AlertDescription>{banner.detail}</AlertDescription>
            </Alert>
          ) : null}

          <SignInForm
            usernameId={usernameId}
            passwordId={passwordId}
            usernameRef={usernameRef}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
