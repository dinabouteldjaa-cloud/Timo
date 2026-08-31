import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import TimoMascot from '../../components/ui/TimoMascot';
import { useAppState, type ReminderSelection } from '../../state/AppStateContext';
import { organizeBrainDump } from '../../lib/brainDumpApi';
import { isPossibleDuplicate } from '../../lib/brainDumpDuplicates';
import { computeRemindAt, minutesForPreset } from '../../lib/reminderPresets';
import { localDateTimeToISOString } from '../../lib/utils';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import type { BrainDumpSuggestion } from '../../types/brainDump';
import SuggestionCard from './SuggestionCard';
import './BrainDumpPage.css';

type Step = 'input' | 'loading' | 'review' | 'saving' | 'done';

const PLACEHOLDER =
  "Tomorrow I need to finish the presentation, call Ahmed, buy groceries after work, and I have a dentist appointment at 6.";

/**
 * Resolves a suggestion's reminder picker value into an actual
 * ReminderSelection, exactly mirroring AddTaskSheet/AddEventSheet's own
 * resolveReminder() — a relative preset is computed from the suggestion's
 * OWN (possibly user-edited) date/time, never frozen at AI-extraction
 * time; 'invalid' means the picker is set to something that can't
 * currently be resolved (e.g. a relative preset with no date/time to
 * count back from).
 */
function resolveReminderSelection(suggestion: BrainDumpSuggestion): ReminderSelection | null | 'invalid' {
  const r = suggestion.reminder;
  if (r.preset === 'none') return null;
  if (r.preset === 'custom') {
    if (!r.customDate || !r.customTime) return 'invalid';
    return { remindAt: localDateTimeToISOString(r.customDate, r.customTime) };
  }
  if (!suggestion.date || !suggestion.time) return 'invalid';
  const minutes = minutesForPreset(r.preset) ?? 0;
  return {
    remindAt: computeRemindAt(suggestion.date, suggestion.time, minutes),
    offsetMinutes: minutes,
  };
}

export default function BrainDumpPage() {
  const navigate = useNavigate();
  const { tasks, events, addTask, addEvent, attachTaskReminder, attachEventReminder } = useAppState();

  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<BrainDumpSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const includedCount = suggestions.filter((s) => s.included).length;

  const speech = useSpeechRecognition({
    onFinalTranscript: (finalText) => {
      // Never trim or otherwise rewrite what's already there — preserve
      // the user's existing text (including any formatting/line breaks)
      // exactly, and only decide whether a separating space is needed.
      setText((prev) => {
        if (!prev) return finalText;
        return /\s$/.test(prev) ? `${prev}${finalText}` : `${prev} ${finalText}`;
      });
    },
  });

  function handleMicClick() {
    if (speech.status === 'listening') {
      speech.stop();
    } else {
      speech.start();
    }
  }

  function handleBack() {
    navigate('/');
  }

  async function handleOrganize() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setStep('loading');
    setErrorMessage(null);

    try {
      const raw = await organizeBrainDump(trimmed);

      if (raw.length === 0) {
        setErrorMessage('No actionable tasks or events found.');
        setStep('input');
        return;
      }

      const withChecks = raw.map((s) => {
        const possibleDuplicate = isPossibleDuplicate(s, tasks, events);
        // An event with no date can't be created yet — start it unselected
        // rather than letting the user tap "Add" into a confusing failure.
        const included = s.type === 'event' && !s.date ? false : s.included;
        return { ...s, possibleDuplicate, included };
      });

      setSuggestions(withChecks);
      setStep('review');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Timo couldn't organize that right now. Try again.",
      );
      setStep('input');
    }
  }

  function updateSuggestion(id: string, patch: Partial<BrainDumpSuggestion>) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSuggestion(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddToTimo() {
    const included = suggestions.filter((s) => s.included);
    if (included.length === 0) return;

    setStep('saving');
    setErrorMessage(null);

    let succeeded = 0;
    let reminderFailures = 0;
    const failed: BrainDumpSuggestion[] = [];

    for (const suggestion of included) {
      const resolvedReminder = resolveReminderSelection(suggestion);

      try {
        let createdId: string;
        if (suggestion.type === 'task') {
          const created = await addTask({
            title: suggestion.title,
            description: suggestion.description,
            dueDate: suggestion.date,
            dueTime: suggestion.time,
            // tasks.priority is NOT NULL at the database level (see
            // 0001_init.sql: `not null default 'medium' check (priority in
            // ('low','medium','high'))`) — a real value must always be
            // stored, there is no way to persist "unset". When the AI/user
            // left priority unspecified on Review, 'medium' is applied
            // only here, at the save boundary — the Review UI itself
            // still shows and preserves "unset" faithfully up to this
            // point (see SuggestionCard's priority chips), so nothing is
            // silently misrepresented before the user commits.
            priority: suggestion.priority ?? 'medium',
            category: suggestion.category ?? 'other',
            estimatedMinutes: suggestion.estimatedMinutes,
            // Reminder is attached separately below via a dedicated
            // context action, not through this call's own reminder field
            // — that gives a real per-item Promise to catch AND keeps
            // AppStateContext's `reminders` state in sync immediately,
            // rather than only after a refresh.
            reminder: null,
          });
          createdId = created.id;
        } else {
          if (!suggestion.date) throw new Error('An event needs a date.');
          const created = await addEvent({
            title: suggestion.title,
            description: suggestion.description,
            eventDate: suggestion.date,
            startTime: suggestion.time,
            endTime: suggestion.endTime,
            allDay: false,
            eventType: suggestion.eventType ?? 'event',
            location: suggestion.location,
            reminder: null,
          });
          createdId = created.id;
        }
        succeeded++;

        // The Task/Event now exists — from here on, a reminder problem
        // must NEVER be treated as "retry the whole item" (that would
        // create a duplicate Task/Event). It's tracked and reported
        // separately instead. attachTaskReminder/attachEventReminder
        // throw on failure (unlike the never-throwing applyTaskReminder/
        // applyEventReminder used internally by addTask/addEvent) and
        // update AppStateContext's `reminders` state themselves on
        // success, so a saved reminder is visible in the running app
        // immediately — no refresh needed.
        if (resolvedReminder === 'invalid') {
          reminderFailures++;
        } else if (resolvedReminder) {
          try {
            if (suggestion.type === 'task') {
              await attachTaskReminder(createdId, resolvedReminder);
            } else {
              await attachEventReminder(createdId, resolvedReminder);
            }
          } catch {
            reminderFailures++;
          }
        }
      } catch {
        failed.push(suggestion);
      }
    }

    // Never silently claim success — keep excluded items and any failures
    // around so nothing the user typed is lost, and only drop the ones
    // that actually saved.
    const excluded = suggestions.filter((s) => !s.included);
    setSuggestions([...failed, ...excluded]);

    if (failed.length === 0 && reminderFailures === 0) {
      setResultMessage(`${succeeded} item${succeeded === 1 ? '' : 's'} added to Timo`);
      setStep('done');
    } else if (failed.length === 0 && reminderFailures > 0) {
      // The items themselves are safely created — only surface the
      // reminder shortfall, and do NOT send the user back to Review
      // (that would risk them re-adding an already-created item).
      setResultMessage(
        `${succeeded} item${succeeded === 1 ? '' : 's'} added, but ${reminderFailures} reminder${reminderFailures === 1 ? '' : 's'} couldn't be saved.`,
      );
      setStep('done');
    } else if (succeeded > 0) {
      setErrorMessage(
        `${succeeded} added, ${failed.length} couldn't be saved. Review and try again below.`,
      );
      setStep('review');
    } else {
      setErrorMessage("Couldn't add the selected items. Try again.");
      setStep('review');
    }
  }

  function handleStartOver() {
    setText('');
    setSuggestions([]);
    setErrorMessage(null);
    setResultMessage(null);
    setStep('input');
  }

  return (
    <>
      <Header title="Brain Dump" onBack={handleBack} />

      <div className="brain-dump-page">
        {step === 'input' && (
          <>
            <Card padding="sm" className="brain-dump-hero">
              <div className="brain-dump-hero__mascot">
                <TimoMascot variant="thinking" />
              </div>
              <p className="brain-dump-hero__text">
                Tell Timo everything on your mind — Timo will turn it into Tasks and Events for you
                to review.
              </p>
            </Card>

            <div className="brain-dump-textarea-wrap">
              <textarea
                className="brain-dump-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                rows={8}
                maxLength={4000}
              />
              {speech.isSupported && (
                <button
                  type="button"
                  className={`brain-dump-mic-button ${speech.status === 'listening' ? 'brain-dump-mic-button--active' : ''}`}
                  onClick={handleMicClick}
                  aria-label={speech.status === 'listening' ? 'Stop voice input' : 'Start voice input'}
                >
                  {speech.status === 'listening' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M19 11a7 7 0 01-14 0M12 18v3"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              )}
            </div>

            {speech.status === 'listening' && (
              <p className="brain-dump-voice-status">
                <span className="brain-dump-voice-pulse" aria-hidden="true" />
                Listening… {speech.interimTranscript}
              </p>
            )}

            {!speech.isSupported && (
              <p className="brain-dump-voice-hint">Voice input isn't supported on this browser yet.</p>
            )}

            {speech.error && <p className="brain-dump-error">{speech.error}</p>}

            {errorMessage && <p className="brain-dump-error">{errorMessage}</p>}

            <Button fullWidth size="lg" onClick={handleOrganize} disabled={!text.trim()}>
              Organize with Timo
            </Button>
          </>
        )}

        {step === 'loading' && (
          <div className="brain-dump-loading">
            <div className="brain-dump-loading__mascot">
              <TimoMascot variant="thinking" />
            </div>
            <p>Let me sort this out.</p>
          </div>
        )}

        {step === 'review' && (
          <>
            <p className="brain-dump-review-intro">
              Review what Timo found. Nothing is saved yet — edit, remove, or deselect anything
              before adding.
            </p>

            {errorMessage && <p className="brain-dump-error">{errorMessage}</p>}

            <div className="brain-dump-suggestions">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onChange={(patch) => updateSuggestion(suggestion.id, patch)}
                  onRemove={() => removeSuggestion(suggestion.id)}
                />
              ))}
            </div>

            {suggestions.length === 0 ? (
              <Button fullWidth size="lg" onClick={handleStartOver}>
                Start over
              </Button>
            ) : (
              <Button fullWidth size="lg" onClick={handleAddToTimo} disabled={includedCount === 0}>
                Add {includedCount || ''} to Timo
              </Button>
            )}
          </>
        )}

        {step === 'saving' && (
          <div className="brain-dump-loading">
            <TimoAvatar state="focused" size="lg" />
            <p>Adding to Timo…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="brain-dump-done">
            <TimoAvatar state="celebrating" size="lg" />
            <p className="brain-dump-done__message">{resultMessage}</p>
            <Button fullWidth size="lg" onClick={handleBack}>
              Back to Today
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
