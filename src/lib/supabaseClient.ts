import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev rather than silently making broken requests.
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values.',
  );
}

/**
 * Shared Supabase client for the whole app.
 *
 * Only ever uses the public anon key (safe for frontend code). The
 * service-role key must never be imported into frontend code — it belongs
 * only in server-side/admin contexts, which Timo does not have yet.
 */
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
