const SENSITIVE_QUERY_KEY_PATTERN = /(?:^|[^a-z])(user(?:name)?|pass(?:word)?|pwd|credential|login)(?:[^a-z]|$)/i;

export function hasSensitiveCredentialQueryKey(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      return true;
    }
  }

  return false;
}
