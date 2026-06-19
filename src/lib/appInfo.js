// ============================================================
//  App version + changelog — the single source of truth for the
//  "What's new" screen AND the GitHub-release update check.
//
//  On every release: bump APP_VERSION here, bump android
//  versionName/versionCode in android/app/build.gradle to match,
//  and add a new entry to the TOP of CHANGELOG.
// ============================================================
export const APP_VERSION = '1.2.0';

// Newest first. `version` must match the GitHub release tag (minus any
// leading "v") so the updater can compare "installed vs latest".
export const CHANGELOG = [
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
