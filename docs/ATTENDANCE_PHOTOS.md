# Attendance Photos (check-in / check-out capture)

Every face scan at the terminal stores the verified frame, stamped with the
employee's name, id, IN/OUT, the server date-time (IST) and the terminal's GPS
fix. The admin dashboard shows the frame as a thumbnail next to Check In /
Check Out, a large view with a Google Maps link, and uses the latest frame as
the employee's avatar.

## Flow

```
Terminal (frame + lat/lng) ──POST /api/biometrics/face/verify──▶ Backend
                                                                 │ 1. edge engine verifies the face
                                                                 │ 2. recordAttendance() → attendance row (id, date, check_in / check_out)
                                                                 │ 3. saveEmployeeAvatar()   → Storage: avatars/<employee_id>.jpg   (unstamped 256px face crop)
                                                                 │ 4. saveAttendancePhoto()  → Storage: <date>/<attendance_id>_<in|out>.jpg  (stamped)
                                                                 │                             + <date>/<attendance_id>_<in|out>.json (GPS sidecar)
                                                                 ▼
Admin panel ──GET /api/attendance──▶ rows + photos:{in,out} + photo_urls:{in,out} (signed, 1 h)
            ──GET /api/attendance/:id/photo/:kind──▶ signed URL + captured_at + location
            ──GET /api/attendance/avatars?ids=EMP-001,…──▶ { EMP-001: signedUrl, … }
            ──GET /api/attendance/employee/:id──▶ employee (+ avatar_url) + rows with photo_urls
```

* **No schema change.** Photos, sidecars and avatars are addressed by
  attendance id / employee id inside the private `attendance-photos` bucket.
* **Stamp is burned in server-side** (jimp, bitmap fonts) using the server
  time already written to the attendance row, so photo and timesheet always
  agree. Lines: `Name (EMP-ID)`, `CHECK IN|OUT  dd Mon yyyy, HH:mm:ss IST`,
  `LOC lat, lng  +/-N m` (only when the terminal sent a fix).
* **Rolling check-out** overwrites the `out` photo, matching `recordAttendance()`.
* **Never blocks attendance.** Photo / avatar / sidecar failures are logged;
  the API response carries `photo: { kind, saved, stamped_at, location }`.
* **Private bucket**, allowed MIME types `image/jpeg` and `application/json`,
  2 MB limit. Backend uses the service-role key; the dashboard gets 1-hour
  signed URLs (batch-signed per page).
* **Retention.** Date folders older than `ATTENDANCE_PHOTO_RETENTION_DAYS`
  (default 90) are deleted by a daily in-process sweep or
  `POST /api/attendance/photos/cleanup` (admin). Avatars are kept.
* **Enrollment.** `POST /api/biometrics/face/register` also saves the
  enrollment frame as the avatar, so new staff have a face before their first scan.

## Setup

1. Supabase → Project Settings → API Keys → copy the **secret / service_role** key.
2. `backend/.env`:
   ```
   SUPABASE_SERVICE_KEY=<service role key>
   ATTENDANCE_PHOTO_RETENTION_DAYS=90
   ```
3. `cd backend && node setup_attendance_photos.js` (or run
   `supabase/migration_v6_attendance_photos.sql`).
4. Deploy: `.\scripts\deploy_backend.ps1 -Stage`, test the tagged URL, then
   `-Promote`. Env vars are set on Cloud Run from `backend/.env`; `.env` itself
   is excluded from the upload by `backend/.gcloudignore`.

## Terminal app (v2.1.2+)

* Sends `lat`, `lng`, `accuracy`, `fix_time` multipart fields with every scan
  (GPS refreshed every 60 s, never delays a scan). Needs the location permission.
* Shows the captured frame with name / IN-OUT / date-time on the success screen.

## Storage sizing

~45 KB per stamped frame. 45 staff × 2 frames × 26 days ≈ 105 MB/month; with
90-day retention the bucket stays near 320 MB (Supabase free tier: 1 GB).

## Tests

`cd backend && npm test` — photo service unit tests (stamp layout, location
parsing, sidecar, avatars, signed URLs, retention) against an in-memory storage fake.
