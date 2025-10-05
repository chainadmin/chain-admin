# Agency-Specific App Download Links

## Overview

Your mobile app now supports **deep linking** - this means each agency can share a custom download link that automatically shows their branding when consumers open the app!

---

## How It Works

### **Regular App Link** (Generic)
```
chainsoftwaregroup.com/consumer-login
```
- Shows "Welcome" + "Find your agency" message
- No logo
- Consumer must enter email and DOB
- App searches all agencies

### **Agency-Specific App Link** 🎯
```
chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions
```
- Shows "Welcome to Waypoint Solutions"
- Shows agency logo
- Pre-fills agency context
- Consumer only enters email and DOB
- Goes straight to their account!

---

## Creating Agency-Specific Links

Each agency has a unique **slug** (their URL identifier). To create their custom link:

**Format:**
```
https://chainsoftwaregroup.com/consumer-login?agency=AGENCY_SLUG
```

**Examples:**
```
https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions
https://chainsoftwaregroup.com/consumer-login?agency=abc-collections  
https://chainsoftwaregroup.com/consumer-login?agency=first-recovery
```

---

## How to Share These Links

### **1. QR Codes** (Best for physical mail)
1. Generate QR code from agency's custom link
2. Print on letters, invoices, or payment stubs
3. Consumers scan → download app → see their agency branding!

### **2. Email Campaigns**
```
Download our mobile app:
[Download for iPhone]
https://apps.apple.com/app/chain-consumer-portal

After installing, tap here to access your Waypoint Solutions account:
https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions
```

### **3. SMS Messages**
```
Access your account with the Chain mobile app.

Download: https://chain.app
Sign in: https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions
```

---

## Technical Details

### **What Happens When User Clicks Link:**

1. **If app is NOT installed:**
   - Opens in Safari/Chrome browser
   - Shows mobile-optimized login page
   - After login, prompts "Open in Chain app?" (iOS universal links)

2. **If app IS installed:**
   - Opens directly in Chain app
   - Shows simplified login screen with agency branding
   - Consumer enters credentials
   - Goes straight to their dashboard

### **Deep Link Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `agency` | Agency slug | `waypoint-solutions` |

**Future parameters you could add:**
- `email` - Pre-fill email (for logged-out users)
- `account` - Direct link to specific account
- `payment` - Deep link to payment page

---

## Setting Up for Production

### **1. iOS Universal Links** (Required for App Store)

Add to your agency website's `.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAM_ID.com.chaincomms.chain",
      "paths": [
        "/consumer-login",
        "/consumer-dashboard",
        "/*/consumer-login"
      ]
    }]
  }
}
```

### **2. Android App Links** (Required for Play Store)

Add to `AndroidManifest.xml` (already configured):

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" 
        android:host="chainsoftwaregroup.com" />
</intent-filter>
```

---

## Examples for Each Agency

Generate links for your agencies:

```javascript
// Example: Generate links programmatically
const agencies = [
  { name: "Waypoint Solutions", slug: "waypoint-solutions" },
  { name: "ABC Collections", slug: "abc-collections" },
  { name: "First Recovery", slug: "first-recovery" }
];

agencies.forEach(agency => {
  const deepLink = `https://chainsoftwaregroup.com/consumer-login?agency=${agency.slug}`;
  console.log(`${agency.name}: ${deepLink}`);
});
```

**Output:**
```
Waypoint Solutions: https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions
ABC Collections: https://chainsoftwaregroup.com/consumer-login?agency=abc-collections
First Recovery: https://chainsoftwaregroup.com/consumer-login?agency=first-recovery
```

---

## Benefits

✅ **Better User Experience** - Consumers see their agency immediately
✅ **Higher Conversion** - Branded experience builds trust
✅ **Easier Onboarding** - Less confusion about "which agency?"
✅ **Trackable** - You can see which agencies' links are used most
✅ **Shareable** - Agencies can promote their own custom link

---

## Testing Deep Links

### **iOS Simulator:**
```bash
xcrun simctl openurl booted "https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions"
```

### **Android Emulator:**
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "https://chainsoftwaregroup.com/consumer-login?agency=waypoint-solutions"
```

### **Real Device:**
1. Build and install app
2. Send yourself a text/email with the link
3. Tap the link
4. App should open with agency branding!

---

## Next Steps

1. ✅ Deep linking is configured in the app
2. ⏭️ Build and submit app to App Store/Play Store
3. ⏭️ Generate QR codes for each agency
4. ⏭️ Add links to agency email templates
5. ⏭️ Train agencies on sharing their custom link

**Your consumers will love the personalized experience!** 🎉
