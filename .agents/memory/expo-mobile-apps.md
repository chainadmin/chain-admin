---
name: Expo mobile apps (mobile-app + mobile-agency-app)
description: Build/submission gotchas for the two Expo apps — native module version pinning, EAS lockfile, privacy manifest
---

# Expo mobile apps

Two separate Expo apps in the repo, two separate store listings:
- `mobile-app/` — consumer WebView wrapper, bundle id `com.chainsoftware.platform`
- `mobile-agency-app/` — native agency app, bundle id `com.chainsoftware.agency`

They cannot be built/installed in the Replit container (no simulators, npm install is
blocked for subfolders). EAS Build on Expo's cloud is the only build path; `package.json`
is the source of truth.

## Native module versions MUST match the Expo SDK, or the app crashes instantly

**Rule:** every React-Native native module (safe-area-context, screens, gesture-handler,
svg, webview, async-storage, all `expo-*`) must match the version the installed Expo SDK
expects. A mismatch causes an immediate crash on launch on BOTH iOS and Android — no error
screen, just dies.

**Why:** native modules ship compiled code that must match the RN/SDK ABI. Pinning a
version from a previous SDK (e.g. `react-native-safe-area-context@5.4.0` while on SDK 54,
which wants `~5.6.0`) crashes at startup. This actually happened after a hand-added dep.

**How to apply:**
- Authoritative expected versions for an SDK: `https://unpkg.com/expo@<version>/bundledNativeModules.json`
  (e.g. fetch and grep the module name).
- The canonical fix is to run `npx expo install --fix` in the app folder before building —
  it rewrites every dep to the SDK-correct version. Always recommend this after any manual
  dependency change.
- When adding/bumping a native module by hand, look it up in bundledNativeModules.json
  first; don't guess.

## EAS requires a committed lockfile

EAS Build fails with "No lockfile found" unless `package-lock.json` exists. We don't keep
it committed; run `npm install` in the app folder to regenerate it before building (or set
`EAS_BUILD_SKIP_LOCKFILE_CHECK=1` to bypass, not recommended).

## iOS privacy manifest is mandatory

Both apps store auth tokens via SecureStore (UserDefaults API) → Apple auto-rejects uploads
without a privacy manifest. Each app needs BOTH `ios.privacyManifests` in `app.json` AND a
`PrivacyInfo.xcprivacy` file. Standard reason codes used: UserDefaults CA92.1,
FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1.

## Android biometric permissions

Use only `["USE_BIOMETRIC", "USE_FINGERPRINT"]` — do NOT also list the
`android.permission.*`-prefixed duplicates; Google Play flags them.

## Agency app needs `eas init`

`mobile-agency-app/app.json` `extra.eas.projectId` must be filled (run `eas init` once);
an empty string fails the build.
