import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import TimoMascot from '../../components/ui/TimoMascot';
import { useAppState, type NewTaskInput } from '../../state/AppStateContext';
import { planMyDay } from '../../lib/planMyDayApi';
import { toISODate } from '../../lib/utils';
import { isDateAnOccurrence, expandEventOccurrences } from '../../lib/occurrences';
import { computeRemindAt } from '../../lib/reminderPresets';
import type { PlannedTaskBlock, UnscheduledTask } from '../../types/planMyDay';
import './PlanMyDayPage.css';

type Step = 'loading' | 'empty' | 'review' | 'saving' | 'done' | 'error';

const TODAY_ISO = toISODate(new Date());
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface EditableBlock extends PlannedTaskBlock {
  removed: boolean;
}

export default function PlanMyDayPage() {
  const navigate = useNavigate();
  const {
    tasks,
    events,
    tasksLoading,
    eventsLoading,
    setTaskSchedule,
    saveTaskOccurrenceOverride,
    taskOccurrenceCompletions,
    taskOccurrenceSkips,
    eventOccurrenceSkips,
    reminders,
  } = useAppState();

  const [step, setStep] = useState<Step>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [unscheduled, setUnscheduled] = useState<UnscheduledTask[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const hasStartedRef = useRef(false);

  // Same eligibility as Today's "Today's Tasks" section: any incomplete
  // task, with NO due-date restriction — Today itself doesn't filter by
  // due date (see TodayPage.tsx's `todaysTasks`), so a task with no due
  // date, or one due on a different day, is still shown there and must
  // stay eligible for planning here too. (Today additionally caps its
  // list to 4 items for display — that's a compact-card display limit,
  // not part of the "is this eligible today" definition, so it's not
  // applied here.)
  //
  // Tasks already scheduled for today are still included here on purpose:
  // Plan My Day may propose a new placement for them, but nothing changes
  // until Accept — accepting simply overwrites today's old block for that
  // task with the newly accepted one (setTaskSchedule is a plain update).
  //
  // Recurring series parents are a special case (added alongside
  // recurring tasks/events — see 0011_recurring_tasks_events.sql): a
  // series parent's own `status` never reflects per-occurrence
  // completion (that lives in a separate table), so without this check a
  // "Gym every Monday" task would appear as a planning candidate every
  // single day, not just Mondays. A series parent is only included when
  // today is genuinely one of its occurrences, and not already
  // completed/removed for today specifically. Occurrence OVERRIDE rows
  // (recurrenceParentId set) must only be eligible on their OWN actual
  // occurrence date (fix, review item 10) — without this check, an
  // override created for, say, next Monday would incorrectly appear in
  // TODAY's candidate list too, since an override's own `status` never
  // implies which date it belongs to on its own.
  const todaysTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.status === 'completed') return false;
        if (task.archivedAt) return false;
        if (task.recurrenceParentId) return task.recurrenceOccurrenceDate === TODAY_ISO;
        if (task.recurrenceType !== 'none') {
          if (!isDateAnOccurrence(task, TODAY_ISO)) return false;
          const key = `${task.id}::${TODAY_ISO}`;
          if (taskOccurrenceCompletions.has(key) || taskOccurrenceSkips.has(key)) return false;
        }
        return true;
      }),
    [tasks, taskOccurrenceCompletions, taskOccurrenceSkips],
  );
  // Fix (review): recurring events must block their occupied time on
  // every occurrence, not just on their original series start date.
  // expandEventOccurrences already resolves skips (excluded entirely)
  // and overrides (its own edited time wins over the series' default)
  // for today specifically — Plan My Day only ever reads startTime/
  // endTime/allDay (see planMyDayApi.ts), which are correct time-of-day
  // values regardless of which occurrence date produced them, so no
  // further date-correction is needed here.
  const todaysEvents = useMemo(
    () => expandEventOccurrences(events, TODAY_ISO, TODAY_ISO, eventOccurrenceSkips).map((occ) => occ.event),
    [events, eventOccurrenceSkips],
  );

  function handleBack() {
    navigate('/');
  }

  async function runPlan() {
    setStep('loading');
    setErrorMessage(null);

    if (todaysTasks.length === 0 && todaysEvents.length === 0) {
      setStep('empty');
      return;
    }

    try {
      const result = await planMyDay(todaysTasks, todaysEvents);
      setBlocks(result.scheduled.map((b) => ({ ...b, removed: false })));
      setUnscheduled(result.unscheduled);
      setStep('review');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Timo couldn't plan your day right now. Try again.",
      );
      setStep('error');
    }
  }

  useEffect(() => {
    // Wait for AppStateContext to finish loading both tasks and events
    // before deciding whether there's anything to plan — otherwise a
    // page landed on before that fetch resolves could see the initial
    // empty arrays and permanently show "Nothing to plan yet" even
    // though data arrives moments later. Only auto-run once; after that,
    // "Try again" is the explicit re-run action.
    if (tasksLoading || eventsLoading) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    runPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksLoading, eventsLoading]);

  function taskFor(taskId: string) {
    return tasks.find((t) => t.id === taskId);
  }

  function findExistingOverride(seriesId: string, date: string) {
    return tasks.find((t) => t.recurrenceParentId === seriesId && t.recurrenceOccurrenceDate === date);
  }

  /**
   * Fix (review): accepting a plan must never write scheduled_date/
   * scheduled_start_time/scheduled_end_time directly onto a still-
   * recurring series parent — that would affect the series' identity
   * for every future occurrence, not just today's. For a recurring
   * series parent, this resolves (creating if needed) TODAY's occurrence
   * override and returns ITS id instead, so the schedule is applied to
   * an entirely ordinary, non-recurring row. Non-recurring tasks and
   * already-existing overrides are returned unchanged — exactly the
   * same direct-schedule behavior as before this fix.
   */
  async function resolveScheduleTargetId(taskId: string): Promise<string> {
    const task = taskFor(taskId);
    if (!task || task.recurrenceParentId || task.recurrenceType === 'none') {
      return taskId;
    }

    const existingOverride = findExistingOverride(taskId, TODAY_ISO);
    // An existing override already has whatever reminder the user set
    // (or explicitly cleared) while editing "this occurrence" — never
    // touch it here.
    if (existingOverride) return existingOverride.id;

    // No override exists yet for today. push-reminders suppresses the
    // series' own reminder for any occurrence that has an override (to
    // avoid a duplicate notification once the override has its own
    // reminder) — so creating one here with no reminder at all would
    // silently delete today's notification for a series that DOES have
    // one. Preserve it: reuse the series' existing reminder's offset and
    // recompute remindAt for TODAY's actual occurrence date/time, using
    // the same client-side computation (computeRemindAt) already used
    // everywhere else a reminder is derived from a task's own date/time.
    // Only a relative (offset-based) reminder can be carried forward
    // this way — an absolute/custom reminder was for one specific past
    // moment and has no "same offset" to reapply, so it's intentionally
    // not copied. If the series has no reminder, or has no due_time to
    // compute against, this correctly stays null — no new reminder is
    // invented in either case.
    const seriesReminder = reminders.find((r) => r.taskId === taskId);
    const reminder =
      seriesReminder?.offsetMinutes !== undefined && task.dueTime
        ? { remindAt: computeRemindAt(TODAY_ISO, task.dueTime, seriesReminder.offsetMinutes), offsetMinutes: seriesReminder.offsetMinutes }
        : null;

    const created = await saveTaskOccurrenceOverride(taskId, TODAY_ISO, {
      title: task.title,
      description: task.description,
      dueDate: TODAY_ISO,
      dueTime: task.dueTime,
      priority: task.priority,
      category: task.category,
      estimatedMinutes: task.estimatedMinutes,
      reminder,
    } satisfies NewTaskInput);
    return created.id;
  }

  function updateBlockTime(taskId: string, field: 'startTime' | 'endTime', value: string) {
    setBlocks((prev) => prev.map((b) => (b.taskId === taskId ? { ...b, [field]: value } : b)));
  }

  function removeBlock(taskId: string) {
    setBlocks((prev) => prev.map((b) => (b.taskId === taskId ? { ...b, removed: true } : b)));
  }

  const activeBlocks = blocks.filter((b) => !b.removed);

  // Merge active proposed task blocks with fixed events for a single
  // chronological timeline. Fixed events are never editable from here.
  const timeline = useMemo(() => {
    type Item =
      | { kind: 'task'; sortKey: string; block: EditableBlock }
      | { kind: 'event'; sortKey: string; eventId: string };

    const items: Item[] = [
      ...activeBlocks.map((block) => ({ kind: 'task' as const, sortKey: block.startTime, block })),
      ...todaysEvents.map((event) => ({
        kind: 'event' as const,
        sortKey: event.allDay ? '00:00' : event.startTime ?? '00:00',
        eventId: event.id,
      })),
    ];
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [activeBlocks, todaysEvents]);

  async function handleAccept() {
    if (activeBlocks.length === 0) return;

    // The AI's output was already validated server-side, but the user can
    // freely edit start/end times afterward — those edits are untrusted
    // too and must be re-checked before anything is saved.
    const nowMinutes = toMinutes(
      `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    );
    const fixedWindows = todaysEvents
      .filter((e) => !e.allDay && e.startTime && e.endTime)
      .map((e) => ({ start: toMinutes(e.startTime as string), end: toMinutes(e.endTime as string) }));

    const seen: { start: number; end: number }[] = [];
    for (const block of activeBlocks) {
      const title = taskFor(block.taskId)?.title ?? 'This task';

      if (!TIME_RE.test(block.startTime) || !TIME_RE.test(block.endTime)) {
        setErrorMessage(`"${title}" has an invalid time. Fix it before accepting.`);
        return;
      }
      const start = toMinutes(block.startTime);
      const end = toMinutes(block.endTime);

      if (end <= start) {
        setErrorMessage(`"${title}"'s end time must be after its start time.`);
        return;
      }
      if (start < nowMinutes) {
        setErrorMessage(`"${title}" is scheduled in the past. Update it before accepting.`);
        return;
      }
      if (fixedWindows.some((w) => overlaps(start, end, w.start, w.end))) {
        setErrorMessage(`"${title}" overlaps a fixed event on your calendar.`);
        return;
      }
      if (seen.some((s) => overlaps(start, end, s.start, s.end))) {
        setErrorMessage(`"${title}" overlaps another task in this plan.`);
        return;
      }
      seen.push({ start, end });
    }

    setStep('saving');
    setErrorMessage(null);

    let succeeded = 0;
    const failedTaskIds: string[] = [];

    for (const block of activeBlocks) {
      try {
        const targetId = await resolveScheduleTargetId(block.taskId);
        await setTaskSchedule(targetId, {
          date: TODAY_ISO,
          startTime: block.startTime,
          endTime: block.endTime,
        });
        succeeded++;
      } catch {
        failedTaskIds.push(block.taskId);
      }
    }

    if (failedTaskIds.length === 0) {
      setResultMessage(`${succeeded} task${succeeded === 1 ? '' : 's'} scheduled for today`);
      setStep('done');
    } else if (succeeded > 0) {
      setBlocks((prev) => prev.filter((b) => failedTaskIds.includes(b.taskId)));
      setErrorMessage(
        `${succeeded} scheduled, ${failedTaskIds.length} couldn't be saved. Review and try again below.`,
      );
      setStep('review');
    } else {
      setErrorMessage("Couldn't schedule those tasks. Try again.");
      setStep('review');
    }
  }

  return (
    <>
      <Header title="Plan My Day" onBack={handleBack} />

      <div className="plan-my-day-page">
        {step === 'loading' && (
          <div className="plan-my-day-loading">
            <div className="plan-my-day-loading__mascot">
              <TimoMascot variant="thinking" className="timo-mascot--floating" />
            </div>
            <p>Timo is planning your day…</p>
          </div>
        )}

        {step === 'empty' && (
          <Card padding="lg">
            <EmptyState
              title="Nothing to plan yet"
              subtitle="Add a task or event for today and Timo can help you schedule it."
            />
          </Card>
        )}

        {step === 'error' && (
          <>
            <Card padding="lg">
              <EmptyState title="Couldn't plan your day" subtitle={errorMessage ?? undefined} />
            </Card>
            <Button fullWidth size="lg" onClick={runPlan}>
              Try again
            </Button>
          </>
        )}

        {step === 'review' && (
          <>
            <p className="plan-my-day-intro">
              This is only a suggestion — nothing is saved until you accept it.
            </p>

            {errorMessage && <p className="plan-my-day-error">{errorMessage}</p>}

            <div className="plan-my-day-timeline">
              <p className="plan-my-day-section-label">Your plan</p>
              <Card padding="none">
                {timeline.length === 0 ? (
                  <EmptyState title="Nothing scheduled" subtitle="Everything landed in Unscheduled below." />
                ) : (
                  timeline.map((item) => {
                    if (item.kind === 'event') {
                      const event = todaysEvents.find((e) => e.id === item.eventId);
                      if (!event) return null;
                      return (
                        <div key={`event-${event.id}`} className="plan-block plan-block--fixed">
                          <div className="plan-block__time">
                            {event.allDay ? 'All day' : event.startTime ?? ''}
                          </div>
                          <div className="plan-block__body">
                            <p className="plan-block__title">{event.title}</p>
                            <Badge tone="neutral">Fixed event</Badge>
                          </div>
                        </div>
                      );
                    }

                    const task = taskFor(item.block.taskId);
                    if (!task) return null;
                    return (
                      <div key={`task-${item.block.taskId}`} className="plan-block">
                        <div className="plan-block__times">
                          <input
                            type="time"
                            className="plan-block__time-input"
                            value={item.block.startTime}
                            onChange={(e) => updateBlockTime(item.block.taskId, 'startTime', e.target.value)}
                          />
                          <span className="plan-block__time-sep">–</span>
                          <input
                            type="time"
                            className="plan-block__time-input"
                            value={item.block.endTime}
                            onChange={(e) => updateBlockTime(item.block.taskId, 'endTime', e.target.value)}
                          />
                        </div>
                        <div className="plan-block__body">
                          <p className="plan-block__title">{task.title}</p>
                          <div className="plan-block__meta">
                            <Badge tone="neutral">{task.category}</Badge>
                            <Badge tone={task.priority}>{task.priority}</Badge>
                            {item.block.estimatedDuration && (
                              <Badge tone="medium">Estimated duration</Badge>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="plan-block__remove"
                          onClick={() => removeBlock(item.block.taskId)}
                          aria-label="Remove from plan"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </Card>
            </div>

            {unscheduled.length > 0 && (
              <div className="plan-my-day-timeline">
                <p className="plan-my-day-section-label">Unscheduled</p>
                <Card padding="none">
                  {unscheduled.map((item) => {
                    const task = taskFor(item.taskId);
                    if (!task) return null;
                    return (
                      <div key={item.taskId} className="plan-block plan-block--unscheduled">
                        <div className="plan-block__body">
                          <p className="plan-block__title">{task.title}</p>
                          {item.reason && <p className="plan-block__reason">{item.reason}</p>}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            )}

            <div className="plan-my-day-actions">
              <Button variant="ghost" fullWidth onClick={handleBack}>
                Cancel
              </Button>
              <Button fullWidth onClick={handleAccept} disabled={activeBlocks.length === 0}>
                Accept plan
              </Button>
            </div>
          </>
        )}

        {step === 'saving' && (
          <div className="plan-my-day-loading">
            <div className="plan-my-day-loading__mascot">
              <TimoMascot variant="resting" />
            </div>
            <p>Saving your plan…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="plan-my-day-done">
            <div className="plan-my-day-loading__mascot">
              <TimoMascot variant="celebrating" />
            </div>
            <p className="plan-my-day-done__message">{resultMessage}</p>
            <Button fullWidth size="lg" onClick={handleBack}>
              Back to Today
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
