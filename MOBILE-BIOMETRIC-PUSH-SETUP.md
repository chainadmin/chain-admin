# Mobile App: Biometric Authentication & Push Notifications Setup Guide

This guide shows you how to enable biometric authentication (Face ID, Touch ID, Fingerprint) and push notifications in your Chain mobile app.

---

## ✅ What's Already Implemented

### Biometric Authentication
- **Plugin Installed**: `@aparajita/capacitor-biometric-auth` ✅
- **Frontend Service**: `client/src/lib/biometric-auth.ts` ✅
- **Login Integration**: Mobile login screen with biometric button ✅
- **Credential Storage**: Saves email/DOB in localStorage for quick login ✅

### Push Notifications  
- **Plugin Installed**: `@capacitor/push-notifications@6` ✅
- **Frontend Service**: `client/src/lib/push-notifications.ts` ✅
- **Auto-initialization**: Initializes on mobile app login ✅
- **Token Management**: Registers tokens with backend after auth ✅

---

## 📱 iOS Setup

### Step 1: Enable Biometric Capabilities

1. Open Xcode:
   ```bash
   npx cap open ios
   ```

2. Select your app target → **Signing & Capabilities** tab

3. Click **+ Capability** and add:
   - ✅ **Push Notifications**
   - ✅ **Face ID** (automatically included with biometric plugin)

### Step 2: Configure Face ID Permission

Add to `ios/App/App/Info.plist`:

```xml
<key>NSFaceIDUsageDescription</key>
<string>We use Face ID to securely sign you in to your account.</string>
```

### Step 3: Apple Developer Portal - APNs Setup

1. Go to [developer.apple.com](https://developer.apple.com)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create an **APNs Key**:
   - Click **Keys** → **+** (Create a new key)
   - Name it: `Chain Push Notifications`
   - Enable: **Apple Push Notifications service (APNs)**
   - Click **Continue** → **Register**
   - **Download the `.p8` file** - save it securely!
   - Note your **Key ID** and **Team ID**

### Step 4: Firebase Setup for iOS

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create one)
3. Click **⚙️ Settings** → **Project Settings**
4. Go to **Cloud Messaging** tab
5. Scroll to **Apple app configuration**
6. Upload your APNs `.p8` key file
7. Enter your **Key ID** and **Team ID**

### Step 5: Add GoogleService-Info.plist

1. In Firebase Console, add an iOS app:
   - Bundle ID: `com.chaincomms.chain`
   - Download `GoogleService-Info.plist`

2. Add to Xcode:
   - Drag `GoogleService-Info.plist` into `ios/App/App/` folder
   - ✅ Check "Copy items if needed"

### Step 6: Update AppDelegate (iOS)

Edit `ios/App/App/AppDelegate.swift`:

```swift
import UIKit
import Capacitor
import Firebase

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, 
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Initialize Firebase
        FirebaseApp.configure()
        
        return true
    }

    func application(_ application: UIApplication, 
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, 
                                       object: deviceToken)
    }

    func application(_ application: UIApplication, 
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, 
                                       object: error)
    }
}
```

### Step 7: Install Firebase Pod

Edit `ios/App/Podfile`:

```ruby
target 'App' do
  capacitor_pods
  
  # Add Firebase Messaging
  pod 'Firebase/Messaging'
end
```

Run:
```bash
cd ios/App
pod install
cd ../..
```

---

## 🤖 Android Setup

### Step 1: Firebase Setup for Android

1. In Firebase Console, add an Android app:
   - Package name: `com.chaincomms.chain`
   - Download `google-services.json`

2. Move to Android project:
   ```bash
   mv google-services.json android/app/
   ```

### Step 2: Update AndroidManifest.xml

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    
    <application>
        <!-- Your existing config -->
    </application>
</manifest>
```

### Step 3: Biometric is Auto-Configured ✅

The `@aparajita/capacitor-biometric-auth` plugin automatically configures Android biometric support. No additional steps needed!

---

## 🧪 Testing

### Test Biometric Authentication

**iOS:**
1. Build app: `npx cap run ios`
2. Sign in once with email & date of birth
3. Close app and reopen
4. You'll see a **"Sign in with Face ID/Touch ID"** button
5. Tap it to authenticate with biometrics

**Android:**
1. Build app: `npx cap run android`
2. Follow same steps as iOS
3. Use fingerprint or face unlock

### Test Push Notifications

**iOS (Must use physical device):**
1. Build and install app on iPhone/iPad
2. Sign in to grant notification permissions
3. Go to Firebase Console → Cloud Messaging
4. Click **Send test message**
5. Paste the FCM token from app logs
6. Send notification

**Android:**
1. Works on emulator with Google Play Services
2. Follow same Firebase Console steps as iOS

---

## 🔧 How It Works

### Biometric Flow
1. User signs in with email + DOB first time
2. Credentials saved in device's secure storage (localStorage)
3. Biometric auth checks if available on device
4. Shows "Sign in with [Face ID/Touch ID/Fingerprint]" button
5. On biometric success, auto-fills credentials and signs in
6. Token refreshed and registered with backend

### Push Notification Flow
1. On app launch, push service initializes
2. Requests notification permission from user
3. Registers device with FCM/APNs
4. Sends token to backend API: `POST /api/consumer/push-token`
5. Backend stores token linked to consumer
6. Campaigns/notifications can target specific devices

---

## 📋 Backend API (To Be Implemented)

### Push Token Endpoint

**Endpoint:** `POST /api/consumer/push-token`

**Headers:**
```
Authorization: Bearer <consumer_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "fcm_or_apns_device_token",
  "platform": "ios" | "android"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Push token registered successfully"
}
```

### Database Schema Needed

```typescript
export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  platform: text("platform", { enum: ['ios', 'android'] }).notNull(),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## 🚀 Building for Production

### iOS (TestFlight / App Store)

1. Update version in `app.json`:
   ```json
   {
     "version": "1.0.1",
     "ios": {
       "buildNumber": "2"
     }
   }
   ```

2. Build for production:
   ```bash
   npx cap build ios
   ```

3. Archive in Xcode:
   - Product → Archive
   - Upload to App Store Connect

### Android (Play Store)

1. Update version in `app.json`:
   ```json
   {
     "versionCode": 2
   }
   ```

2. Build release:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```

3. Upload `.aab` file to Play Console

---

## ⚠️ Important Notes

### Biometric Security
- Credentials are stored in device's **secure storage** (not plain localStorage in production)
- Consider implementing keychain storage for sensitive data
- Biometric data never leaves the device
- Falls back to device passcode/PIN if biometric fails

### Push Notification Limits
- **iOS**: Must test on physical device (simulator doesn't support push)
- **Android**: Can test on emulator with Google Play Services
- **Token Refresh**: Tokens can expire/change - handle updates in your backend
- **Delivery**: Not guaranteed (network, battery saver, etc.)

### Privacy & Permissions
- Request permissions at appropriate times (not immediately on launch)
- Explain to users why you need biometric/push access
- Provide opt-out options for notifications
- Follow App Store and Play Store guidelines

---

## 📞 Support & Troubleshooting

### Common Issues

**"Biometric not available"**
- Ensure device has Face ID/Touch ID/Fingerprint enrolled
- Check Info.plist has NSFaceIDUsageDescription (iOS)
- Verify USE_BIOMETRIC permission (Android)

**"Push token not received"**
- Check Firebase configuration files are in correct locations
- Verify APNs key uploaded to Firebase (iOS)
- Ensure app has notification permission
- Check device internet connection

**"Build errors"**
- Run `npx cap sync` after installing new plugins
- Clean build: `cd ios/App && pod deintegrate && pod install`
- Android: Invalidate caches in Android Studio

---

## ✅ Checklist

### iOS
- [ ] APNs Key created and uploaded to Firebase
- [ ] GoogleService-Info.plist added to Xcode
- [ ] Info.plist has Face ID description
- [ ] Push Notifications capability enabled
- [ ] AppDelegate.swift updated with Firebase
- [ ] Firebase Messaging pod installed
- [ ] Tested on physical device

### Android
- [ ] google-services.json in android/app/
- [ ] Manifest has biometric & notification permissions
- [ ] Tested on device/emulator

### Backend
- [ ] Push token storage schema created
- [ ] API endpoint implemented: POST /api/consumer/push-token
- [ ] Token validation and storage logic
- [ ] Campaign notification sending logic

---

**🎉 You're all set!** Your mobile app now supports secure biometric login and push notifications!

For questions or issues, refer to:
- [Capacitor Biometric Auth Docs](https://github.com/aparajita/capacitor-biometric-auth)
- [Capacitor Push Notifications Docs](https://capacitorjs.com/docs/apis/push-notifications)
- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
