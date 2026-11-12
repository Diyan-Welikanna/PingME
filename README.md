# PingMe

A secure real-time location sharing MVP.

## Structure

- `mobile/` - Expo React Native client
- `server/` - Express + Socket.IO API
- `php-backend/` - PHP + MySQL API and database schema

## Run locally

Expo SDK 57 requires Node.js `20.19.4` or newer. Check with `node --version` before starting the mobile app.

1. Start the API from the repository root:

   ```powershell
   npm run api
   ```

2. Start the mobile app in another terminal from the repository root:

   ```powershell
   npm run mobile
   ```

Run `npm install` once in both `server/` and `mobile/` before using these commands.

## Run on the Android Studio emulator

Start the Pixel 6 Pro API 35 emulator in Android Studio Device Manager. Confirm that Windows can see it:

```powershell
adb devices
```

Start the PHP API from the repository root in one terminal:

```powershell
npm run api:php
```

In a second terminal, configure the emulator to reach the API running on this computer, then start Expo:

```powershell
Set-Location mobile
Copy-Item .env.example .env
```

Set this value in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://172.197.160.139/pingme
```

Then run:

```powershell
npm run start
```

Press `a` in the Expo terminal to open PingMe in Expo Go on the running emulator. You can also launch it directly with:

```powershell
npm run start:expo-go
```

Use `npm run start:clear` when switching builds or after stale JavaScript appears. The Home map uses Leaflet and OpenStreetMap tiles, so it does not require Google Maps or a Google Cloud billing account. The phone or emulator must have internet access to load the OpenStreetMap tiles.

If the app still uses the previous LAN address, clear PingMe's emulator app data or change the API URL in the login screen, because the app stores the selected API URL locally.

## PHP backend database

1. Create the MySQL database and tables by importing `php-backend/schema.sql` into MySQL.
2. Add sample accounts and circle data by importing `php-backend/demo_data.sql`.
3. Copy `php-backend/.env.example` to `php-backend/.env` and set the database password and JWT secret.
4. Start the PHP API from the repository root:

   ```powershell
   npm run api:php

   cd C:\Users\admin\Desktop\PingMe\mobile
   npx expo start -c
   ```

   The PHP API is hosted at `http://172.197.160.139/pingme`. For local development, it can also run at `http://127.0.0.1:8080`.

5. Configure the mobile app by copying `mobile/.env.example` to `mobile/.env` and replacing the example IP with the computer's LAN IPv4 address. Then start Expo:

   ```powershell
   npm run mobile
   ```

   The phone and computer must be on the same Wi-Fi network, and Windows Firewall must allow PHP on port `8080`.

The PHP service provides registration/login, username search, friend requests, friend acceptance/decline, location-sharing controls, and friend-only map locations. Full request examples are in `php-backend/API_TESTING.md`.

The seeded accounts all use the password `PingMe123!`. Example login: `alex@example.com`.

If the older schema was already imported, run `php-backend/migration_from_previous_schema.sql` once before importing the updated demo data.

The mobile app currently uses the hosted API at `http://172.197.160.139/pingme`.

## Background location sharing

When location sharing is enabled, PingMe registers a native background location task
that publishes a new location after about 25 metres of movement or 10 seconds. The
task runs only for the signed-in user and sends locations to the API over the same
authenticated endpoint as foreground updates.

Background location is not reliable in Expo Go, especially on Android. Build a
development or production app so the native permissions and foreground service are
included:

```powershell
cd mobile
npx expo run:android
# or
npx expo run:ios
```

For a cloud build, use an EAS development or production profile. On Android, allow
`All the time` location access when prompted and do not force-stop the app; Android
may still throttle updates to preserve battery. On iOS, allow `Always` location
access and keep Background App Refresh enabled. The sharing switch remains the
user-controlled consent control and stopping sharing unregisters the background task.
The Android foreground-service notification also has a **Stop sharing** action. It
disables sharing on the server, stops the location service and closes the app
without signing the user out. Android keeps the notification non-dismissible while
location tracking is active, as required for a foreground location service.
If the upload is reset, retry with the current CLI from the `mobile` directory:

```powershell
npx eas-cli@latest build --platform android --profile development
```

## MVP scope

- Demo registration/login flow with JWT sessions
- Explicit, revocable location-sharing consent
- Location capture through Expo Location
- Real-time location updates over Socket.IO
- Map markers for the signed-in user and shared contacts
- Persistent MySQL storage through the PHP backend

## Next production steps

Use PostgreSQL, HTTPS, refresh-token rotation, encrypted mobile storage, rate limiting, audit logs, consent history, data retention controls, and a managed deployment before handling real user data.
