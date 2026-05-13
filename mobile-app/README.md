# Chain Consumer Mobile App

Native Expo wrapper around the Chain consumer portal. WebView-based with native
biometric login, haptics, and secure token storage.

- Bundle ID: `com.chainsoftware.platform`
- Backend: `https://chain-admin-production.up.railway.app`
- Audience: end consumers paying their accounts

## Run locally

```bash
cd mobile-app
npm install        # regenerates package-lock.json on first install
npm run ios        # or: npm run android
```

The Replit container has no iOS / Android simulators. Run the commands above
from a Mac (Xcode) or a machine with Android Studio. Or use Expo Go on a
physical device with `npx expo start --tunnel`.

> **Lockfile note:** `package-lock.json` is intentionally not committed in this
> repo — EAS Build (and local installs) regenerates it from `package.json` on
> every install, which is the standard Expo workflow. If your release pipeline
> requires a committed lockfile for reproducibility, run `npm install` here
> once and commit the resulting `package-lock.json`.

## Pre-submission checklist

Run through this every time before uploading to the App Store / Play Store.

### Both stores
- [ ] Bump `expo.version` in `app.json` (e.g. `1.1.2` → `1.1.3`)
- [ ] Bump `ios.buildNumber` and `android.versionCode` (must be strictly higher than the last submitted build)
- [ ] Confirm `mobile-app/` builds cleanly: `npm install && npx expo prebuild --clean` (optional sanity check on a Mac)
- [ ] Test on a real device:
  - [ ] App launches without a white flash (splash → login)
  - [ ] If backend is unreachable, error card with "Try again" appears (toggle airplane mode to test)
  - [ ] Face ID / Touch ID prompt appears for returning users
  - [ ] After login, `/consumer/dashboard` loads and stays put on rotation
  - [ ] Logout fully clears saved credentials
- [ ] No `console.error` output on launch in Metro

### iOS — App Store Connect
- [ ] EAS build: `npm run build:ios` (uses `production` profile in `eas.json`)
- [ ] Privacy manifest ships: `mobile-app/PrivacyInfo.xcprivacy` (declares no tracking, only required RN APIs)
- [ ] In App Store Connect → App Privacy:
  - **Data Types Collected:** None (we don't collect personal data; the WebView fetches per-session)
  - **Tracking:** No
  - **Third-Party SDK Collection:** None
- [ ] Encryption: `ITSAppUsesNonExemptEncryption = false` (HTTPS only, standard)
- [ ] Face ID usage: `NSFaceIDUsageDescription` present in `infoPlist`
- [ ] No App Tracking Transparency (ATT) prompt is required because we don't use IDFA / track across apps

### Android — Play Console
- [ ] EAS build: `npm run build:android` (produces an `.aab` for upload)
- [ ] Data Safety form:
  - **Data collected:** None
  - **Data shared:** None
  - **Security practices:** Data encrypted in transit (yes — HTTPS only)
- [ ] Permissions in `app.json` are exactly: `USE_BIOMETRIC`, `USE_FINGERPRINT` (no duplicates)
- [ ] Target SDK is current (Expo SDK 54 handles this automatically)

## Architecture

- `App.js` — single `WebView` pointed at `${API_BASE_URL}/consumer/login` wrapped in a `loading | ok | error` state machine. Shows a friendly "Couldn't reach Chain → Try again" card if the page fails to load within 15s, errors, or returns a 5xx.
- `client/src/lib/expo-bridge.ts` (in the main app) — web-side bridge that calls into native via `window.ReactNativeWebView.postMessage` and listens to `MessageEvent` for native → web responses.
- Splash is held by `SplashScreen.preventAutoHideAsync()` and only hidden after the biometric check resolves, so users never see a flash of white.
- Notch / Dynamic Island handled by `react-native-safe-area-context`.
- Native → web messaging uses `injectJavaScript` (current API) instead of the deprecated `webViewRef.postMessage`.

## What this app does NOT include

- No backend code (it's a thin native client)
- No agency/staff features (those live in `mobile-agency-app/`)
- No App Store In-App Purchases — wallet top-ups are handled by the existing web checkout opened inside the WebView
