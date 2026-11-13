# PingMe scenarios and errors

This is the demo and deployment checklist for the current PingMe implementation.
The mobile app is configured for the PHP/MySQL API. The Node API is a separate
legacy/local API and does not provide the same authentication and friend features.

## User-facing scenarios

| Area | Scenario | Expected result | Possible error/result |
|---|---|---|---|
| Startup | No saved session | Login screen appears | Generic error if the API cannot be reached |
| Startup | Saved valid session | User, profile, locations, and sharing state load | Location list may remain empty until the next refresh |
| Startup | Expired/invalid saved token | Session is cleared and login screen appears | User must sign in again |
| Register | Valid username, name, email, password | Account is created; user returns to sign-in | — |
| Register | Username is invalid, fields are missing, or password is under 6 characters | Registration is rejected | Generic mobile error; PHP returns HTTP 400 |
| Register | Email or username already exists | Registration is rejected | `Email or username already exists.`; PHP returns HTTP 409 |
| Login | Valid email or username and password | User enters the app | — |
| Login | Wrong credentials | Login is rejected | `Username or password is incorrect.`; PHP returns HTTP 401 |
| Login | API unavailable or malformed response | Login remains available | `Something went wrong. Please try again.` |
| Profile | Open Settings > profile card | Profile details and current avatar appear | Generic error if profile data cannot be saved |
| Profile | Select one of ten preset avatars | Selected avatar is displayed and sent as `avatar_01`–`avatar_10` | Invalid avatar is rejected by PHP with HTTP 400 |
| Profile | Edit username, name, or email and save | Profile updates and top toast says `Profile updated.` | Duplicate fields: `Email or username already exists.`; invalid username/email fields show their specific validation message |
| Password | Open Change password tab | Only current, new, and confirmation fields appear | — |
| Password | Valid current password and matching new passwords | Password changes and top toast says `Password changed.` | — |
| Password | New password under 6 characters | Password is not changed | PHP HTTP 400; generic mobile error |
| Password | New and confirmation passwords differ | Password is not changed | `New password must match the confirmation password.` |
| Password | Current password is wrong | Password is not changed | `Current password is invalid.`; PHP HTTP 401 |
| Sign out | Tap Sign out | Confirmation modal appears | — |
| Sign out | Confirm | Token and local sharing state are cleared; login screen appears | Generic error is not expected |
| Sign out | Cancel | User remains signed in | — |
| Home | Map has valid locations | Leaflet map and avatar markers appear | Map tiles require internet access |
| Home | Drag or zoom the map | Map can be navigated manually | Offline tiles may remain blank |
| Home | Tap `Your location is visible` | Map centers on the signed-in user | No action if the user has no recorded location |
| Home | Many circle friends | Fixed Your circle box scrolls vertically | Empty box when no friend has a recorded location |
| Home | Friend is sharing | Friend shows `Live` | — |
| Home | Friend stopped sharing but has history | Friend marker remains at last location and shows only the last-seen time | No `Location paused` label should be shown |
| Home | Sharing switch enabled | Permissions are requested and foreground service starts | Permission denial prevents tracking |
| Home | Sharing switch disabled | PHP state is disabled and background task stops | Generic recovery state if API update fails |
| Notification | Background sharing is active | Persistent PingMe notification appears | Android requires this notification while tracking |
| Notification | Tap Stop sharing | Sharing is disabled on PHP, task stops, notification disappears, app closes without logout | Action cannot work in Expo Go; native APK is required |
| Circle | Search with at least two characters | Matching users and avatars appear | Short query returns PHP HTTP 400; mobile shows generic error |
| Circle | Search an accepted friend | Result is labelled `Friend`; no duplicate request is sent | — |
| Circle | Send a request | Request is created and a top toast appears | Already friends/pending request returns PHP HTTP 409 |
| Circle | Open Requests | Sent request details appear in a modal | Empty state says no sent requests |
| Circle | Accept or decline incoming request | Request state changes and lists refresh | Missing/non-pending request returns PHP HTTP 404 |
| Circle | Open friend | Home opens and centers on that friend | If no location exists, map falls back to another available location |
| Circle | Three-dot friend menu > Remove friend | Confirmation modal appears | — |
| Circle | Confirm friend removal | Friendship is deleted and list refreshes | Missing friendship returns PHP HTTP 404 |

## Backend endpoint scenarios

All protected routes require `Authorization: Bearer <token>`.

| Endpoint | Success | Main backend errors |
|---|---|---|
| `GET /health` | 200 health response | Web-server/PHP availability error |
| `POST /auth/register` | 201 token and user | 400 validation, 409 duplicate |
| `POST /auth/login` | 200 token and user | 401 invalid credentials |
| `GET /me` | 200 profile and own location | 401 session, 404 user |
| `PATCH /me/profile` | 200 updated profile | 400 validation, 409 duplicate |
| `POST /me/password` | 200 password changed | 400 validation, 401 current password |
| `GET /users/search` | 200 matching users | 400 query shorter than two characters |
| `GET /friends` | 200 accepted friends | 401 session |
| `GET /friend-requests` | 200 incoming and sent requests | 401 session |
| `POST /friend-requests` | 201 request created | 400 invalid target, 404 missing user, 409 duplicate/pending |
| `POST /friend-requests/{id}/accept` | 200 accepted | 401/404 invalid pending request |
| `POST /friend-requests/{id}/decline` | 200 declined | 401/404 invalid pending request |
| `POST /friends/{id}/remove` | 200 friendship removed | 401/404 friendship not found |
| `POST /me/location-sharing` | 200 enabled state | 400 invalid boolean, 401 session |
| `GET /locations` | 200 friend-only locations and last history | 401 session |
| `POST /locations` | 201 saved location | 400 invalid coordinates, 401 session, 404 user |

## Technical failure conditions

These are not shown verbatim to production users:

- Missing PHP `.env`, unavailable MySQL, or incorrect database credentials.
- Missing/incorrect `PINGME_JWT_SECRET`.
- Apache/PHP route prefix mismatch when hosting under `/pingme`.
- Missing database migration for `avatar_id`, `location_sharing_enabled`, or location history.
- Invalid or expired JWT.
- Missing Android foreground/background location permission.
- Android battery restrictions or force-stop preventing background updates.
- OpenStreetMap tile/network failure.
- Expo Go not supporting the required native background-service/plugin behavior.
- Interrupted or failed EAS upload/build.
- Node.js 20 deprecation warning from EAS; this is a warning, not an app error.

## Deployment notes

For the notification action and background tracking, manually install a native
APK built with EAS or `expo run:android`. Do not validate those features with
Expo Go.

The PHP deployment must receive the current backend files and database
migrations. Mobile-only changes are delivered through the APK.
