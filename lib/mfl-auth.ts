export type LoginAuthQuery = 'open' | 'ok' | 'invalid' | 'unavailable' | 'missing' | 'cookie';

export type LoginAuthBanner = {
  kind: 'success' | 'error';
  title: string;
  detail: string;
};

export type LoginAuthState = {
  openModal: boolean;
  banner: LoginAuthBanner | null;
};

export function buildLoginRedirectPath(auth: Exclude<LoginAuthQuery, 'open'>): string {
  return `/scores?auth=${auth}`;
}

export function describeLoginAuthState(auth: string | null | undefined): LoginAuthState | null {
  switch (auth) {
    case 'open':
      return { openModal: true, banner: null };
    case 'ok':
      return {
        openModal: false,
        banner: {
          kind: 'success',
          title: 'Sign in successful.',
          detail: 'Your MFL session cookie is ready.',
        },
      };
    case 'invalid':
      return {
        openModal: true,
        banner: {
          kind: 'error',
          title: 'Login was not successful.',
          detail: 'Invalid credentials or MFL access could not be verified.',
        },
      };
    case 'unavailable':
      return {
        openModal: true,
        banner: {
          kind: 'error',
          title: 'Login was not successful.',
          detail: 'MFL login is temporarily unavailable. Try again in a moment.',
        },
      };
    case 'missing':
      return {
        openModal: true,
        banner: {
          kind: 'error',
          title: 'Login was not successful.',
          detail: 'Please enter both fields to continue.',
        },
      };
    case 'cookie':
      return {
        openModal: true,
        banner: {
          kind: 'error',
          title: 'Login was not successful.',
          detail: 'Login succeeded upstream, but the session cookie could not be stored.',
        },
      };
    default:
      return null;
  }
}
