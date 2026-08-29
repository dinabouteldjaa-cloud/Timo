import Checkbox from '../../components/ui/Checkbox';
import Badge from '../../components/ui/Badge';
import type { BrainDumpSuggestion } from '../../types/brainDump';
import type { CalendarEventType, TaskCategory, TaskPriority } from '../../types/task';
import './SuggestionCard.css';

interface SuggestionCardProps {
  suggestion: BrainDumpSuggestion;
  onChange: (patch: Partial<BrainDumpSuggestion>) => void;
  onRemove: () => void;
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];
const CATEGORIES: TaskCategory[] = ['work', 'personal', 'health', 'errands', 'learning', 'other'];
const EVENT_TYPES: CalendarEventType[] = ['event', 'meeting'];

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  work: 'Work',
  personal: 'Personal',
  health: 'Health',
  errands: 'Errands',
  learning: 'Learning',
  other: 'Other',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export default function SuggestionCard({ suggestion, onChange, onRemove }: SuggestionCardProps) {
  const isEvent = suggestion.type === 'event';
  const missingRequiredDate = isEvent && !suggestion.date;

  return (
    <div className={`suggestion-card ${!suggestion.included ? 'suggestion-card--excluded' : ''}`}>
      <div className="suggestion-card__top">
        <Checkbox
          checked={suggestion.included}
          onChange={() => {
            if (!missingRequiredDate) onChange({ included: !suggestion.included });
          }}
          aria-label={suggestion.title}
        />
        <div className="suggestion-card__badges">
          <Badge tone={isEvent ? 'success' : 'primary'}>{isEvent ? 'Event' : 'Task'}</Badge>
          {suggestion.possibleDuplicate && <Badge tone="medium">Possible duplicate</Badge>}
        </div>
        <button
          type="button"
          className="suggestion-card__remove"
          onClick={onRemove}
          aria-label="Remove suggestion"
        >
          ✕
        </button>
      </div>

      <input
        className="suggestion-card__title-input"
        value={suggestion.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Title"
      />

      <div className="suggestion-card__row">
        <label className="suggestion-card__field">
          <span className="suggestion-card__label">Date{isEvent ? ' (required)' : ''}</span>
          <input
            className={`suggestion-card__input ${missingRequiredDate ? 'suggestion-card__input--error' : ''}`}
            type="date"
            value={suggestion.date ?? ''}
            onChange={(e) => onChange({ date: e.target.value || undefined })}
          />
        </label>
        <label className="suggestion-card__field">
          <span className="suggestion-card__label">{isEvent ? 'Start time' : 'Time'}</span>
          <input
            className="suggestion-card__input"
            type="time"
            value={suggestion.time ?? ''}
            onChange={(e) => onChange({ time: e.target.value || undefined })}
          />
        </label>
        {isEvent && (
          <label className="suggestion-card__field">
            <span className="suggestion-card__label">End time</span>
            <input
              className="suggestion-card__input"
              type="time"
              value={suggestion.endTime ?? ''}
              onChange={(e) => onChange({ endTime: e.target.value || undefined })}
            />
          </label>
        )}
      </div>

      {missingRequiredDate && (
        <p className="suggestion-card__hint">Add a date to include this event.</p>
      )}

      {!isEvent && (
        <>
          <label className="suggestion-card__field">
            <span className="suggestion-card__label">Estimated duration (min)</span>
            <input
              className="suggestion-card__input"
              type="number"
              min={0}
              step={5}
              placeholder="Optional"
              value={suggestion.estimatedMinutes ?? ''}
              onChange={(e) =>
                onChange({
                  estimatedMinutes: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
          <div className="suggestion-card__field">
            <span className="suggestion-card__label">Priority</span>
            <div className="suggestion-card__chip-row">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`suggestion-card__chip ${suggestion.priority === p ? 'suggestion-card__chip--active' : ''}`}
                  onClick={() => onChange({ priority: suggestion.priority === p ? undefined : p })}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="suggestion-card__field">
            <span className="suggestion-card__label">Category</span>
            <div className="suggestion-card__chip-row scroll-row">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`suggestion-card__chip ${suggestion.category === c ? 'suggestion-card__chip--active' : ''}`}
                  onClick={() => onChange({ category: c })}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {isEvent && (
        <>
          <div className="suggestion-card__field">
            <span className="suggestion-card__label">Type</span>
            <div className="suggestion-card__chip-row">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`suggestion-card__chip ${suggestion.eventType === type ? 'suggestion-card__chip--active' : ''}`}
                  onClick={() => onChange({ eventType: type })}
                >
                  {type === 'event' ? 'Event' : 'Meeting'}
                </button>
              ))}
            </div>
          </div>
          <label className="suggestion-card__field">
            <span className="suggestion-card__label">Location</span>
            <input
              className="suggestion-card__input"
              value={suggestion.location ?? ''}
              onChange={(e) => onChange({ location: e.target.value || undefined })}
              placeholder="Optional"
            />
          </label>
        </>
      )}
    </div>
  );
}
