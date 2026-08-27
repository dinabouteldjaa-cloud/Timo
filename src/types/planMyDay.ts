/**
 * A single AI-proposed time block for one of the user's existing tasks.
 * Nothing here is persisted directly — accepting a plan calls the
 * existing setTaskSchedule action per block, through the normal
 * authenticated flow and RLS.
 */
export interface PlannedTaskBlock {
  taskId: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  /** True if Timo invented this duration because the task had none set. */
  estimatedDuration: boolean;
}

export interface UnscheduledTask {
  taskId: string;
  reason: string | null;
}

export interface PlanMyDayResult {
  scheduled: PlannedTaskBlock[];
  unscheduled: UnscheduledTask[];
}
