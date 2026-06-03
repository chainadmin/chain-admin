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

## #1 immediate-crash cause: root component never registered

**Rule:** the entry that `package.json` `main` points to MUST call
`registerRootComponent(App)` (from `expo`). The canonical setup is `main: "index.js"`
with `index.js` = `import { registerRootComponent } from 'expo'; import App from './App'; registerRootComponent(App);`.

**Why:** if `main` points straight at `App.js`/`App.tsx` and that file only
`export default`s the component (no `registerRootComponent`, no `index.js`, no
`expo-router`), the JS bundle loads but nothing is registered with RN's AppRegistry, so
there is no root view to render → instant crash on launch, BOTH platforms, regardless of
arch/deps. `node_modules/expo/AppEntry.js` shows the required pattern (it imports
`../../App` and registers it).

**How to apply:** when an Expo app crashes instantly, FIRST check `main` and grep the repo
for `registerRootComponent` / `AppRegistry`. If neither exists, that's the bug.

## Metro export caches and can hide a NEW syntax error

A clean `npx expo export` is NOT proof the current source compiles — Metro reuses a cached
bundle (watch for an identical output `.hbc` hash across runs). Always pass `--clear` to
force a real recompile. Changing the entry point also busts the cache. A cached bundle can
hide a broken edit (e.g. a `try` with mangled braces / undeclared var) until `--clear`.

## Do NOT force the OLD architecture off in SDK 54 — it crashes on launch

**Rule:** leave the New Architecture enabled (the SDK 54 default). Do NOT set
`newArchEnabled: false` in `app.json` (`ios`/`android`) or in the
`expo-build-properties` plugin.

**Why:** SDK 54 / RN 0.81 default to the New Architecture, and the libraries these
apps use — especially `react-native-safe-area-context` v5, which wraps the whole app
via `SafeAreaProvider` at the root — are built/tested for the New Architecture.
Forcing old-arch makes that root native view fail to instantiate, so the app dies the
instant it launches, on BOTH iOS and Android. The combination that works is
*new-arch + SDK-matched deps*.

**How to apply:** if an app crashes immediately with clean deps and a clean JS bundle,
check for `newArchEnabled: false` first and flip it to `true` (all three places). A
clean `npx expo export` proves the JS/bundle is fine and points the finger at native
config like this.

## Diagnosing an immediate crash without device logs

`npx expo export --platform ios` (node_modules must be installed in the app folder)
runs the full Metro graph + Hermes compile. If it succeeds, JS/imports/syntax are NOT
the cause — the crash is native (arch flag, native module version, or config). This is
the fastest way to split JS-vs-native blame from inside Replit (no simulator needed).

## Native module versions MUST match the Expo SDK, or the app crashes instantly

**Rule:** every React-Native native module (safe-area-context, screens, gesture-handler,
svg, webview, async-storage, all `expo-*`) must match the version the installed Expo SDK
expects. A mismatch causes an immediate crash on launch on BOTH iOS and Android — no error
screen, just dies.

**Why:** native modules ship compiled code that must match the RN/SDK ABI. Pinning a
version from a previous SDK (e.g. `react-native-safe-area-context@5.4.0` while on SDK 54,
which wants `~5.6.0`) crashes at startup.

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
