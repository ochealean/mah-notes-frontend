// ============================================================
//  App version + changelog — the single source of truth for the
//  "What's new" screen AND the GitHub-release update check.
//
//  On every release: bump APP_VERSION here, bump android
//  versionName/versionCode in android/app/build.gradle to match,
//  and add a new entry to the TOP of CHANGELOG.
// ============================================================
export const APP_VERSION = '1.2.8';

// Newest first. `version` must match the GitHub release tag (minus any
// leading "v") so the updater can compare "installed vs latest".
export const CHANGELOG = [
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
