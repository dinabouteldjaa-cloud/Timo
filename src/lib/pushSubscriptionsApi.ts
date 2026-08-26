import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';

// ---------------------------------------------------------------------------
// Client-side access to `push_subscriptions` (see
// supabase/migrations/0006_push_notifications.sql). Only ever touches the
// signed-in user's own rows — RLS enforces this regardless, but the
// queries below are already scoped that way for clarity.
//
// Sending notifications is never done from the client — that happens
// entirely inside the push-reminders Edge Function using the service-role
// key. This module only registers/removes *which devices* should receive
// them.
// ---------------------------------------------------------------------------

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/** Saves (or refreshes) this device's push subscription for the signed-in user. */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw toSupabaseError('Could not save push subscription', error);
}

/** Removes this device's push subscription (used when the user disables notifications). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw toSupabaseError('Could not remove push subscription', error);
}

/** Checks whether this exact device (endpoint) already has a saved subscription. */
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .maybeSingle();

  if (error) throw toSupabaseError('Could not check push subscription', error);
  return Boolean(data);
}
