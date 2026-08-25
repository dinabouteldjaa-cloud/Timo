import './Checkbox.css';

interface CheckboxProps {
  checked: boolean;
  onChange?: () => void;
  'aria-label'?: string;
}

export default function Checkbox({ checked, onChange, ...rest }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`checkbox ${checked ? 'checkbox--checked' : ''}`}
      onClick={onChange}
      {...rest}
    >
      {checked && (
        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
          <path
            d="M1 5L4.5 8.5L12 1"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
