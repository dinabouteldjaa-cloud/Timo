import './ProgressBar.css';

interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'primary' | 'success';
}

export default function ProgressBar({ value, tone = 'primary' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`progress-bar__fill progress-bar__fill--${tone}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
