// ============================================================
//  The share card (v-card).
//
//  The one surface someone who has never used Mah Notes will ever see, so
//  it does recruitment as well as decoration. A shared link opens on this
//  card — in the SENDER's bundle — and the note opens from it.
//
//  The identity block degrades in four directions, because the author's two
//  privacy switches make four shapes (picture and name, initial and name,
//  picture alone, neither). None of them may leave a hole: with no identity
//  to show, the card leads with the app mark and still reads as something a
//  person sent.
// ============================================================
import { useEffect } from 'react';
import BundleSky, { type Ground } from './BundleSky';
import BundleAvatar from './BundleAvatar';
import { getBundle } from '../lib/bundles';
import logoUrl from '../images/mn_logo.png';

export type CardAuthor = { name?: string; avatar?: string; showAvatar?: boolean } | null;

type Props = {
  bundleId: string;
  author: CardAuthor;
  handle?: string;
  kind: 'note' | 'plan';
  title: string;
  onOpen: () => void;
  ground?: Ground | null;
};

export default function ShareCard({ bundleId, author, handle, kind, title, onOpen, ground }: Props) {
  const bundle = getBundle(bundleId);
  const name = (author?.name || '').trim();
  const avatar = author?.avatar || '';
  const showAvatar = author?.showAvatar !== false;

  let face = null;
  if (avatar) face = <img className="bav-img" src={avatar} alt="" />;
  else if (showAvatar) {
    face = (
      <span className="bav-img bav-initial">
        {name ? name.charAt(0).toUpperCase() : <i className="fas fa-user" aria-hidden="true" />}
      </span>
    );
  }
  const anonymous = !face && !name;

  return (
    <div className="vcard" data-bundle-surface={bundle.id}>
      {/* The share page is where the polish is worth spending, so the sky
          runs at full here. It still pauses on a hidden tab and still holds
          its still composition under reduced motion. */}
      <BundleSky preset="card" bundleId={bundle.id} motion="full" ground={ground} />
      <div className="vcard-c">
        <div className="vcard-kicker">Shared with you</div>
        <BundleAvatar size={112} bundleId={bundle.id} motion="full">
          {face || <span className="bav-img bav-mark"><img src={logoUrl} alt="" /></span>}
        </BundleAvatar>
        <div className="vcard-ident">
          {name ? <div className="vcard-name">{name}</div>
            : anonymous && <div className="vcard-name">Someone on Mah Notes</div>}
          {handle && <div className="vcard-handle">@{handle}</div>}
          {bundle.id !== 'default' && <div className="vcard-bundle"><span className="bsq" />{bundle.name}</div>}
        </div>
        <div className="vcard-note">
          <div className="vcard-label">{kind === 'plan' ? 'Weekly plan' : 'Document'}</div>
          <div className="vcard-title">{title || (kind === 'plan' ? 'Plan' : 'Untitled')}</div>
        </div>
        {/* One action, full width, beating gently — for someone who has never
            seen the app, it is the only thing on this card worth pressing. */}
        <div className="vcard-act">
          <button type="button" className="vc-btn primary vc-open" onClick={onOpen}>
            <span className="vc-open-t"><i className="fas fa-arrow-right" /> Open the {kind === 'plan' ? 'plan' : 'note'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── In-app preview: "this is what people see" ──────────────
type PreviewProps = {
  user: any;
  bundleId: string;
  sample: { kind: 'note' | 'plan'; title: string };
  onClose: () => void;
  onPrivacy: () => void;
};

export function ShareCardPreview({ user, bundleId, sample, onClose, onPrivacy }: PreviewProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Exactly what the public share endpoint would send, per Settings → Privacy.
  const nameOn = user?.shareIdentity !== false;
  const picOn = user?.shareAvatar !== false;
  const author = {
    name: nameOn ? (user?.displayName || user?.username || '') : '',
    avatar: picOn ? (user?.avatar || '') : '',
    showAvatar: picOn,
  };
  const handle = nameOn ? (user?.username || '') : '';
  const shows = nameOn && picOn ? 'your name and picture' : nameOn ? 'your name only' : picOn ? 'your picture only' : 'no byline at all';

  return (
    <div className="modal-overlay scp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scp" role="dialog" aria-modal="true" aria-label="Your share card">
        <ShareCard
          bundleId={bundleId}
          author={author}
          handle={handle}
          kind={sample.kind}
          title={sample.title}
          onOpen={onClose}
        />
        <aside className="scp-side">
          <div className="scp-head">
            <span className="kicker">Preview</span>
            <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
          </div>
          <h3 className="scp-title">This is what people see</h3>
          <p>
            Anyone who opens a link you share lands on this card first — in your bundle and your
            colour theme — and the note opens from it. They do not need an account.
          </p>
          <p>
            Right now the card shows <b>{shows}</b>. Once they open the note, the card steps
            aside — a refresh takes them straight back to the note, not to this card.
          </p>
          <div className="scp-actions">
            <button className="btn btn-ghost" onClick={onPrivacy}>
              <i className="fas fa-lock" /> Change what it shows
            </button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
