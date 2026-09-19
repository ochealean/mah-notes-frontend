// ============================================================
//  The rail's identity footer: who you are, the bundle you are wearing,
//  and a way to see the card people get when you share a link.
//
//  The avatar is 44px, which resolves to the 'simple' decoration tier —
//  the rim and one orbiting body. The full system would be invisible
//  detail at this size and cost exactly the same to draw.
// ============================================================
import BundleAvatar, { Face } from './BundleAvatar';
import { useBundle } from '../lib/bundles';

type Props = {
  user: any;
  onAccount: () => void;
  onShareCard: () => void;
};

export default function RailFoot({ user, onAccount, onShareCard }: Props) {
  const { bundle } = useBundle();

  if (!user) {
    return (
      <div className="bfoot">
        <button className="bfoot-id" onClick={onAccount} title="Sign in">
          <BundleAvatar size={44}>
            <span className="bav-img bav-initial"><i className="fas fa-user" aria-hidden="true" /></span>
          </BundleAvatar>
          <span className="bfoot-t">
            <span className="bfoot-n">Not signed in</span>
            <span className="bfoot-h">Sign in to sync and share</span>
          </span>
        </button>
      </div>
    );
  }

  const name = user.displayName || user.username || 'You';
  const handle = user.username ? `@${user.username}` : (user.email || '');
  return (
    <div className="bfoot">
      <button className="bfoot-id" onClick={onAccount} title="Your account">
        <BundleAvatar size={44}><Face src={user.avatar} name={name} /></BundleAvatar>
        <span className="bfoot-t">
          <span className="bfoot-n">{name}</span>
          <span className="bfoot-h">
            {handle}{bundle.id !== 'default' ? <> · {bundle.name}</> : null}
          </span>
        </span>
      </button>
      {/* Only a bundle with a card has anything to preview: with Default
          equipped, shared links open straight on the note. */}
      {bundle.sky && (
        <button className="bfoot-share" onClick={onShareCard}
          aria-label="Preview your share card" title="Preview your share card">
          <i className="fas fa-arrow-up-from-bracket" />
        </button>
      )}
    </div>
  );
}
