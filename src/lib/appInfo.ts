// ============================================================
//  App version + changelog — the single source of truth for the
//  "What's new" screen AND the GitHub-release update check.
//
//  On every release: bump APP_VERSION here, bump android
//  versionName/versionCode in android/app/build.gradle to match,
//  and add a new entry to the TOP of CHANGELOG.
// ============================================================
export const APP_VERSION = '2.0.0';

// Newest first. `version` must match the GitHub release tag (minus any
// leading "v") so the updater can compare "installed vs latest".
export const CHANGELOG = [
  {
    version: '2.0.0',
    date: '2026-09-09',
    title: 'Mah Notes 2.0 — a complete redesign',
    changes: [
      'A whole new look: paper, ink and one accent colour, with square edges and a single typeface. Nothing shouts for attention any more.',
      'On a computer the app is now two panes — your list on the left, whatever you’re reading on the right — instead of a wall of cards.',
      'The View tab is gone. Opening a document or plan already shows it in full, so there is nothing left to “view” separately. Links you have already shared still work exactly as before.',
      'Every card’s row of buttons is gone. Edit, pin, hide, share and delete now appear once, next to the thing you are actually reading.',
      'Import a note with AI and Build a weekly plan with AI moved into the ⋯ menu at the top, along with Delete all — so the list holds your notes and nothing else. Scanning a timetable stays on the Time tab.',
      'Appearance is simpler: pick one accent colour (or any colour you like) instead of setting seven at once. The drifting background can be switched off.',
      'On your phone, tapping a document opens it in place, and Back returns you to the list.',
      'Dark mode has been rebuilt to match.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-30',
    title: 'Clip text from any app',
    changes: [
      'Highlight text in any app on your phone and tap “Mah Notes” in the copy/paste bar — it’s saved instantly, without leaving what you were reading. (If you don’t see it, check the ⋮ menu in that bar.)',
      'New Clipboard tab holds everything you’ve clipped, with the app it came from and when.',
      'Copy any clip back to your clipboard — it then shows up in your keyboard’s clipboard panel too.',
      'Turn a clip into a real document with one tap.',
      'The copy/paste bar also gets a “Mah Notes Clipboard” entry: select some text, pick a saved clip, and it replaces the selection.',
      'Clips stay on your phone — they aren’t uploaded or synced.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-29',
    title: 'Password reset, account controls & clickable links',
    changes: [
      'Forgot your password? You can now reset it by email instead of losing the account.',
      'Delete your account from Settings, whenever you want to.',
      'Account Info is now collapsible, and changing your password, username, or connecting Google opens in its own popup instead of expanding the page.',
      'Add a username to sign in with instead of your email — it now shows in Settings once set.',
      'Signing up warns you to double-check your email address, since it’s the only way to get a password-reset link.',
      'Links in documents are now clickable, and the editor has a button to turn selected text into a link.',
      'Settings → About & updates has a “Get the Android app” button — download the latest APK or browse past versions.',
      'Signing in with Google now shows a “Signing you in…” screen instead of silently sitting on the login page while it finishes.',
      'Faster loading after signing in — your notes, plans, and schedule load in one wave, and a returning visit no longer waits on a server round trip before showing your account.',
    ],
  },
  {
    version: '1.3.5',
    date: '2026-08-25',
    title: 'Editor: indent, text size, and checklist fixes',
    changes: [
      'Added indent/outdent buttons to the document editor toolbar.',
      'Replaced the Heading 1/2 and eraser buttons with a text-size input.',
      'Fixed Backspace next to a checklist box sometimes deleting the line instead of the checkbox.',
      'Indent and text size now carry over correctly when converting a line to a checklist item or adding a new checklist row.',
    ],
  },
  {
    version: '1.3.4',
    date: '2026-06-30',
    title: 'Sort your lists + widget fix',
    changes: [
      'Sort Documents and Plans by recently updated, recently created, or title (A–Z / Z–A) — your choice is remembered per list.',
      'Fixed the home-screen widget picker sometimes missing your most recently created note or plan.',
      'Added gentle rate limits so rapid or heavy use (AI, sign-in, saving) stays smooth and reliable.',
    ],
  },
  {
    version: '1.3.3',
    date: '2026-06-25',
    title: 'Widget rolls over at midnight',
    changes: [
      'Plan and schedule widgets now switch to the new day automatically at midnight — no need to open the app first.',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-06-24',
    title: 'Widget: scroll & tick',
    changes: [
      'The home-screen widget now scrolls when an item has more rows than fit.',
      'Tap a checkbox right on the widget to tick it off — it saves to your note or plan instead of opening the app.',
      'A plan widget now shows today’s weekday in its title (e.g. “Leg Day · Monday”).',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-06-22',
    title: 'Widget fix',
    changes: [
      'Fixed the home-screen widget showing “Can’t load widget” — it now renders your chosen note, plan, or today’s schedule properly.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-21',
    title: 'Home-screen widget',
    changes: [
      'New Android home-screen widget — add it from your launcher and pick what it shows: a note, today’s plan, or today’s schedule.',
      'Plans and Schedule widgets always show the current day automatically.',
      'Long-press the widget to resize it; tap it to open that item in the app.',
    ],
  },
  {
    version: '1.2.9',
    date: '2026-06-21',
    title: 'Better color picker',
    changes: [
      'The color theme picker now opens a full saturation + hue picker with hex and R/G/B inputs, right inside the app (matching the website).',
      'The Color theme section is collapsible — tap to expand or hide it.',
    ],
  },
  {
    version: '1.2.8',
    date: '2026-06-21',
    title: 'Themes, new logo & more',
    changes: [
      'Customize your colors: pick a preset (Coffee, Ocean, Forest…) or set your own Primary & Accent colors with gradients (Settings → Appearance).',
      'Fresh app logo throughout.',
      'Connect your account to Google, import notes by pasting text or a photo in Docs, and build weekly plans with AI in Plans.',
      'Tapping the checklist button now turns the current line into a checklist item instead of pushing your text to a new line.',
      'Docs import can read a photo of a note and tidy it with AI.',
      'Removed the light/dark toggle from the top bar — it lives in Settings.',
    ],
  },
  {
    version: '1.2.7',
    date: '2026-06-20',
    title: 'Checklist & signup fixes',
    changes: [
      'Adding a checklist at the start of a line now places it above your text, not after it.',
      'Email/password signup now warns that there’s no password reset — a forgotten password can’t be recovered.',
    ],
  },
  {
    version: '1.2.6',
    date: '2026-06-20',
    title: 'Fix: connect to the live server',
    changes: [
      'Fixed sync and Friends failing on auto-built releases (they were pointing at localhost instead of the live server).',
    ],
  },
  {
    version: '1.2.5',
    date: '2026-06-20',
    title: 'Quieter update reminders',
    changes: [
      'The update prompt now appears once, with a “Don’t remind me again” option.',
      'After that, a red dot on Settings → Check for updates is your reminder — no more pop-up on every launch.',
    ],
  },
  {
    version: '1.2.4',
    date: '2026-06-20',
    title: 'Update test',
    changes: [
      'A newer build to try the update flow end-to-end.',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-06-20',
    title: 'More reliable updates',
    changes: [
      'Update now has a dependable “Download in browser” option that always works.',
      'If the seamless in-app install can’t run, the app now tells you why.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-06-20',
    title: 'In-app updates',
    changes: [
      'Updates now download and install inside the app — no more bouncing out to the browser.',
      'New releases are published automatically, so updates arrive faster.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-06-19',
    title: 'Update check test build',
    changes: [
      'Verifies the new in-app update flow end-to-end.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-19',
    title: 'Drafts, What’s New & in-app updates',
    changes: [
      'Drafts: an unsaved document now auto-saves as you type — close the app mid-sentence and your text is waiting when you come back.',
      'What’s New: this screen! See what changed after every update (Settings → What’s new).',
      'Updates: the app can check for a newer version and update itself — only with your permission (Settings → Updates).',
      'Fixed the View page layout on desktop, and the AI schedule scan now retries automatically when the AI is busy.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-16',
    title: 'Schedule sync, pinning & more',
    changes: [
      'Schedule now syncs across the web and the app, like Documents and Plans.',
      'Pin documents to keep them at the top.',
      'The eye icon fully hides a card’s body, and you can delete a whole list or schedule group at once.',
    ],
  },
];
