import timoGreeting from '../../assets/timo/timo-greeting.png';
import timoHappy from '../../assets/timo/timo-happy.png';
import timoMotivating from '../../assets/timo/timo-motivating.png';
import timoThinking from '../../assets/timo/timo-thinking.png';
import timoCelebrating from '../../assets/timo/timo-celebrating.png';
import timoConcerned from '../../assets/timo/timo-concerned.png';
import timoResting from '../../assets/timo/timo-resting.png';
import './TimoMascot.css';

// There is intentionally no 'focused' variant yet — no timo-focused.png
// asset exists. Do not add one until a real asset is provided.
export type TimoMascotVariant =
  | 'greeting'
  | 'happy'
  | 'motivating'
  | 'thinking'
  | 'celebrating'
  | 'concerned'
  | 'resting';

const VARIANT_SOURCES: Record<TimoMascotVariant, string> = {
  greeting: timoGreeting,
  happy: timoHappy,
  motivating: timoMotivating,
  thinking: timoThinking,
  celebrating: timoCelebrating,
  concerned: timoConcerned,
  resting: timoResting,
};

interface TimoMascotProps {
  variant: TimoMascotVariant;
  className?: string;
}

/**
 * Renders the real Timo mascot artwork for a given emotional state. This
 * is a plain <img> using object-fit: contain, not a circular avatar frame
 * — the PNGs may have different native dimensions, so the container
 * defines the box and this component only ever preserves the image's own
 * aspect ratio within it, never stretching or cropping it.
 *
 * This is separate from the existing TimoAvatar component (still used
 * elsewhere in the app as its own placeholder abstraction) — that
 * component is untouched by this addition.
 */
export default function TimoMascot({ variant, className }: TimoMascotProps) {
  return (
    <img
      src={VARIANT_SOURCES[variant]}
      alt={`Timo, ${variant}`}
      className={`timo-mascot${className ? ` ${className}` : ''}`}
    />
  );
}
