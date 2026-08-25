import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Supabase/PostgREST errors are plain objects ({ message, details, hint, code }),
 * NOT instances of the built-in `Error` — so `err instanceof Error` checks
 * elsewhere in the app would silently swallow them and fall back to a
 * generic message. This wraps them in a real `Error` (with the original
 * info attached) so the actual cause is preserved and can be surfaced/logged.
 * Only non-secret diagnostic fields are attached — never credentials/tokens.
 */
export function toSupabaseError(context: string, error: PostgrestError): Error {
  const parts = [error.message];
  if (error.code) parts.push(`code: ${error.code}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  const err = new Error(`${context}: ${parts.join(' — ')}`);
  Object.assign(err, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  // eslint-disable-next-line no-console
  console.error(`[supabase] ${context}`, error);
  return err;
}
