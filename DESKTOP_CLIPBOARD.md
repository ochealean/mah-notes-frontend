# Mah Notes — Desktop app and cross-device clipboard

Reference for the Tauri desktop build and the shared clipboard.

All nine phases are complete.

**Two things need you, not code.** Code signing is a certificate you buy.
Google sign-in on the desktop needs three loopback redirect URIs registered in
the Google Cloud console for the existing OAuth **Web application** client:

```
http://127.0.0.1:8765
http://127.0.0.1:8766
http://127.0.0.1:8767
```

Google exempts loopback addresses from its https-only rule, but the exact port
must be registered, so the app tries these three in order and uses the first
one free. Until they are registered, Google sign-in on the desktop fails with
`redirect_uri_mismatch`; email and password are unaffected.

| Phase | What it delivers | State |
|---|---|---|
| 0 | Platform abstraction | **Done** |
| 1 | Clip data model, pinning, retention | **Done** |
| 2 | Backend clip entity, delta sync, expiry | **Done** |
| 3 | Opt-in sync switch and honest copy | **Done** |
| 4 | Realtime push | **Done** |
| 5 | The Tauri desktop shell | **Done** |
| 6 | `Alt+N` capture | **Done** |
| 7 | `Alt+M` paste panel | **Done** |
| 8 | Packaging and hardening | **Done**, except code signing |
| 9 | Clips on the website | **Done** |

Run the desktop app with `npm run desktop:dev`. Build an installer with
`npm run desktop:build`. Neither needs cargo on your PATH — `scripts/tauri.mjs`
resolves it, because a shell opened before Rust was installed never sees the
PATH entry rustup added.

`Alt+N` verified end to end against a real selection:

```
FOREGROUND: Notepad
RESULT:     GOT
SOURCE:     Notepad
clipboard after: SENTINEL-CLIPBOARD-MUST-SURVIVE   <- unchanged
```

and with nothing selected:

```
RESULT:     NOTHING_SELECTED
SEQ_BEFORE: 124   SEQ_AFTER: 124   <- clipboard never touched
```

`Alt+M` verified the same way — the text lands in the app that had focus,
and the clipboard is given back:

```
TARGET: Notepad
RESULT: DONE
NOTEPAD NOW CONTAINS:  PASTED-BY-MAH-NOTES
clipboard AFTER paste: RESTORE-ME-AFTER-PASTE   <- unchanged
```

---

## Why this is a wide change

Three facts about the existing code shape everything below.

**Clips have never left the device.** On Android they are captured by a separate
process with no WebView. Highlighting text and tapping "Mah Notes" in the selection
toolbar runs `SaveClipActivity`, which writes to SharedPreferences because it cannot
reach IndexedDB. The app drains that queue on open and on resume. The backend has never
heard of a clip; grepping the whole backend for "clip" returns nothing.

**`isNative` was a two-way branch.** It answered "is this the Android APK?", and every
data decision was hung off it. Capacitor cannot see a Tauri WebView, so a desktop build
would have silently taken the web path: REST-only data, no local store, no clips tab.

**The sync engine has never carried a high-churn entity.** It pushes every row of every
store on every sync and pulls a full authoritative replacement. That is fine for a few
dozen notes. A clipboard is unbounded.

## Settled decisions

| Decision | Choice | Why |
|---|---|---|
| Clip sync | Opt-in, default off | Nobody's clipboard gets uploaded by surprise |
| Sensitive data | Permanent visible notice | Clips are stored like notes, not encrypted |
| Encryption | None | Consistent with notes; keeps clips searchable |
| Desktop scope | The full app plus the clipboard | One product everywhere |
| Desktop platforms | Windows only for v1 | The capture and paste techniques are per-platform |
| Desktop capture | `Alt+N` only, no background monitoring | Matches Android, and keeps the warning honest |
| Retention | 30 days, pinned exempt, 24h grace after a late unpin | Bounds storage and exposure |

---

# Phase 0 — Platform abstraction · Done

## The problem

`Capacitor.isNativePlatform()` returns false inside a Tauri WebView. Every branch that
asked "is this native?" to decide where data lives would have answered "web" on desktop.

## What changed

New module `src/lib/platform.ts` splits one question into two.

```ts
export type Platform = 'web' | 'android' | 'desktop';

export const platform: Platform          // which OS shell
export const isNative                    // still means "the Android app"
export const isDesktop, isWeb
export const hasLocalStore               // owns an offline copy: android + desktop
export const hasClips                    // can capture clips: android + desktop
export const hasGlobalHotkeys            // desktop only
```

Desktop is detected by `__TAURI_INTERNALS__` on the window, which Tauri v2 injects before
any app code runs.

`isNative` keeps its original meaning and is re-exported from `nativeAuth.ts`, so the
roughly forty existing call sites are untouched and nothing about Android or the web
changed on day one. Only the sites that should follow the **store** rather than the **OS**
were moved to `hasLocalStore`:

| File | What it decides |
|---|---|
| `src/lib/repo.ts` | IndexedDB and sync, or REST |
| `src/lib/scheduleStore.ts` | same, for schedule blocks |
| `src/lib/webCache.ts` | the localStorage stand-in for a local store |
| `src/App.tsx` | open straight into the app rather than gating on a network round trip |
| `src/components/MainApp.tsx` | sync bootstrap, reconcile branches, the clips tab |
| `src/components/Viewer.tsx` | read the offline copy for an owner view |

Everything Android-specific stayed on `isNative`: alarms, the home-screen widget, the APK
updater, the Capacitor plugins, native Google sign-in, and the reminder machinery inside
the schedule store.

## Verify

Web and Android behave exactly as before. Typecheck and build are clean.

---

# Phase 1 — Clip data model and retention · Done

## The shape change

Before: `{ id, text, source, createdAt }`. No stable cross-device id, no update
timestamp, no pin, no way to expire.

After, in `src/lib/clips.ts`:

```ts
export type Clip = {
  id: string;            // IndexedDB key; equals uid on the device
  uid: string;           // stable across devices once synced
  text: string;
  source: string;        // the app it came from, e.g. "Chrome"
  pinned: boolean;
  unpinnedAt: string | null;
  expiresAt: string | null;   // materialised; null means never
  createdAt: string;
  updatedAt: string;
};
```

## Retention is a pure function, not a stored deadline

`src/lib/clipRetention.ts` holds the whole rule:

```
pinned                                   -> never expires
unpinned, unpinnedAt >= created + 30d    -> unpinnedAt + 24h
otherwise                                -> created + 30d
```

Because it is deterministic, every device and the server reach the same answer without
talking to each other. That buys three things.

- A device offline for six months still expires its own clips correctly.
- Expiry needs **no tombstone**. A stale device re-uploading an expired clip is simply
  refused, because the server recomputes the same expiry and sees it has passed.
- The server can index the materialised value and let MongoDB TTL do the deleting, with
  no cron on a backend that sleeps.

The rule is exact in a way worth reading twice. Unpinning at day 29 leaves the deadline at
day 30 with **no** grace. Only a clip unpinned *after* its thirty days have already elapsed
gets the extra day. Taking `max(created + 30d, unpinned + 24h)` would wrongly hand out grace
at day 29, so the branch is explicit.

Verified against nine cases, including that one:

```
PASS  fresh unpinned is alive
PASS  31d unpinned is expired
PASS  pinned never expires
PASS  pinned 400d is alive
PASS  unpinned at day 40 is still alive
PASS  grace is 24h
PASS  unpinned at day 29 keeps the day-30 deadline
PASS  grace expired after 25h
PASS  bad createdAt is kept
```

## Migration, without losing anyone's clips

Existing clips migrate lazily on first read, following the same backfill that
`scheduleStore.listSchedules` already does for blocks created before schedules were
syncable. Each row missing a `uid` gets `uid = id`, an `updatedAt`, and `pinned = false`.

The trap: existing clips keep their original `createdAt`, so anything captured more than
thirty days ago would vanish the instant the update installs. On the backfill pass only,
the deadline is floored to thirty days out, behind a one-shot `clipsBackfilled` flag.
Nobody loses data to an upgrade.

No IndexedDB version bump was needed. The `clips` store already exists at version 3; only
the row shape changed.

## Sweep and cap

`listClips()` drops expired clips and caps the local history at 500 unpinned entries. It
runs on every read, which needs no timer and no background task because the store is small.
Text is capped at 20,000 characters, matching `ClipStore.MAX_TEXT` on Android so neither
side truncates the other.

## UI

A thumbtack in the pane actions and on the rail row. The pane status reads "Expires in 12
days" or "Kept while pinned". Pinned clips sort first, and the Android paste picker now
receives them first too.

---

# Phase 2 — Backend clip entity, delta sync, expiry

## The model

A `Clip` discriminator in `src/models/index.js`, following **Schedule** rather than Note:
silent delete sync, no reconcile prompt. Fields: `owner`, `uid`, `text`, `source`,
`device`, `pinned`, `unpinnedAt`, `expiresAt`, `deletedAt`, `deletedOn`.

Every field needs a `default`. The merge does blind field writes and nothing may be
`required` except `owner`.

Three indexes:

```js
Clip.schema.index({ owner: 1, uid: 1 },
  { unique: true, partialFilterExpression: { uid: { $type: 'string' } } });
Clip.schema.index({ owner: 1, updatedAt: -1 });          // the delta cursor query
Clip.schema.index({ expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { kind: 'Clip' } });
```

That last filter is **not optional**. The `data` collection is shared with Note, Plan,
ShareToken and FriendShare via a discriminator key. Without scoping the TTL index, any
future entity that adds an `expiresAt` would be silently deleted.

Clip text must **never** go through `sanitizeHtml`. Clips are plain text rendered as a
text node, so React already escapes them; the HTML sanitiser would mangle any clip
containing a `<` or an `&`.

## Sync is a delta for clips, unlike every other entity

Notes, plans and schedules stay full-dump. Clips do not. The arithmetic decides it: two
thousand clips at two kilobytes each is roughly four megabytes up and four down on every
sync, against a per-item query loop, on a sleeping free-tier instance. Retrofitting a
cursor after clips ship full-dump is strictly worse than building it now.

Request gains:

```
clips             only those changed since the cursor
deletedClipUids
clipsSince        null means "send everything"
deviceId          for realtime echo suppression in Phase 4
```

Response gains:

```
clips             server clips changed since the cursor
clipsRemovedUids  tombstoned or expired since the cursor
clipsServerTime   the new cursor, from the SERVER clock
```

Critically, `syncNow()` must **not** call `replaceAll('clips', ...)`. Clips apply as a
`bulkPut` of the returned rows plus a `remove` per removed uid. That difference is the whole
point, and it wants a comment where someone would otherwise "fix" the inconsistency.

## Server-side hardening

- Recompute `expiresAt` on the server. Never trust a client-supplied value; a buggy client
  could set it to the year 3000.
- Clamp incoming `updatedAt` to at most five minutes ahead of server time, or a device with
  a wrong clock wins every last-write-wins race forever.
- Cap text at 20,000 characters and clips per request; the client chunks.
- Use one `$in` query plus a `bulkWrite` rather than the existing per-item lookup loop.
- Enforce the account cap after the merge.

## Where expiry actually runs

Three layers, and no cron, because the backend sleeps on Render and a scheduled job would
run unpredictably or not at all.

1. **TTL index** reclaims storage, running roughly once a minute.
2. **Read filter** on every server read of clips requires `expiresAt` in the future, which
   closes the window where a clip has expired but has not yet been reaped.
3. **Write filter** refuses to create a clip whose recomputed expiry has already passed.
   This is what makes a device returning after months safe.

Tombstone collection comes free: when tombstoning a clip, set
`expiresAt = deletedAt + 30 days` and the same index reaps it. Nothing garbage-collects
tombstones anywhere in the app today, so this is the first entity that does.

## Blocking prerequisite: a data-loss bug

`initSync` runs its origin migration exactly once, keyed on the origin map being null.
Every existing install has already run it, so its map has **no `clips` key**.
`getLocalOrigin()` then returns an empty list for clips, `getAccountOnlyItems()` classifies
every local clip as account-origin, and **"sign out and clear this device" deletes every
clip the user owns**.

Fix with a second one-shot migration keyed on a new `originClipsMigrated` flag: if the
origin map lacks a `clips` key, fill it with every current local clip uid. This lands
before clips ever reach the sync engine.

While in there, replace the four hard-coded notes/plans/schedules maps in `sync.ts` with a
single `SYNC_KINDS` array and derive them, so the next entity cannot repeat the bug.

## Verify

Backdate a clip and confirm pinned survive and unpinned vanish. Insert one expiring in a
minute and confirm it disappears from responses immediately, then from Mongo within about a
minute. Replay a stale device by posting a sixty-day-old clip and confirm it is dropped.

---

# Phase 3 — The opt-in switch, and the copy that currently promises otherwise

## The gate

```
clipSyncActive = syncEnabled && clipSyncEnabled && signedIn
```

`syncEnabled` already exists and gates all sync; it stays the master and is already off by
default after login. `clipSyncEnabled` is new and also defaults off. When it is off,
`clips: []` and `deletedClipUids: []` go up, so the server is never told about the clips of
a user who has not opted in.

**The opt-in is per account, not per device.** `setSyncAccount()` must reset it whenever it
reports a switch, or account B silently inherits account A's consent.

## Where it lives

A Clipboard card in Settings, visible even when signed out so it can be explained, with a
permanent notice rather than a tooltip:

> Clips sync like your notes do. They are stored on our servers and are not end-to-end
> encrypted. Never clip passwords, card numbers, one-time codes, or anything you would not
> put in a note.

Turning it **on** offers two paths: upload the clips already on this device, or start fresh
from now. "Start fresh" is one meta key, `clipSyncFrom`, filtering the push by creation
time, rather than per-row bookkeeping.

Turning it **off** states the invariant first, that clips stay on this device either way,
then offers to stop syncing while keeping the server copies, or to stop and delete them
from the account.

## The honesty problem

Two places currently promise the opposite of what this ships.

- The Clips pane header reads "stays on this device, never synced".
- The 1.5.0 changelog says clips are never uploaded.

Leave the old changelog entry alone, since it was true then, and add a new entry naming the
change plainly. The existing What's New modal does the announcing.

---

# Phase 4 — Realtime, so the other device updates now

This infrastructure does not exist yet. `emitToUser` is called only for profile and theme
changes; **no note, plan or schedule mutation emits anything today**. A device that makes no
local edits will not pull remote changes until it restarts, reconnects, or the user taps
Sync now.

Two layers:

**`data:changed`**, the generic fix. Payload carries which kinds changed and the origin
device id. A receiving client whose id differs calls `requestSync()`, and the existing
debounce coalesces bursts. Five lines on the client, and it repairs the propagation gap for
notes and plans too.

**`clip:new`**, the fast path, carrying the full clip so the receiver applies it directly
with no sync round trip. This is what makes the clipboard feel immediate rather than
eventual.

The frontend event whitelist is hard-coded, so an event missing from that array is received
and silently dropped. Replace the array with a catch-all handler, which kills the bug class.

Echo suppression uses a `deviceId` stored once in the meta store. The same value doubles as
the "From LEAN-PC" label on captured clips.

---

# Phase 5 — The Tauri desktop shell

## Prerequisite

Install the Rust toolchain from rustup.rs. Nothing in Tauri builds without it. WebView2 is
already part of Windows 11, so that is the only thing missing on this machine.

## How you will open the app

During development:

```
npm run desktop:dev
```

opens a window that hot-reloads exactly like the web app.

For real use:

```
npm run desktop:build
```

produces an installer under `src-tauri/target/release/bundle/`. After installing, the app
lives in the Start Menu and runs from the system tray. **Closing the window must hide it,
not quit**, or the global hotkeys die the first time someone clicks the X.

## Layout

```
mah-notes-frontend/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/default.json
    src/
      main.rs        entry, plugins, tray, windows
      oauth.rs       loopback sign-in
      clipboard.rs   Alt+N            (Phase 6)
      hotkeys.rs                      (Phase 6)
      panel.rs       Alt+M            (Phase 7)
```

`tsconfig.json` includes only `src` and `vite.config.ts`, so the Rust project sits safely
outside it.

## Reusing the same React build

Tauri consumes `dist/` exactly as Capacitor does. One bundle, one component tree, no
duplication. Set `base: './'` for the desktop build only, so the web deploy is untouched.

With `hasLocalStore` from Phase 0, desktop takes the offline-first path: IndexedDB plus the
sync engine. `localdb.ts` is plain IndexedDB and works unchanged in a Tauri WebView.

## Google sign-in is the real blocker

The web flow redirects to Google with `redirect_uri = window.location.origin`, and a
`tauri://localhost` origin cannot be registered as a redirect URI.

Desktop needs a loopback flow: open the **system browser**, catch the code on
`http://127.0.0.1:<port>`, then hand `{ code, redirectUri }` to the existing sign-in call.
The backend already accepts that shape, so **no backend change** is needed, only a new
Authorized redirect URI in Google Cloud. Google permits loopback URIs for web clients, but
the exact port must be registered, so register two or three and bind the first free one.

Email and password sign-in works untouched, so ship that first and add Google after.

## CORS and share links

Tauri has no CapacitorHttp patch, so real CORS applies. The backend reads a comma-separated
`CLIENT_ORIGIN`, so adding the Tauri origin is an environment change on Render, not code.
Socket.io is covered by the same variable.

`VITE_PUBLIC_WEB_BASE` must be set for the desktop build, or share links become
`tauri://localhost/view?...` and look broken to whoever receives them.

## Desktop essentials that are not optional

- **Single instance**, so a second launch focuses the existing window. Without it the second
  instance fails to register the hotkeys and the app appears broken.
- **Autostart**, because a clipboard tool that is not running is useless.
- **Tray icon and close-to-tray.**
- **Window state**, remembering size and position.

## Packaging

A `release-desktop.yml` workflow beside the existing APK one, on `windows-latest`, attaching
the installer to the same GitHub Release.

Code signing is a real cost and a real decision. An unsigned binary that registers a global
hotkey, synthesises keystrokes and reads the clipboard has the exact behavioural profile of
a keylogger. SmartScreen will warn, and some antivirus will quarantine.

The in-app updater is Android-only and looks for an `.apk` asset. Either extend it to pick
assets per platform, or skip self-update in v1.

---

## Risks, ranked

**Existing installs lose every clip** on "sign out and clear this device" unless the
`originClipsMigrated` fix ships with the first release that touches clip sync. Highest
severity, because it destroys user data silently.

**Unbounded history through a full-dump protocol.** Addressed by making clips a delta from
day one, backed by the 500-clip cap, the text cap, and thirty-day retention.

**Trust regression.** The app currently promises in two places that clips never sync. The
new changelog entry, the revised pane copy and the Settings notice must ship in the same
release as the switch.

**Two windows writing one IndexedDB.** The panel and the main window share a database with
no cross-window transaction. Only the main window runs the sync engine, and clips never go
through `replaceAll`, which is a second reason for the delta design.

**Antivirus and SmartScreen.** Sign the binary, and use a registered hotkey rather than a
low-level keyboard hook.

**Clock skew** breaks both deterministic expiry and last-write-wins. Clamped server-side.

---

## A note on phases 6 and 7

They are outside the range you asked for, but they are what the desktop app is *for*, so in
one line each: `Alt+N` tries UI Automation first and falls back to snapshotting the
clipboard, releasing the modifiers the user is physically holding, synthesising a copy,
watching the clipboard sequence number to tell "nothing selected" from a real selection, and
restoring the snapshot. `Alt+M` is a separate always-on-top window that records the previous
foreground window *before* it appears, then pastes back into it.
