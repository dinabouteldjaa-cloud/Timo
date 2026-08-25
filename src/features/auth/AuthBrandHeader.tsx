import './AuthLayout.css';

export default function AuthBrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="auth-brand">
      <div className="auth-brand__mark">T</div>
      <p className="auth-brand__title">Timo</p>
      <p className="auth-brand__subtitle">{subtitle}</p>
    </div>
  );
}
