// ============================================================
//  The rail's identity footer: who you are and the bundle you are wearing,
//  one click from your account. Desktop only — on a phone your avatar is
//  the last tab of the bottom nav instead (see MainApp).
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
};

export default function RailFoot({ user, onAccount }: Props) {
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
    </div>
  );
}
