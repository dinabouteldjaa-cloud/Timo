import TimoMascot from '../../components/ui/TimoMascot';
import './AuthLayout.css';

export default function AuthBrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="auth-brand">
      <div className="auth-brand__mascot">
        <TimoMascot variant="greeting" />
      </div>
      <p className="auth-brand__title">Timo</p>
      <p className="auth-brand__subtitle">{subtitle}</p>
    </div>
  );
}
