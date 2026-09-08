// ============================================================
//  Bridge to the native "Clips" plugin (com.mahnotes.app.ClipboardPlugin).
//  consumePending()      → read + clear text captured from the selection toolbar.
//  setSnapshot(json)     → mirror the clip list for the native paste picker.
//  copyToSystem(text)    → put a clip on the system clipboard (feeds Gboard).
//  No-ops on the web (registerPlugin returns a stub that just rejects).
// ============================================================
import { registerPlugin } from '@capacitor/core';

// Typed loosely — its real surface lives in Android/Java.
const Clips: any = registerPlugin('Clips');
export default Clips;
