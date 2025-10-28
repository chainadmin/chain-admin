# Expo EAS Build Setup Guide for Chain Platform

## Current Status

Your project has **Capacitor native directories** (`android/` and `ios/`), which means EAS Build will use the native projects instead of managed Expo builds.

**Package Name:** `com.chaincomms.platform`

---

## Step-by-Step Setup

### 1. Install EAS CLI (if not already installed)

```bash
npm install -g eas-cli
```

### 2. Login to Expo

```bash
eas login
```

Enter your Expo account credentials.

### 3. Link Project to Expo

```bash
eas build:configure
```

This creates the necessary configuration files.

### 4. Generate Keystore Interactively (REQUIRED FIRST TIME)

The error you're seeing happens because you can't generate a keystore in non-interactive mode. **You must run an interactive build first:**

```bash
eas build --platform android --profile production
```

**When prompted:**
- ✅ Select "Generate new keystore"
- ✅ EAS will create and securely store it on their servers

**This will:**
- Generate a new Android keystore for `com.chaincomms.platform`
- Upload it to EAS servers
- Build your APK/AAB

---

## Alternative: Use Existing Keystore (If You Have One)

If you have an existing keystore from a previous build:

### Option A: Upload via EAS Credentials

```bash
eas credentials
```

Then:
1. Select **Android**
2. Select **Keystore: Manage everything related to your Keystore**
3. Select **Upload**
4. Provide your keystore file, passwords, and alias

### Option B: Use Local Keystore File

1. **Update `eas.json`:**

```json
{
  "build": {
    "production": {
      "android": {
        "credentialsSource": "local",
        "buildType": "app-bundle",
        "gradleCommand": ":app:bundleRelease",
        "resourceClass": "medium"
      }
    }
  }
}
```

2. **Create `credentials.json` at project root:**

```json
{
  "android": {
    "keystore": {
      "keystorePath": "android/keystores/release.keystore",
      "keystorePassword": "YOUR_KEYSTORE_PASSWORD",
      "keyAlias": "YOUR_KEY_ALIAS",
      "keyPassword": "YOUR_KEY_PASSWORD"
    }
  }
}
```

3. **Place keystore in `android/keystores/`:**

```bash
mkdir -p android/keystores
# Copy your keystore file here
cp /path/to/your/release.keystore android/keystores/
```

4. **Add to `.gitignore`:**

```gitignore
android/keystores/
credentials.json
```

---

## Recommended Configuration

Update your `eas.json` to use **remote credentials** (easiest):

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true,
        "buildConfiguration": "Debug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "VITE_API_URL": "https://chain-admin-production.up.railway.app"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle",
        "gradleCommand": ":app:bundleRelease",
        "resourceClass": "medium",
        "credentialsSource": "remote"
      },
      "ios": {
        "buildConfiguration": "Release",
        "resourceClass": "medium",
        "scheme": "App"
      },
      "env": {
        "VITE_API_URL": "https://chain-admin-production.up.railway.app",
        "ADMIN_BASE_URL": "https://chain-admin-production.up.railway.app"
      }
    }
  }
}
```

---

## Build Commands

### For Development (APK for testing)

```bash
eas build --platform android --profile development
```

### For Preview (Internal testing APK)

```bash
eas build --platform android --profile preview
```

### For Production (App Bundle for Play Store)

```bash
eas build --platform android --profile production
```

### For iOS

```bash
eas build --platform ios --profile production
```

---

## Troubleshooting

### Error: "Generating a new Keystore is not supported in --non-interactive mode"

**Solution:** Run the build **without** `--non-interactive` flag first:

```bash
eas build --platform android --profile production
```

This lets you interactively generate the keystore.

### Error: "android.package in app.json is ignored"

**This is normal!** When you have an `android/` directory, EAS uses the package name from:
- `android/app/build.gradle` (look for `applicationId`)

Your `app.json` package name is ignored. Make sure they match:

**In `android/app/build.gradle`:**
```gradle
android {
    defaultConfig {
        applicationId "com.chaincomms.platform"
        // ...
    }
}
```

### Build Succeeds But App Doesn't Install

**Possible causes:**
1. Package name conflict with existing app
2. Signing certificate mismatch
3. Version code conflict

**Solution:**
- Uninstall any existing version first
- Use a fresh device/emulator
- Check version codes are incrementing

---

## After First Successful Build

Once you've generated credentials interactively, future builds can use `--non-interactive`:

```bash
eas build --platform android --profile production --non-interactive
```

---

## CI/CD Setup (After Initial Setup)

For automated builds in CI:

1. **Generate Expo access token:**
   ```bash
   eas auth:token
   ```

2. **Add to CI environment variables:**
   ```
   EXPO_TOKEN=<your-token>
   ```

3. **Run in CI:**
   ```bash
   npx eas-cli build --platform android --profile production --non-interactive --no-wait
   ```

---

## Capacitor-Specific Notes

Since you're using Capacitor:

1. **Build web assets first:**
   ```bash
   npm run build
   ```

2. **Sync with Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Then run EAS build:**
   ```bash
   eas build --platform android --profile production
   ```

---

## Quick Start Checklist

- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Login: `eas login`
- [ ] Configure: `eas build:configure`
- [ ] Verify package name matches in `app.json` and `android/app/build.gradle`
- [ ] Run first interactive build: `eas build --platform android --profile production`
- [ ] Select "Generate new keystore" when prompted
- [ ] Wait for build to complete
- [ ] Download and install APK/AAB
- [ ] Future builds can use `--non-interactive`

---

## Support & Resources

- **EAS Build Docs:** https://docs.expo.dev/build/setup/
- **Capacitor + Expo:** https://capacitorjs.com/docs/guides/expo
- **Check build status:** https://expo.dev/accounts/[your-account]/projects/chain/builds

---

## Current Configuration

✅ Package: `com.chaincomms.platform`
✅ Capacitor: Installed with Android/iOS
✅ EAS Config: Present in `eas.json`
✅ API URL: `https://chain-admin-production.up.railway.app`

**Next Step:** Run the interactive build command to generate your keystore!
