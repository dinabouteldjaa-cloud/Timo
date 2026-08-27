import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import { useAppState } from '../../state/AppStateContext';
import { organizeBrainDump } from '../../lib/brainDumpApi';
import { isPossibleDuplicate } from '../../lib/brainDumpDuplicates';
import type { BrainDumpSuggestion } from '../../types/brainDump';
import SuggestionCard from './SuggestionCard';
import './BrainDumpPage.css';

type Step = 'input' | 'loading' | 'review' | 'saving' | 'done';

const PLACEHOLDER =
  "Tomorrow I need to finish the presentation, call Ahmed, buy groceries after work, and I have a dentist appointment at 6.";

export default function BrainDumpPage() {
  const navigate = useNavigate();
  const { tasks, events, addTask, addEvent } = useAppState();

  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<BrainDumpSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const includedCount = suggestions.filter((s) => s.included).length;

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
    const failed: BrainDumpSuggestion[] = [];

    for (const suggestion of included) {
      try {
        if (suggestion.type === 'task') {
          await addTask({
            title: suggestion.title,
            description: suggestion.description,
            dueDate: suggestion.date,
            dueTime: suggestion.time,
            priority: suggestion.priority ?? 'medium',
            category: suggestion.category ?? 'other',
            estimatedMinutes: suggestion.estimatedMinutes,
            reminder: null,
          });
        } else {
          if (!suggestion.date) throw new Error('An event needs a date.');
          await addEvent({
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
        }
        succeeded++;
      } catch {
        failed.push(suggestion);
      }
    }

    // Never silently claim success — keep excluded items and any failures
    // around so nothing the user typed is lost, and only drop the ones
    // that actually saved.
    const excluded = suggestions.filter((s) => !s.included);
    setSuggestions([...failed, ...excluded]);

    if (failed.length === 0) {
      setResultMessage(`${succeeded} item${succeeded === 1 ? '' : 's'} added to Timo`);
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
            <Card padding="lg" className="brain-dump-hero">
              <TimoAvatar state="thinking" size="lg" />
              <p className="brain-dump-hero__text">
                Tell Timo everything on your mind — Timo will turn it into Tasks and Events for you
                to review.
              </p>
            </Card>

            <textarea
              className="brain-dump-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={8}
              maxLength={4000}
            />

            {errorMessage && <p className="brain-dump-error">{errorMessage}</p>}

            <Button fullWidth size="lg" onClick={handleOrganize} disabled={!text.trim()}>
              Organize with Timo
            </Button>
          </>
        )}

        {step === 'loading' && (
          <div className="brain-dump-loading">
            <TimoAvatar state="thinking" size="lg" />
            <p>Timo is organizing your notes…</p>
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
