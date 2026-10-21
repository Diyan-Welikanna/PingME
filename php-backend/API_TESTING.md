# PingMe backend API testing

## Which backend to run

The mobile app currently uses the PHP API on port `8080`. Run this backend for the complete registration, login, friends, and location workflow.

The repository also contains a separate Node API on port `4000`. It is useful for the lightweight API prototype, but it does not provide the complete friends workflow used by the mobile app.

## Start the PHP API

Open a PowerShell terminal at the repository root (`PingMe`), then run:

```powershell
npm install
php -S 0.0.0.0:8080 -t php-backend php-backend/index.php
```

The repository shortcut for the same server is:

```powershell
npm run api:php
```

Run that shortcut from the repository root. If the terminal is currently inside `mobile`, use:

```powershell
npm --prefix .. run api:php
```

Keep this terminal open. The API is available locally at `http://127.0.0.1:8080` and from another device on the same network at `http://192.168.1.10:8080`.

Check that it is running:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

Expected response:

```json
{"status":"ok","service":"pingme-php-api"}
```

Before testing database routes, create the `pingme` MySQL database, import `php-backend/schema.sql`, and optionally import `php-backend/demo_data.sql`. Copy `php-backend/.env.example` to `php-backend/.env` and set the MySQL password and `PINGME_JWT_SECRET`.

## Start the Node API

To run the separate Node API instead, open another PowerShell terminal at the repository root:

```powershell
npm install --prefix server
npm run api
```

The Node API runs at `http://127.0.0.1:4000`. Check it with:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
```

You can also run it directly from the `server` directory:

```powershell
Set-Location server
npm run dev
```

Stop either backend with `Ctrl+C`.

## Configure the mobile app

For a physical phone, make sure the phone and computer are on the same Wi-Fi network, then set the API URL to the computer's current LAN address:

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Set this value in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.10:8080
```

Start Expo from the repository root:

```powershell
npm run mobile
```

Allow PHP through Windows Firewall on port `8080` when testing from a phone. If the LAN address changes, update `mobile/.env` and restart Expo.

For an Android Studio emulator, use the host alias instead of the computer's LAN IP:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080
```

Start Expo from `mobile` with `npm run start`, then press `a` in the Expo terminal.

## Authentication

### Register

`POST /auth/register`

```json
{
  "username": "newuser",
  "name": "New User",
  "email": "newuser@example.com",
  "password": "PingMe123!"
}
```

### Login

`POST /auth/login`

Use either username or email as `identifier`:

```json
{
  "identifier": "alexmorgan",
  "password": "PingMe123!"
}
```

Copy `token` from the response and send it as:

```text
Authorization: Bearer YOUR_TOKEN
```

## Friend workflow

1. `GET /users/search?q=sana`
2. `POST /friend-requests` with `{ "username": "sanawilliams" }`
3. Log in as Sana.
4. `GET /friend-requests`
5. `POST /friend-requests/REQUEST_ID/accept`
6. Log back in as Alex.
7. `GET /friends`

Decline a request with `POST /friend-requests/REQUEST_ID/decline`.

## Location workflow

### Enable or disable sharing

`POST /me/location-sharing`

```json
{ "enabled": true }
```

### Publish current location

`POST /locations`

```json
{
  "latitude": 51.5074,
  "longitude": -0.1278
}
```

### Read map locations

`GET /locations`

This returns your own location and locations belonging to accepted friends whose sharing is enabled. Pending requests and non-friends are never included.

## Google signup

Google signup should be added after creating a Google OAuth client ID and configuring server-side ID-token verification. The current backend intentionally does not accept an unverified Google email or user id, because that would let anyone impersonate another account.

## Seeded accounts

All seeded accounts use `PingMe123!`:

- `alexmorgan` or `alex@example.com`
- `sanawilliams` or `sana@example.com`
- `marcochen` or `marco@example.com`
- `ninapatel` or `nina@example.com`
