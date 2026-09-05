import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TaskRow from '../../components/ui/TaskRow';
import EmptyState from '../../components/ui/EmptyState';
import { useLocale, formatString } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import type { Task } from '../../types/task';
import './TasksPage.css';

/**
 * Archived Tasks — reached from Tasks (see the "View archived tasks" link
 * in TasksPage), not a new bottom-nav tab. Kept deliberately simple for
 * v1: a flat, newest-archived-first list with multi-select Restore/
 * Delete, no filters, no recurrence-occurrence expansion. Every archived
 * item is already a real, concrete row in `tasks` — either an ordinary
 * task or an occurrence override (a recurring SERIES that was archived
 * as a whole also just shows up here as its own single row, exactly like
 * an ordinary task) — so no occurrence expansion is needed to find or
 * display them.
 */
export default function ArchivedTasksPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { tasks, unarchiveTask, deleteTask, deleteTaskOccurrence } = useAppState();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Newest archived first. `archivedAt` is always set for anything in
  // this list (that's the whole filter), so no fallback ordering is
  // needed the way Completed's history needs one for missing timestamps.
  const archivedTasks = useMemo(
    () =>
      tasks
        .filter((task) => Boolean(task.archivedAt))
        .sort((a, b) => (b.archivedAt as string).localeCompare(a.archivedAt as string)),
    [tasks],
  );

  function toggleSelected(task: Task) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(archivedTasks.map((task) => task.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  /**
   * Restoring just clears archived_at on the SAME existing row — whether
   * it's an ordinary task or a recurring occurrence override. Nothing new
   * is ever created, so this can never produce a duplicate: an override
   * that gets un-archived is immediately picked back up by
   * expandTaskOccurrences (its archivedAt guard simply stops excluding
   * it), and there was never a second, separate virtual occurrence
   * generated alongside it to begin with — the override IS the one and
   * only row for that date.
   */
  async function handleBulkRestore() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => unarchiveTask(id)));
    const failed = new Set<string>();
    results.forEach((result, i) => {
      if (result.status === 'rejected') failed.add(ids[i]);
    });
    setBulkBusy(false);
    if (failed.size > 0) {
      setSelectedIds(failed);
      setBulkError(formatString(t.tasks.bulkPartialError, { failed: failed.size, total: ids.length }));
    } else {
      clearSelection();
    }
  }

  /**
   * Permanently deletes a selected archived row — same safe per-row
   * semantics as everywhere else: an archived recurring occurrence
   * override deletes via deleteTaskOccurrence (this occurrence only,
   * a skip is recorded so it can never silently reappear virtually);
   * an archived ordinary task deletes via deleteTask. Never touches or
   * deletes a series parent as a side effect.
   */
  async function deleteOneArchived(task: Task) {
    if (task.recurrenceParentId && task.recurrenceOccurrenceDate) {
      await deleteTaskOccurrence(task.recurrenceParentId, task.recurrenceOccurrenceDate, task.id);
      return;
    }
    await deleteTask(task.id);
  }

  async function handleConfirmBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    const ids = [...selectedIds];
    const rows = archivedTasks.filter((task) => ids.includes(task.id));
    const results = await Promise.allSettled(rows.map((task) => deleteOneArchived(task)));
    const failed = new Set<string>();
    results.forEach((result, i) => {
      if (result.status === 'rejected') failed.add(rows[i].id);
    });
    setBulkBusy(false);
    setDeleteConfirmOpen(false);
    if (failed.size > 0) {
      setSelectedIds(failed);
      setBulkError(formatString(t.tasks.bulkPartialError, { failed: failed.size, total: rows.length }));
    } else {
      clearSelection();
    }
  }

  return (
    <>
      <Header title={t.tasks.archivedTasksTitle} onBack={() => navigate('/tasks')} />

      <div className="tasks-page">
        {archivedTasks.length > 0 && (
          <div className="tasks-toolbar">
            <span className="tasks-toolbar__count">{formatString(t.tasks.selectedCount, { count: selectedIds.size })}</span>
            <button type="button" className="tasks-toolbar__link" onClick={selectAll}>
              {t.tasks.selectAll}
            </button>
            {selectedIds.size > 0 && (
              <button type="button" className="tasks-toolbar__link tasks-toolbar__link--done" onClick={clearSelection}>
                {t.tasks.done}
              </button>
            )}
          </div>
        )}

        {bulkError && <p className="tasks-error-banner">{bulkError}</p>}

        <Card padding="md">
          {archivedTasks.length === 0 ? (
            <EmptyState title={t.tasks.noArchivedTasks} subtitle={t.tasks.noArchivedTasksSubtitle} />
          ) : (
            archivedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                hasReminder={false}
                isRecurring={Boolean(task.recurrenceParentId)}
                selectionMode
                selected={selectedIds.has(task.id)}
                onSelectToggle={() => toggleSelected(task)}
                onOpen={() => toggleSelected(task)}
              />
            ))
          )}
        </Card>
      </div>

      {selectedIds.size > 0 && (
        <div className="tasks-bulk-bar">
          <button type="button" className="tasks-bulk-bar__action" disabled={bulkBusy} onClick={handleBulkRestore}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12a8 8 0 1 1 2.34 5.66" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4 8v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tasks.restore}</span>
          </button>
          <button
            type="button"
            className="tasks-bulk-bar__action tasks-bulk-bar__action--danger"
            disabled={bulkBusy}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 7h14M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7M7.5 7l.7 12a1.5 1.5 0 001.5 1.4h4.6a1.5 1.5 0 001.5-1.4l.7-12"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t.tasks.delete}</span>
          </button>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="add-task-overlay" role="dialog" aria-modal="true" aria-label={t.tasks.delete}>
          <Card padding="lg" className="tasks-occurrence-choice">
            <p className="tasks-occurrence-choice__title">
              {formatString(t.tasks.deleteConfirmTitle, { count: selectedIds.size })}
            </p>
            <p className="tasks-move-sheet__warning">{t.tasks.deleteConfirmWarning}</p>
            <div className="tasks-occurrence-choice__actions">
              <Button variant="ghost" fullWidth onClick={() => setDeleteConfirmOpen(false)} disabled={bulkBusy}>
                {t.tasks.cancel}
              </Button>
              <Button variant="danger" fullWidth onClick={handleConfirmBulkDelete} disabled={bulkBusy}>
                {bulkBusy ? '…' : t.tasks.delete}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
