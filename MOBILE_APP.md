# Mah Notes — Android App (Capacitor)

This frontend is wrapped with [Capacitor](https://capacitorjs.com/) so it can be
built into an Android **APK** in Android Studio. The app is the same React/Vite
web app running inside a native WebView; it talks to the **same Render backend**
(`https://mah-notes-backend.onrender.com`) over HTTPS.

## How it's wired

- **`capacitor.config.json`** — app id `com.mahnotes.app`, name "Mah Notes",
  web assets come from `dist/`.
- **`android/`** — the generated native Gradle project you open in Android Studio.
- **Backend URL** — comes from `VITE_API_BASE` in `.env`, already set to the
  Render URL. The web bundle bakes this in at build time.
- **No CORS changes needed** — `CapacitorHttp` is enabled, so on the device
  `fetch()` goes through the native HTTP layer (not a browser origin), bypassing
  CORS. (`https://localhost` was also added to the backend `CLIENT_ORIGIN` as a
  fallback.)

## Requirements (one-time)

1. **Android Studio** (latest). It bundles the right JDK (17) and SDK.
2. **Node 22+** in your terminal (the Capacitor CLI requires it).

## Build the APK

From the **frontend repo root**, build the web app and copy it into the native project:

```bash
npm run android:sync     # = vite build && cap sync android
```

Then open the project in Android Studio:

```bash
npm run android:open     # = cap open android
```

(Or in Android Studio: **Open** → select the `android/` folder.)

In Android Studio:

1. Wait for the initial **Gradle sync** to finish (it creates `local.properties`
   and downloads the SDK if needed — first run can take a few minutes).
2. **Run on a device/emulator:** press ▶ Run.
3. **Get an installable APK:** menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
   The debug APK lands at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
   Copy that to a phone and install it (enable "Install unknown apps").

### Signed release APK (for sharing / Play Store)

**Build → Generate Signed Bundle / APK → APK →** create a new keystore (keep the
`.jks` file + passwords safe) → **release** → Finish. Output:
```
android/app/build/outputs/apk/release/app-release.apk
```

## After you change the web app

Anytime you edit React/CSS, re-sync before rebuilding in Android Studio:

```bash
npm run android:sync
```

## Google Sign-In inside the APK (native)

Native Google Sign-In is wired up with **`@capgo/capacitor-social-login`**. On a
device the app shows a "Continue with Google" button that opens the **native**
Google account picker (the web `@react-oauth/google` button is hidden on native,
since Google blocks OAuth inside WebViews). The plugin returns a Google **ID
token**, which the backend's existing `/api/auth/google` route verifies — so **no
backend change is needed**.

Code involved:
- `src/lib/nativeAuth.js` — initializes the plugin with the **web** client ID and
  performs the native sign-in.
- `src/components/AuthScreen.jsx` — renders the native button on device, the web
  button in browsers (via `Capacitor.isNativePlatform()`).
- `capacitor.config.json` — `SocialLogin` provider config (only Google bundled).

### ⚠️ One-time Google Cloud setup (required for it to work)

The native flow needs an **Android OAuth client** registered with your app's
package name and signing fingerprint. Without it, sign-in fails on the device.

1. **Get your signing SHA-1.** For the debug build (what Android Studio installs
   while testing), from the `android/` folder run:
   ```bash
   ./gradlew signingReport
   ```
   …and copy the **SHA1** under `Variant: debug`. (Windows debug keystore lives at
   `%USERPROFILE%\.android\debug.keystore`.) For a **release** APK, use the SHA-1
   of your release keystore instead (add both while testing).

2. **Create the Android OAuth client.** Google Cloud Console → **APIs & Services
   → Credentials → Create Credentials → OAuth client ID** →
   - Application type: **Android**
   - Package name: **`com.mahnotes.app`**
   - SHA-1: *(paste from step 1)*

   You do **not** put this Android client ID anywhere in code — its only job is to
   let Google trust your app. The app keeps using the existing **Web** client ID
   (`VITE_GOOGLE_CLIENT_ID`) as the `webClientId`, so the ID token's audience still
   matches what the backend verifies.

3. **Publish/scope check.** Make sure the OAuth consent screen has the `email` and
   `profile` scopes (it does for the web app already) and that your Google account
   is a test user (or the app is published).

> Email/password login needs none of this and works on the device immediately.

## App icon & splash

Already generated from `assets/logo.png` (the Mah Notes feather) into every
Android density — launcher icons, round icons, adaptive icons, and light/dark
splash screens. To change the artwork, replace `assets/logo.png` (≥ 1024×1024)
and regenerate:

```bash
npx capacitor-assets generate --android \
  --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#0f1115' \
  --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#0f1115'
```
