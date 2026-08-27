import { supabase } from './supabaseClient';
import type { BrainDumpSuggestion } from '../types/brainDump';

// ---------------------------------------------------------------------------
// Calls the brain-dump Edge Function, which does the actual AI request
// server-side (see supabase/functions/brain-dump/index.ts). This module
// only ever returns SUGGESTIONS — creating the approved items still goes
// through the existing addTask/addEvent flow in AppStateContext, so RLS
// and normal validation apply exactly as they do everywhere else.
//
// Errors from supabase.functions.invoke() have a different shape than the
// PostgrestError the rest of the app's toSupabaseError() helper expects
// (FunctionsHttpError/FunctionsRelayError/FunctionsFetchError), so this
// module handles them locally instead of forcing an ill-fitting reuse.
// ---------------------------------------------------------------------------

interface RawSuggestion {
  type: 'task' | 'event';
  title: string;
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  priority?: BrainDumpSuggestion['priority'];
  category?: BrainDumpSuggestion['category'];
  estimatedMinutes?: number;
  eventType?: BrainDumpSuggestion['eventType'];
  location?: string;
  confidence?: number;
}

let nextClientId = 0;
function makeClientId(): string {
  nextClientId += 1;
  return `suggestion-${Date.now()}-${nextClientId}`;
}

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof context === 'object' && 'json' in context) {
    try {
      const body = await (context as { json: () => Promise<{ error?: string }> }).json();
      if (body?.error) return body.error;
    } catch {
      // Response body wasn't JSON or already consumed — fall through.
    }
  }
  return null;
}

export async function organizeBrainDump(text: string): Promise<BrainDumpSuggestion[]> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const { data, error } = await supabase.functions.invoke('brain-dump', {
    body: { text, localDate, localTime },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[brainDumpApi] organize failed', error);
    const forwardedMessage = await extractFunctionErrorMessage(error);
    throw new Error(forwardedMessage || "Timo couldn't organize that right now. Try again.");
  }

  const suggestions = (data?.suggestions ?? []) as RawSuggestion[];
  return suggestions.map((s) => ({ ...s, id: makeClientId(), included: true }));
}
