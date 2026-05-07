# Chain Agency Mobile App

Native Expo (TypeScript) mobile app for **agency staff and platform admins**.
Sits next to the existing consumer-portal WebView wrapper in `mobile-app/`.

This app talks to the existing Chain backend API directly — it is **not** a WebView.

## Stack

- Expo SDK 54 + React Native 0.81 + TypeScript
- React Navigation (bottom tabs + native stacks)
- TanStack Query for data fetching
- Axios for API calls (with bearer-token + active-tenant headers)
- `expo-secure-store` for JWT + user storage
- `expo-local-authentication` for Face ID / Touch ID unlock
- `expo-notifications` for Expo Push
- `expo-web-browser` for the wallet top-up flow (no IAP)

## Folders

```
mobile-agency-app/
├── App.tsx                        # Root provider tree
├── app.json / eas.json            # Expo + EAS config (bundle id: com.chainsoftware.agency)
├── assets/                        # icon / splash (matches Chain brand)
└── src/
    ├── theme/colors.ts            # Dark navy palette matching the web admin
    ├── lib/
    │   ├── api.ts                 # Axios client + typed API helpers
    │   ├── storage.ts             # SecureStore helpers (token, user, tenant, biometric)
    │   └── push.ts                # Expo push registration → backend
    ├── context/AuthContext.tsx    # Login / logout / biometric unlock state
    ├── components/ui.tsx          # Button, Card, Field, H1/2/3, Pill, Loader, formatCurrency
    ├── navigation/AppNavigator.tsx
    └── screens/
        ├── LoginScreen.tsx
        ├── DashboardScreen.tsx
        ├── AccountsScreen.tsx + AccountDetailScreen.tsx
        ├── MessagingScreen.tsx + ComposeMessageScreen.tsx
        ├── PaymentsScreen.tsx + PostPaymentScreen.tsx
        ├── WalletScreen.tsx
        ├── MoreScreen.tsx + ProfileScreen.tsx
        └── TenantSwitcherScreen.tsx (platform_admin only)
```

## Configure

The default API base URL is `https://chain-admin-production.up.railway.app`.
Override via `app.json → expo.extra.apiBaseUrl` for staging or local testing.

## Run locally

```bash
cd mobile-agency-app
npm install
npm run ios       # or: npm run android
```

> The Replit container does not include iOS / Android simulators. Run the
> `expo start` commands above from a machine with Xcode (iOS) or Android Studio
> installed. The TypeScript scaffold compiles cleanly without a simulator.

## Build with EAS

```bash
npm install -g eas-cli
eas login
eas build:configure       # first time — generates / wires credentials
eas build --platform ios --profile production
eas build --platform android --profile production
```

The first `eas build:configure` will assign an `eas.projectId`; commit the
result back into `app.json → expo.extra.eas.projectId`.

Bundle identifier: **`com.chainsoftware.agency`** (peer of the consumer app's
`com.chainsoftware.platform`).

## Auth flow

- Hits `POST /api/agency/login` with username + password (same as web admin).
- Stores the returned JWT, user, and home tenant in `expo-secure-store`.
- All API calls send `Authorization: Bearer <token>`.
- When a `platform_admin` switches tenants, the app calls
  `POST /api/admin/impersonate-tenant/:tenantId` to receive a fresh 4-hour JWT
  scoped to the target tenant — exact same flow the web admin uses for "Login
  as Tenant".
- 401 responses force a logout.

## Push notifications

- Requests notification permission on first launch.
- Tries to register the Expo push token with `POST /api/agency/push-devices/register`.
  This endpoint does not yet exist on the backend (`push_devices` is currently
  consumer-scoped). The client fails soft on 404 so the app still works
  end-to-end; once a staff push endpoint ships, no client change is required.

## Wallet

The Wallet screen pulls from `GET /api/wallet/balance` and `GET /api/wallet/ledger`.
Both endpoints return 404 today (Task #45 backend not yet deployed) — the screen
shows a friendly "wallet not yet active" state until they are live.

**Add Funds** opens the existing web billing page in an in-app browser
(`expo-web-browser`) — no Apple / Google IAP, per task spec.

## Brand match

Theme tokens in `src/theme/colors.ts` mirror the web admin's hardcoded
palette (`#0f1a3c` / `#111d35` cards with sky/indigo accents, status pills via
`statusColor()`).

## Not changed

The existing `mobile-app/` consumer WebView wrapper is **untouched**. Both
apps build and ship independently with separate bundle ids.
