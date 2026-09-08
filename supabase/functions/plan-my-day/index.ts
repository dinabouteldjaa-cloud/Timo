// Timo — plan-my-day Edge Function
// ============================================================================
// Proposes a SUGGESTED schedule for the user's remaining incomplete tasks
// today, fit around their fixed calendar events. This function never
// writes to the database and never even sees full task/event objects
// beyond what's needed to schedule — the client sends only structured
// fields (see PlanRequest below), not a natural-language dump. Accepting
// the proposal happens back on the client through the existing
// setTaskSchedule action (AppStateContext), so RLS applies exactly as it
// does everywhere else. This function is separate from brain-dump on
// purpose — different input shape, different validation rules, different
// job — and follows the same proven patterns: authenticated invocation,
// CORS handling, GROQ_API_KEY server-side only, strict structured output,
// and server-side validation that treats the model's output as untrusted.
//
// DEPLOYMENT — deploy this WITH the default JWT verification (do NOT use
// --no-verify-jwt), same as brain-dump: this is called by a signed-in
// user via `supabase.functions.invoke()`.
//
//     npx supabase functions deploy plan-my-day
//
// Reuses the SAME secret as brain-dump — no new secret is required:
//     GROQ_API_KEY (already set for brain-dump)
//
// AI provider/model: Groq, openai/gpt-oss-20b — the same model already
// proven for brain-dump. No concrete reason to use a different one for
// this equally small, structured-extraction-shaped job.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASKS = 20;
const MAX_EVENTS = 20;
const MAX_SCHEDULED_BLOCKS = 20;
// Minimum breathing room required between two scheduled TASKS, and
// between a task and an immovable fixed event — enforced server-side
// (never left to the AI alone to honor), see the validation loop below.
const MIN_GAP_MINUTES = 5;

interface InputTask {
  id: string;
  title: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  estimatedMinutes?: number;
  dueTime?: string;
}

interface InputEvent {
  title: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
}

interface PlannedBlock {
  taskId: string;
  startTime: string;
  endTime: string;
  estimatedDuration: boolean;
}

interface UnscheduledTask {
  taskId: string;
  reason: string | null;
}

function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * True if window B does not maintain at least MIN_GAP_MINUTES of
 * separation from window A. This subsumes plain overlap (an overlap is
 * just a "gap" of zero or negative), so the SAME check is used for both
 * task-vs-task and task-vs-fixed-event validation below — one rule,
 * applied consistently, rather than a stricter rule for one case and a
 * looser one for the other.
 */
function tooClose(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd + MIN_GAP_MINUTES && bStart < aEnd + MIN_GAP_MINUTES;
}

const PLAN_JSON_SCHEMA = {
  name: 'plan_my_day',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      scheduled: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            estimatedDuration: { type: 'boolean' },
          },
          required: ['taskId', 'startTime', 'endTime', 'estimatedDuration'],
          additionalProperties: false,
        },
      },
      unscheduled: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            reason: { type: ['string', 'null'] },
          },
          required: ['taskId', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['scheduled', 'unscheduled'],
    additionalProperties: false,
  },
} as const;

function buildSystemPrompt(localDate: string, localTime: string, earliestStart: string): string {
  return `You are a scheduling assistant for Timo, a task and calendar app. You propose a SUGGESTED schedule only — you never modify anything directly.

Today is ${localDate}. The current local time is ${localTime}. The user needs a few minutes to review this plan before accepting it, so the EARLIEST allowed start time for anything you schedule is ${earliestStart} — never ${localTime} itself. This buffer is fixed and already accounts for review time; do not add any additional buffer before the first task on top of it.

You will receive a JSON object with "tasks" (incomplete tasks to consider) and "events" (fixed, immovable calendar commitments already on the schedule today).

Rules:
- Only reference tasks by the exact "id" values given to you. Never invent a task or an id.
- Never propose a task time that overlaps any event in "events" (for events with a startTime/endTime). Ignore all-day events for time-blocking purposes.
- Never propose two tasks with overlapping times.
- Every scheduled task must have AT LEAST a 5-minute gap from every other scheduled task, and AT LEAST a 5-minute gap from every fixed event with a startTime/endTime — this is a hard minimum, not a suggestion, and applies on BOTH sides of an event (a task ending right before an event, and a task starting right after one, each still need their own 5-minute buffer from it). For example, with an event from 18:00-19:00: a task must end by 17:55 at the latest, and any task after it must start at 19:05 at the earliest.
- Account for these 5-minute gaps when deciding how many tasks realistically fit today — they take up real time between blocks, not just the tasks' own durations.
- Never propose a start time before ${earliestStart} today — this is a hard floor, not a suggestion.
- Use each task's estimatedMinutes for its duration when provided. If missing, propose a reasonable duration yourself (commonly 15-60 minutes depending on the task) and set estimatedDuration: true for that item; set it false when you used the task's own estimatedMinutes.
- Respect priority as a general guide, but use good judgment about order - timing/context can reasonably outweigh priority.
- Do not overpack the day. If not everything realistically fits before a reasonable end to the day, put the remaining task ids in "unscheduled" with a brief reason instead of inventing impossible times.
- Every task id you were given must appear in either "scheduled" or "unscheduled" - never drop one silently.
- startTime and endTime must be 24-hour "HH:MM", with endTime after startTime.
- Return ONLY the JSON object matching the required shape - no prose, no markdown fences.`;
}

async function callGroq(apiKey: string, payload: unknown, localDate: string, localTime: string, earliestStart: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      max_completion_tokens: 2000,
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: PLAN_JSON_SCHEMA },
      messages: [
        { role: 'system', content: buildSystemPrompt(localDate, localTime, earliestStart) },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`GROQ_HTTP_${response.status}`);
  }

  const data = await response.json();
  const rawText: string | undefined = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('GROQ_EMPTY_RESPONSE');
  return rawText;
}

function extractJson(rawText: string): unknown {
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  let body: { localDate?: unknown; localTime?: unknown; earliestStart?: unknown; tasks?: unknown; events?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const localDate =
    typeof body.localDate === 'string' && DATE_RE.test(body.localDate)
      ? body.localDate
      : new Date().toISOString().slice(0, 10);
  const localTime =
    typeof body.localTime === 'string' && TIME_RE.test(body.localTime) ? body.localTime : '09:00';

  // Server's OWN deterministic floor, computed independently from
  // localTime using the exact same formula the client uses (see
  // planMyDayApi.computeEarliestStart). This is the authoritative
  // minimum — a client-supplied earliestStart is only ever allowed to
  // push the floor LATER (stricter), never earlier. A malformed or
  // malicious client value earlier than this is simply not trusted.
  const serverFloorMinutes = Math.ceil((toMinutes(localTime) + 10) / 5) * 5;
  const clientEarliestStartMinutes =
    typeof body.earliestStart === 'string' && TIME_RE.test(body.earliestStart)
      ? toMinutes(body.earliestStart)
      : serverFloorMinutes;
  const earliestStartMinutes = Math.max(serverFloorMinutes, clientEarliestStartMinutes);

  const inputTasks: InputTask[] = Array.isArray(body.tasks)
    ? (body.tasks as InputTask[])
        .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
        .slice(0, MAX_TASKS)
    : [];

  const inputEvents: InputEvent[] = Array.isArray(body.events)
    ? (body.events as InputEvent[])
        .filter((e) => e && typeof e.title === 'string')
        .slice(0, MAX_EVENTS)
    : [];

  if (inputTasks.length === 0) {
    return jsonResponse({ scheduled: [], unscheduled: [] });
  }

  // No valid same-day scheduling window remains (mirrors
  // planMyDayApi.computeEarliestStart's client-side check — Plan My Day
  // only ever schedules within the CURRENT localDate, so a floor at or
  // past 24:00 has no valid same-day meaning). This is deterministic, so
  // return it directly rather than spending an AI call on a request that
  // could only ever come back empty.
  if (earliestStartMinutes >= 24 * 60) {
    return jsonResponse({
      scheduled: [],
      unscheduled: inputTasks.map((t) => ({ taskId: t.id, reason: 'Not enough time left today.' })),
    });
  }

  const earliestStart = minutesToTime(earliestStartMinutes);

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'Plan My Day is not configured for this deployment yet.' }, 500);
  }

  // Minimal logging only — never log task/event titles or content.
  // eslint-disable-next-line no-console
  console.log('[plan-my-day] request', {
    userId: userData.user.id,
    taskCount: inputTasks.length,
    eventCount: inputEvents.length,
  });

  let rawText: string;
  try {
    rawText = await callGroq(
      apiKey,
      {
        tasks: inputTasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          estimatedMinutes: t.estimatedMinutes,
          dueTime: t.dueTime,
        })),
        events: inputEvents.map((e) => ({
          title: e.title,
          startTime: e.startTime,
          endTime: e.endTime,
          allDay: e.allDay,
        })),
      },
      localDate,
      localTime,
      earliestStart,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[plan-my-day] provider error', err instanceof Error ? err.message : err);
    const isRateLimited = err instanceof Error && err.message === 'GROQ_HTTP_429';
    return jsonResponse(
      {
        error: isRateLimited
          ? 'Timo is getting a lot of requests right now. Try again in a moment.'
          : "Timo couldn't plan your day right now. Try again.",
      },
      isRateLimited ? 429 : 502,
    );
  }

  let parsed: unknown;
  try {
    parsed = extractJson(rawText);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[plan-my-day] malformed model output', err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Timo couldn't plan your day right now. Try again." }, 502);
  }

  // --- Treat the model's output as fully untrusted from here on ---------
  const validTaskIds = new Set(inputTasks.map((t) => t.id));

  const fixedEventWindows = inputEvents
    .filter((e) => !e.allDay && isValidTime(e.startTime) && isValidTime(e.endTime))
    .map((e) => ({ start: toMinutes(e.startTime as string), end: toMinutes(e.endTime as string) }));

  const rawScheduled = Array.isArray((parsed as { scheduled?: unknown })?.scheduled)
    ? ((parsed as { scheduled: unknown[] }).scheduled as Record<string, unknown>[])
    : [];
  const rawUnscheduled = Array.isArray((parsed as { unscheduled?: unknown })?.unscheduled)
    ? ((parsed as { unscheduled: unknown[] }).unscheduled as Record<string, unknown>[])
    : [];

  const seenIds = new Set<string>();
  const acceptedBlocks: { taskId: string; start: number; end: number; estimatedDuration: boolean }[] = [];
  const unscheduled: UnscheduledTask[] = [];

  function rejectToUnscheduled(taskId: string, reason: string) {
    if (seenIds.has(taskId)) return;
    seenIds.add(taskId);
    unscheduled.push({ taskId, reason });
  }

  for (const item of rawScheduled) {
    const taskId = typeof item.taskId === 'string' ? item.taskId : null;
    if (!taskId || seenIds.has(taskId) || !validTaskIds.has(taskId)) continue; // unknown/duplicate id — drop silently, never trusted

    const startTime = item.startTime;
    const endTime = item.endTime;
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      rejectToUnscheduled(taskId, 'Not enough time left today.');
      continue;
    }

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    if (end <= start) {
      rejectToUnscheduled(taskId, 'Not enough time left today.');
      continue;
    }
    if (start < earliestStartMinutes) {
      rejectToUnscheduled(taskId, 'Not enough time left today.');
      continue;
    }
    if (fixedEventWindows.some((w) => tooClose(start, end, w.start, w.end))) {
      rejectToUnscheduled(taskId, 'Needs at least 5 minutes of buffer around an event on your calendar.');
      continue;
    }
    if (acceptedBlocks.some((b) => tooClose(start, end, b.start, b.end))) {
      rejectToUnscheduled(taskId, 'Needs at least a 5-minute gap from another scheduled task.');
      continue;
    }
    if (acceptedBlocks.length >= MAX_SCHEDULED_BLOCKS) {
      rejectToUnscheduled(taskId, 'Too many items to schedule at once.');
      continue;
    }

    seenIds.add(taskId);
    acceptedBlocks.push({
      taskId,
      start,
      end,
      estimatedDuration: item.estimatedDuration === true,
    });
  }

  for (const item of rawUnscheduled) {
    const taskId = typeof item.taskId === 'string' ? item.taskId : null;
    if (!taskId || seenIds.has(taskId) || !validTaskIds.has(taskId)) continue;
    seenIds.add(taskId);
    unscheduled.push({
      taskId,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : null,
    });
  }

  // Anything the model forgot entirely still needs to show up somewhere —
  // never let a requested task silently vanish from the response.
  for (const task of inputTasks) {
    if (!seenIds.has(task.id)) {
      seenIds.add(task.id);
      unscheduled.push({ taskId: task.id, reason: null });
    }
  }

  acceptedBlocks.sort((a, b) => a.start - b.start);

  const scheduled: PlannedBlock[] = acceptedBlocks.map((b) => ({
    taskId: b.taskId,
    startTime: minutesToTime(b.start),
    endTime: minutesToTime(b.end),
    estimatedDuration: b.estimatedDuration,
  }));

  // eslint-disable-next-line no-console
  console.log('[plan-my-day] result', {
    scheduledCount: scheduled.length,
    unscheduledCount: unscheduled.length,
  });

  return jsonResponse({ scheduled, unscheduled });
});
