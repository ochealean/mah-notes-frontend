// ============================================================
//  Bridge to the native "Widget" plugin (com.mahnotes.app.WidgetPlugin).
//  setData(json)        → mirror the widget data into SharedPreferences and
//                         refresh every home-screen widget.
//  consumeOpenTarget()  → read + clear the item a tapped widget asked to open.
//  No-ops on the web (registerPlugin returns a stub that just rejects).
// ============================================================
import { registerPlugin } from '@capacitor/core';

// Typed loosely — its real surface lives in Android/Java.
const Widget: any = registerPlugin('Widget');
export default Widget;
