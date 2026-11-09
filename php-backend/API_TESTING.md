# PingMe backend API testing

## Hosted API

The deployed PHP API base URL is:

```text
http://172.197.160.139/pingme
```

Check the hosted service:

```powershell
Invoke-RestMethod http://172.197.160.139/pingme/health
```

Use this value for the mobile app:

```text
EXPO_PUBLIC_API_URL=http://172.197.160.139/pingme
```

The hosted backend does not require the local PHP server or local MySQL process to be running on the development computer.

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

For an existing database, run these migrations once:

```powershell
mysql -u root -p pingme < php-backend/migration_add_profile_fields.sql
```

## Start the Node API

To run the separate Node API instead, open another PowerShell terminal at the repository root:

```powershell
npm install --prefix server
npm run api
`

Set this value in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://172.197.160.139/pingme
```

Start Expo from the repository root:

```powershell
cd C:\Users\admin\Desktop\PingMe\mobile
npx expo start -c

=== expo andriod build push
npx eas-cli@latest build --platform android --profile development

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

### Update profile

`PATCH /me/profile`

```json
{
  "username": "newusername",
  "name": "New Name",
  "email": "new@example.com",
  "avatarId": "avatar_03"
}
```

`avatarId` must be one of `avatar_01` through `avatar_10`. The images are bundled
in the mobile app; the backend stores only the selected ID.

### Change password

`POST /me/password`

```json
{
  "currentPassword": "PingMe123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

New and changed passwords are stored using bcrypt. Existing seeded passwords are
already bcrypt hashes.

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
