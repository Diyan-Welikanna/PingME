# PingMe backend API testing

Start the PHP API from the repository root:

```powershell
npm run api:php
```

Base URL on this hotspot: `http://192.168.162.127:8080`

For the same PC only, `http://127.0.0.1:8080` also works.

Import `schema.sql`, then `demo_data.sql` into MySQL before testing database routes.

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
