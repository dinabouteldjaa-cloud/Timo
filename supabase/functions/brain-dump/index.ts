// Timo — brain-dump Edge Function
// ============================================================================
// Turns messy natural-language planning text into structured Task/Event
// SUGGESTIONS only. This function never writes to the database — creation
// happens back on the client through the existing authenticated
// addTask/addEvent flow (and therefore existing RLS), after the user has
// reviewed and approved suggestions on the Review screen.
//
// DEPLOYMENT — deploy this WITH the default JWT verification (do NOT use
// --no-verify-jwt here, unlike push-reminders): this endpoint is called by
// a signed-in user via `supabase.functions.invoke()`, which automatically
// attaches their session's Authorization header. Supabase's gateway
// rejects unauthenticated calls before this code even runs, which is
// exactly the behavior we want:
//
//     npx supabase functions deploy brain-dump
//
// CORS: the browser sends an OPTIONS preflight before the real POST when
// calling this function from the frontend. That preflight is answered
// first, before any other check, and the same CORS headers are attached
// to every response (success and every error path) below — otherwise the
// browser blocks the actual POST from ever being sent, regardless of
// authentication.
//
// Required secret (set with `npx supabase secrets set NAME=value`):
//   GROQ_API_KEY — private key for the Groq API. NEVER placed in
//                 frontend/Vite code; used only inside this function.
//
//     npx supabase secrets set GROQ_API_KEY='YOUR_GROQ_API_KEY'
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically by the
// Edge Functions runtime.
//
// AI provider: Groq (model: openai/gpt-oss-20b), matching the provider
// already used for Auron so Timo doesn't introduce a second paid AI
// account. Chosen specifically because:
//   - It is Groq's current, actively-supported lightweight model for
//     fast/general-purpose extraction tasks (verified against Groq's own
//     model and deprecation documentation before choosing it — Groq's
//     older lightweight models, e.g. llama-3.1-8b-instant, have already
//     been shut down).
//   - It's fast (LPU inference, ~1000 tokens/sec) and cheap, appropriate
//     for a small job like turning one paragraph into a handful of
//     strictly-typed JSON records — no need for a larger/slower model.
//   - It supports Groq's Structured Outputs (response_format:
//     "json_schema"), which is used here instead of the looser
//     "json_object" mode — json_object only guarantees *some* valid JSON,
//     not any particular shape, which is what let the model return
//     well-formed JSON that nonetheless didn't match the { suggestions:
//     [...] } contract this function expects. json_schema forces the
//     model to conform to SUGGESTION_JSON_SCHEMA below.
// The provider is called through a single small `callGroq()` function
// below rather than a vendor SDK, so swapping providers/models later only
// means changing this one function, not the rest of the codebase.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const TASK_CATEGORIES = ['work', 'personal', 'health', 'errands', 'learning', 'other'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
const EVENT_TYPES = ['event', 'meeting'] as const;

type TaskCategory = (typeof TASK_CATEGORIES)[number];
type TaskPriority = (typeof TASK_PRIORITIES)[number];
type EventType = (typeof EVENT_TYPES)[number];

interface RawSuggestion {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  date?: unknown;
  time?: unknown;
  endTime?: unknown;
  priority?: unknown;
  category?: unknown;
  estimatedMinutes?: unknown;
  eventType?: unknown;
  location?: unknown;
  confidence?: unknown;
}

interface NormalizedSuggestion {
  type: 'task' | 'event';
  title: string;
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  estimatedMinutes?: number;
  eventType?: EventType;
  location?: string;
  confidence?: number;
}

const MAX_INPUT_LENGTH = 4000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validates and coerces one raw model item into a safe, schema-conforming suggestion, or null if unusable. */
function normalizeSuggestion(raw: RawSuggestion): NormalizedSuggestion | null {
  if (raw.type !== 'task' && raw.type !== 'event') return null;
  if (!isNonEmptyString(raw.title)) return null;

  const title = raw.title.trim().slice(0, 200);
  const description =
    isNonEmptyString(raw.description) ? raw.description.trim().slice(0, 1000) : undefined;
  const date = typeof raw.date === 'string' && DATE_RE.test(raw.date) ? raw.date : undefined;
  const time = typeof raw.time === 'string' && TIME_RE.test(raw.time) ? raw.time : undefined;
  const endTime =
    typeof raw.endTime === 'string' && TIME_RE.test(raw.endTime) ? raw.endTime : undefined;
  const priority = TASK_PRIORITIES.includes(raw.priority as TaskPriority)
    ? (raw.priority as TaskPriority)
    : undefined;
  const category = TASK_CATEGORIES.includes(raw.category as TaskCategory)
    ? (raw.category as TaskCategory)
    : undefined;
  const eventType = EVENT_TYPES.includes(raw.eventType as EventType)
    ? (raw.eventType as EventType)
    : undefined;
  const location = isNonEmptyString(raw.location) ? raw.location.trim().slice(0, 200) : undefined;

  let estimatedMinutes: number | undefined;
  if (typeof raw.estimatedMinutes === 'number' && Number.isFinite(raw.estimatedMinutes)) {
    estimatedMinutes = Math.max(0, Math.min(1440, Math.round(raw.estimatedMinutes)));
  }

  let confidence: number | undefined;
  if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) {
    confidence = Math.max(0, Math.min(1, raw.confidence));
  }

  if (raw.type === 'task') {
    return { type: 'task', title, description, date, time, priority, category, estimatedMinutes, confidence };
  }
  return { type: 'event', title, description, date, time, endTime, eventType, location, confidence };
}

function buildSystemPrompt(localDate: string, localTime: string): string {
  return `You organize messy personal planning notes for Timo, a task and calendar app.

"Today" means exactly ${localDate}. The current local time is ${localTime}, in the user's own timezone. Interpret relative phrases ("tomorrow", "tonight", "next Monday", "after work") against this date/time.

Rules:
- Extract only actionable Tasks and Events/Meetings actually present in the text. Do not invent items that weren't mentioned.
- Phrases like "I have to X", "I need to X", "I should X", "I have to do X" each introduce an actionable to-do — treat each one as its own separate task, even when several appear together in one sentence.
- When a sentence lists multiple actionable things separated by commas or "and" (e.g. "clean my room, do my laser session and do my hair"), split it into one suggestion PER item. Do not merge separate items into a single combined title.
- Do not invent exact dates or times that are not clearly implied. If timing is vague (e.g. "after work", "sometime this week"), leave date/time unset rather than guessing a specific value.
- If the text says "today" (or gives no day at all for an otherwise clear to-do), use ${localDate} as the date.
- Preserve the user's own wording for titles where reasonable, tidied into a short actionable phrase (e.g. "do my laser session" -> "Do my laser session").
- A "task" is a to-do item with no fixed duration commitment. An "event" is something with a specific date, typically a specific time, such as an appointment or meeting.
- Only use these values: priority is one of low/medium/high; category is one of work/personal/health/errands/learning/other; eventType is one of event/meeting. Use null for any field you are not reasonably confident about — do not guess.
- date must be an ISO date "YYYY-MM-DD". time and endTime must be 24-hour "HH:MM". Use null if you are not confident.
- confidence is a number from 0 to 1 reflecting how clearly the item and its fields were stated.
- If the text contains no actionable to-do or event at all (e.g. it's just a feeling or observation), return an empty suggestions array — do not force an item to exist.
- Return ONLY a JSON object of the exact shape { "suggestions": [ ... ] } — no prose, no markdown code fences, no explanation before or after.`;
}

// The JSON Schema Groq enforces via Structured Outputs. Groq/OpenAI-style
// strict mode requires every property to be listed in `required`, even
// ones that are logically optional — optionality is expressed by unioning
// the type with "null" instead of omitting it from `required`. This is
// what actually fixes the "valid suggestions silently disappear" issue:
// under the older `json_object` mode the model was free to use a
// different top-level key or shape, so `parsed.suggestions` could come
// back missing/undefined even though the model's JSON was well-formed.
const SUGGESTION_JSON_SCHEMA = {
  name: 'brain_dump_suggestions',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['task', 'event'] },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            date: { type: ['string', 'null'] },
            time: { type: ['string', 'null'] },
            endTime: { type: ['string', 'null'] },
            priority: { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] },
            category: {
              type: ['string', 'null'],
              enum: ['work', 'personal', 'health', 'errands', 'learning', 'other', null],
            },
            estimatedMinutes: { type: ['number', 'null'] },
            eventType: { type: ['string', 'null'], enum: ['event', 'meeting', null] },
            location: { type: ['string', 'null'] },
            confidence: { type: ['number', 'null'] },
          },
          required: [
            'type',
            'title',
            'description',
            'date',
            'time',
            'endTime',
            'priority',
            'category',
            'estimatedMinutes',
            'eventType',
            'location',
            'confidence',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  },
} as const;

async function callGroq(apiKey: string, text: string, localDate: string, localTime: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      max_completion_tokens: 1500,
      // Groq's own "Reasoning" documentation states reasoning_format is
      // NOT supported for the gpt-oss models specifically (it's only
      // listed as a general Chat Completions field elsewhere) — for
      // gpt-oss models, reasoning content is already emitted in its own
      // separate `reasoning` field on the response, not mixed into
      // `content`, so there's nothing to strip from what we read below.
      // reasoning_effort IS documented as supported for gpt-oss models,
      // so 'low' is used here to keep this small extraction job fast.
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: SUGGESTION_JSON_SCHEMA },
      messages: [
        { role: 'system', content: buildSystemPrompt(localDate, localTime) },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    throw new Error(`GROQ_HTTP_${status}`);
  }

  const data = await response.json();
  const rawText: string | undefined = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('GROQ_EMPTY_RESPONSE');
  return rawText;
}

function extractJson(rawText: string): unknown {
  // The prompt asks for JSON only, but strip accidental markdown fences
  // defensively before parsing rather than failing outright.
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // The browser sends a CORS preflight OPTIONS request before the actual
  // POST when calling this function via supabase.functions.invoke() from
  // the frontend. This must be answered before any other check (including
  // the method guard below) or the browser never sends the real POST.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Defense in depth: the gateway already requires a valid JWT for this
  // function (deployed WITHOUT --no-verify-jwt), but we also resolve the
  // user here so nothing proceeds without a real, current session.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { text?: unknown; localDate?: unknown; localTime?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ error: 'No text provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return new Response(JSON.stringify({ error: 'Text is too long' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const localDate =
    typeof body.localDate === 'string' && DATE_RE.test(body.localDate)
      ? body.localDate
      : new Date().toISOString().slice(0, 10);
  const localTime =
    typeof body.localTime === 'string' && TIME_RE.test(body.localTime) ? body.localTime : '09:00';

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Brain Dump is not configured for this deployment yet.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Minimal logging only — never log the full note content.
  // eslint-disable-next-line no-console
  console.log('[brain-dump] request', { userId: userData.user.id, textLength: text.length });

  let rawText: string;
  try {
    rawText = await callGroq(apiKey, text, localDate, localTime);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[brain-dump] provider error', err instanceof Error ? err.message : err);
    const isRateLimited = err instanceof Error && err.message === 'GROQ_HTTP_429';
    return new Response(
      JSON.stringify({
        error: isRateLimited
          ? "Timo is getting a lot of requests right now. Try again in a moment."
          : "Timo couldn't organize that right now. Try again.",
      }),
      {
        status: isRateLimited ? 429 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = extractJson(rawText);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[brain-dump] malformed model output', err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Timo couldn't organize that right now. Try again." }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const rawSuggestions =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { suggestions?: unknown }).suggestions)
      ? ((parsed as { suggestions: RawSuggestion[] }).suggestions)
      : [];

  const suggestions = rawSuggestions
    .map(normalizeSuggestion)
    .filter((s): s is NormalizedSuggestion => s !== null)
    .slice(0, 20);

  // Temporary diagnostic logging (server-side only, via `supabase functions
  // logs`) to catch cases where the model's JSON parses fine but the
  // suggestions array still ends up empty/short. Never logs the user's
  // Brain Dump text, the raw model output, or any secret.
  // eslint-disable-next-line no-console
  console.log('[brain-dump] result', {
    topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : typeof parsed,
    rawCount: rawSuggestions.length,
    normalizedCount: suggestions.length,
  });

  return new Response(JSON.stringify({ suggestions }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
