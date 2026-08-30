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
  reminder?: unknown;
}

interface RawReminder {
  kind?: unknown;
  offsetMinutes?: unknown;
  date?: unknown;
  time?: unknown;
}

/**
 * A detected reminder INTENT only — not yet a real reminder record. The
 * client (brainDumpApi.ts) converts this into the exact same
 * ReminderPickerValue shape the existing Add Task/Event reminder picker
 * already uses, so Review can embed that real component unchanged.
 */
interface NormalizedReminder {
  kind: 'relative' | 'absolute';
  offsetMinutes?: number; // for 'relative' — snapped to a supported preset
  date?: string; // for 'absolute'
  time?: string; // for 'absolute'
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
  reminder?: NormalizedReminder;
}

const MAX_INPUT_LENGTH = 4000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Parses/formats/adds days on a "YYYY-MM-DD" string using only local date
 * *components* (never toISOString/getUTC*), so this is timezone-neutral —
 * it's pure calendar arithmetic on the digits the client already resolved
 * to its own local date, not a UTC conversion. No timezone (e.g. UTC+3) is
 * ever assumed here.
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Deterministically resolves the date for each weekday over the coming
 * week, so the model never has to compute "next Monday" itself — it's
 * told the exact answer. This is what fixes the observed weekday/date
 * mix-ups: the model was previously asked to do calendar arithmetic from
 * only a single reference date, which it did unreliably.
 */
function computeWeekdayTable(localDate: string): { todayWeekday: string; upcoming: { weekday: string; date: string }[] } {
  const base = parseLocalDate(localDate);
  const todayWeekday = WEEKDAY_NAMES[base.getDay()];
  const upcoming: { weekday: string; date: string }[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + offset);
    upcoming.push({ weekday: WEEKDAY_NAMES[d.getDay()], date: formatLocalDate(d) });
  }
  return { todayWeekday, upcoming };
}

// Only these exact offsets are supported by the existing reminder preset
// system (see src/lib/reminderPresets.ts) — an arbitrary stated lead time
// is snapped to the nearest one rather than inventing an unsupported value.
const SUPPORTED_OFFSET_MINUTES = [0, 5, 15, 30, 60, 1440];

function snapToSupportedOffset(minutes: number): number {
  return SUPPORTED_OFFSET_MINUTES.reduce((best, candidate) =>
    Math.abs(candidate - minutes) < Math.abs(best - minutes) ? candidate : best,
  );
}

/** Validates a raw reminder intent from the model, or returns undefined if unusable/absent. */
function normalizeReminder(raw: unknown): NormalizedReminder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as RawReminder;

  if (r.kind === 'relative') {
    if (typeof r.offsetMinutes !== 'number' || !Number.isFinite(r.offsetMinutes) || r.offsetMinutes < 0) {
      return undefined;
    }
    return { kind: 'relative', offsetMinutes: snapToSupportedOffset(r.offsetMinutes) };
  }

  if (r.kind === 'absolute') {
    const date = typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : undefined;
    const time = typeof r.time === 'string' && TIME_RE.test(r.time) ? r.time : undefined;
    if (!date || !time) return undefined; // can't safely resolve without both
    return { kind: 'absolute', date, time };
  }

  return undefined;
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

  const reminder = normalizeReminder(raw.reminder);

  if (raw.type === 'task') {
    return { type: 'task', title, description, date, time, priority, category, estimatedMinutes, confidence, reminder };
  }
  return { type: 'event', title, description, date, time, endTime, eventType, location, confidence, reminder };
}

function buildSystemPrompt(localDate: string, localTime: string): string {
  const { todayWeekday, upcoming } = computeWeekdayTable(localDate);
  // One weekday per line, not a dense comma-joined single line. The
  // deterministic table itself was always correct (verified
  // independently) — the observed bug was the model misreading a long
  // single-line "Monday = X, Tuesday = Y, ..." list and picking the wrong
  // entry (it returned the LAST entry — Sunday's date — for "Monday").
  // A short, unambiguous list of separate lines is far more reliable for
  // a small/fast model to read correctly than one dense line.
  const upcomingLines = upcoming.map((u) => `  - ${u.weekday}: ${u.date}`).join('\n');

  return `You organize messy personal planning notes for Timo, a task and calendar app.

"Today" means exactly ${localDate}, which is a ${todayWeekday}. The current local time is ${localTime}, in the user's own timezone.

Do NOT calculate weekday dates yourself. This table is already computed correctly for you — read it carefully, one line per weekday:
${upcomingLines}

When the text names a weekday, find that EXACT weekday name in the table above and use ONLY the date on that same line. Before you finalize each date, re-read the table line for that weekday name to confirm the date you're about to use actually appears next to it — do not use a date from a different line.
For example, if the text says "Monday", find the line starting with "Monday" above and use only the date on that line — never a different line, and never a date you compute yourself.

DATES:
- "today" -> ${localDate}. "tomorrow" -> the date immediately after ${localDate}.
- A named weekday (e.g. "Friday", "next Monday") -> use the table above, exactly, per the matching rule above.
- A clearly actionable task with NO day mentioned at all and nothing suggesting it's for later -> use ${localDate} (today). Do this by default for ordinary undated to-dos.
- Only leave date unset when the text is explicitly vague about timing (e.g. "sometime this week", "eventually", "one of these days", "whenever this week") — vagueness is about explicit hedging language, not simply the absence of a day.

DATE SCOPE ACROSS COORDINATED ACTIONS — this takes priority over the "no day mentioned -> today" default above:
- When a clause states an explicit date/day (e.g. "Tomorrow ...", "On Monday ..."), that date applies to every coordinated actionable item introduced in that same breath — items joined by "and", "then", or commas — until a NEW explicit date/day appears later in the text. An item covered this way DOES have a day (inherited), so it is not "no day mentioned".
- Do NOT inherit time, duration, priority, or location across coordinated items this way — each of those only applies to the specific item it was actually stated for.
- Examples:
  "Tomorrow buy toothpaste and get a haircut" -> both items tomorrow.
  "On Monday read for 30 minutes and study French for 2 hours" -> both Monday; each keeps its own separate duration, not the other's.
  "Tomorrow call the bank at 10 AM and send the report" -> both items tomorrow; ONLY "call the bank" gets 10 AM.
  "Tomorrow call Sarah and send invoice. Friday meet Ahmed." -> the first two are tomorrow; "meet Ahmed" is Friday because that new explicit date resets the inherited scope.

REMINDER INTENT — only when the text explicitly asks to be reminded or not forget something. A stated date/time on its own is NEVER enough to add a reminder:
- Trigger phrases include "remind me...", "don't let me forget...", "make sure I remember...", or clearly equivalent explicit requests. Ordinary timed tasks/events with no such wording get reminder: null.
- If the text states an explicit lead time ("30 minutes before", "an hour before"), use { kind: "relative", offsetMinutes: <that many minutes>, date: null, time: null }.
- If reminder wording asks to be reminded at/for the item's own time with no extra lead time (e.g. "remind me to call Ahmed at 7 PM"), use { kind: "relative", offsetMinutes: 0, date: null, time: null }.
- If the item has no specific time of its own (e.g. a task merely due "tomorrow") but the reminder wording gives a rough time reference, use { kind: "absolute", offsetMinutes: null, date: <resolved date>, time: <a concrete "HH:MM"> } — pick a reasonable concrete time for vague parts of day (morning -> "09:00", afternoon -> "14:00", evening/tonight -> "18:00") unless a specific time is stated.
- If reminder intent is unclear, or nothing usable can be resolved, set reminder to null rather than guessing.

TASK vs EVENT — a stated time does NOT by itself make something an Event. Judge by what KIND of thing it is:
- Usually a TASK even with a specific time attached: calling/texting someone, sending an email or message, buying or picking up something (including groceries), errands, chores, workouts, studying, submitting something, paying a bill. Example: "Call my dad at 4 PM" is a Task with time=16:00, not an Event.
- Usually an EVENT: an appointment, a meeting, a reservation/booking, a class, a flight, a scheduled visit, or a lunch/dinner/meetup with someone framed as a fixed engagement (e.g. "lunch with Ahmed at 1:30 on Monday").
- When genuinely ambiguous, prefer Task — Event should be reserved for things with a real fixed external commitment.

DURATION (estimatedMinutes, tasks only):
- If the text explicitly states or strongly implies a duration ("for 30 minutes", "for 2 hours", "should take 10 mins", "about an hour", "1h30"), extract it into estimatedMinutes as a number of minutes, and remove that duration phrase from the title (e.g. "read for 30 minutes" -> title "Read", estimatedMinutes 30).
- Never invent a duration the text didn't state or clearly imply. Leave estimatedMinutes unset otherwise.

PRIORITY — only set explicitly, never invent a priority from neutral wording:
- High: "urgent", "really important", "high priority", "ASAP", "must do", or clearly equivalent emphatic wording.
- Low: "not important", "low priority", "no rush", "whenever", "not urgent", or clearly equivalent dismissive wording.
- If nothing in the text signals urgency either way, leave priority unset (null) — do not default to "medium" just because it seems balanced.

GENERAL:
- Extract only actionable Tasks and Events/Meetings actually present in the text. Do not invent items that weren't mentioned.
- Phrases like "I have to X", "I need to X", "I should X" each introduce an actionable to-do — treat each one as its own separate item, even when several appear together in one sentence, and split comma/"and"-separated lists into one suggestion per item. Do not merge separate items into one combined title.
- Preserve the user's own wording for titles where reasonable, tidied into a short actionable phrase.
- Only use these values: priority is one of low/medium/high (or null); category is one of work/personal/health/errands/learning/other (or null); eventType is one of event/meeting (or null). Use null for any field you are not reasonably confident about — do not guess. reminder is null unless explicit reminder intent is present (see REMINDER INTENT above).
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
            reminder: {
              type: ['object', 'null'],
              properties: {
                kind: { type: 'string', enum: ['relative', 'absolute'] },
                offsetMinutes: { type: ['number', 'null'] },
                date: { type: ['string', 'null'] },
                time: { type: ['string', 'null'] },
              },
              required: ['kind', 'offsetMinutes', 'date', 'time'],
              additionalProperties: false,
            },
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
            'reminder',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  },
} as const;

/** Distinguishes an HTTP error response (has a status code) from a network/fetch-level failure. */
class GroqHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`GROQ_HTTP_${status}`);
    this.status = status;
  }
}

async function requestGroqOnce(apiKey: string, text: string, localDate: string, localTime: string) {
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
    throw new GroqHttpError(response.status);
  }

  const data = await response.json();
  const rawText: string | undefined = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('GROQ_EMPTY_RESPONSE');
  return rawText;
}

/**
 * ROOT CAUSE of the intermittent 502 (investigated, not guessed): this
 * function previously made exactly one attempt with no retry at all — any
 * transient Groq-side 5xx or a fetch-level network blip went straight to
 * `throw`, which the caller turned into an immediate 502 with no second
 * attempt. That's exactly why pressing "Organize" again with the same
 * input worked: the retry was the user doing it manually.
 *
 * Fix: exactly ONE controlled server-side retry, and only for failures
 * that are actually transient:
 *   - a network/fetch-level error (GroqHttpError is NOT thrown for these
 *     — only a plain Error from fetch() itself failing, e.g. DNS/connection
 *     reset), or
 *   - an upstream 5xx from Groq, or
 *   - a response that came back ok but with no content (GROQ_EMPTY_RESPONSE).
 * A 4xx (400/401/403/404, and especially 429) is NEVER retried — those
 * are not transient, and 429 keeps its existing distinct "you're being
 * rate limited" handling untouched. Malformed model output (a JSON parse
 * failure after a successful response) is also not retried here — that's
 * a model-output-quality issue, not a transient provider/network failure.
 */
async function callGroq(apiKey: string, text: string, localDate: string, localTime: string) {
  try {
    return await requestGroqOnce(apiKey, text, localDate, localTime);
  } catch (err) {
    const isTransient =
      err instanceof GroqHttpError ? err.status >= 500 : err instanceof Error;
    if (!isTransient) throw err;

    // eslint-disable-next-line no-console
    console.warn(
      '[brain-dump] transient provider failure, retrying once',
      err instanceof Error ? err.message : err,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    return await requestGroqOnce(apiKey, text, localDate, localTime);
  }
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
