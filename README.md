# PingMe

A secure real-time location sharing MVP.

## Structure

- `mobile/` - Expo React Native client
- `server/` - Express + Socket.IO API
- `php-backend/` - PHP + MySQL API and database schema

## Run locally

1. Start the API from the repository root:

   ```powershell
   npm run api
   ```

2. Start the mobile app in another terminal from the repository root:

   ```powershell
   npm run mobile
   ```

Run `npm install` once in both `server/` and `mobile/` before using these commands.

## PHP backend database

1. Create the MySQL database and tables by importing `php-backend/schema.sql` into MySQL.
2. Add sample accounts and circle data by importing `php-backend/demo_data.sql`.
3. Copy `php-backend/.env.example` to `php-backend/.env` and set the database password and JWT secret.
4. Start the PHP API from the repository root:

   ```powershell
   npm run api:php
   ```

   The PHP API runs at `http://127.0.0.1:8080` and is reachable from devices on the same Wi-Fi using your computer's LAN IP.

5. Configure the mobile app by copying `mobile/.env.example` to `mobile/.env` and replacing the example IP with the computer's LAN IPv4 address. Then start Expo:

   ```powershell
   npm run mobile
   ```

   The phone and computer must be on the same Wi-Fi network, and Windows Firewall must allow PHP on port `8080`.

The PHP service provides registration/login, username search, friend requests, friend acceptance/decline, location-sharing controls, and friend-only map locations. Full request examples are in `php-backend/API_TESTING.md`.

The seeded accounts all use the password `PingMe123!`. Example login: `alex@example.com`.

If the older schema was already imported, run `php-backend/migration_from_previous_schema.sql` once before importing the updated demo data.

Set `EXPO_PUBLIC_API_URL` to the machine's LAN address when testing on a physical device, for example `http://192.168.162.127:8080` while connected to the current phone hotspot.

## MVP scope

- Demo registration/login flow with JWT sessions
- Explicit, revocable location-sharing consent
- Location capture through Expo Location
- Real-time location updates over Socket.IO
- Map markers for the signed-in user and shared contacts
- Persistent MySQL storage through the PHP backend

## Next production steps

Use PostgreSQL, HTTPS, refresh-token rotation, encrypted mobile storage, rate limiting, audit logs, consent history, data retention controls, and a managed deployment before handling real user data.
