import { useSlowHint } from '../lib/useSlowHint';

export default function Loader({ text = 'Loading…', slowText = 'Waking up the server — this can take a moment…' }) {
  const slow = useSlowHint(true);
  return (
    <div className="loader active">
      <div className="spinner" />
      <div className="loader-text">{slow ? slowText : text}</div>
    </div>
  );
}
