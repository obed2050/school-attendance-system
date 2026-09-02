# Server — School Staff Attendance API

PHASE 1 backend for the School Staff Attendance Management System.

Built with Node.js, Express, TypeScript, PostgreSQL and Prisma ORM.

## Features

- JWT authentication & role-based authorization (`STAFF` / `ADMIN`)
- Public signup creates `PENDING` staff awaiting admin approval
- Admin approval / rejection workflow
- Staff submit attendance once per day (enforced at the database level)
- Server-side attendance timing (client cannot set date/time)
- Centralized error handling, validation (Zod), rate limiting, helmet, CORS
- Jest + Supertest test suite running against a dedicated test database

## Database schema

Three tables, managed via Prisma migrations in `prisma/migrations/`.

### `users`

| Column          | Type                                                             |
| --------------- | ---------------------------------------------------------------- |
| id              | Int, PK, autoincrement                                            |
| full_name       | String                                                            |
| email           | String, unique                                                    |
| phone_number    | String, unique                                                    |
| department_id   | Int, FK → `departments.id`                                       |
| password_hash   | String (bcrypt), never returned by the API                        |
| role            | enum `STAFF` \| `ADMIN`                                          |
| status          | enum `PENDING` \| `ACTIVE` \| `REJECTED`                         |
| created_at      | DateTime                                                          |
| updated_at      | DateTime                                                          |

Indexes: `email`, `phone_number`, `status`, `role`, `department_id`.

### `departments`

| Column     | Type             |
| ---------- | ---------------- |
| id         | Int, PK          |
| name       | String, unique   |
| created_at | DateTime         |

Seeded: Software Development, Building Construction, Electronics and Telecommunication, Ordinary Level, Administration.

### `attendance`

| Column          | Type                              |
| --------------- | --------------------------------- |
| id              | Int, PK                            |
| user_id         | Int, FK → `users.id`              |
| attendance_date | Date                              |
| check_in_time   | DateTime                          |
| status          | enum `PRESENT` \| `LATE`          |
| created_at      | DateTime                          |

Unique: `(user_id, attendance_date)` — a staff member can submit only once per day.

Indexes: `user_id`, `attendance_date`, `status`.

## Attendance timing rules

- `attendance_date` and `check_in_time` are always derived from the **server** clock.
- Status rule (configurable):
  - `ATTENDANCE_START_TIME=07:30`
  - `LATE_AFTER_TIME=08:00`
  - Check-in before `LATE_AFTER_TIME` → `PRESENT`
  - Check-in at/after `LATE_AFTER_TIME` → `LATE`

Logic lives in `src/services/attendanceTime.ts`.

## Endpoints

### Auth

**POST `/api/auth/signup`** — public

```json
{
  "full_name": "Jane Smith",
  "email": "jane@school.com",
  "phone_number": "2012345678",
  "department_id": 1,
  "password": "Password@123",
  "confirm_password": "Password@123"
}
```

Creates `role = STAFF`, `status = PENDING`. Returns
`{"success":true,"message":"Account created successfully. Please wait for administrator approval."}`

**POST `/api/auth/login`** — public

```json
{ "email": "jane@school.com", "password": "Password@123" }
```

Returns `{ token, user }`. Behavior depends on status: PENDING → 403, REJECTED → 403,
ACTIVE → 200 with JWT. Wrong credentials → generic 401.

**GET `/api/auth/me`** — auth required. Returns the current user (never `password_hash`).

### Departments

**GET `/api/departments`** — public. Returns the list of departments.

### Attendance (STAFF)

**POST `/api/attendance`** — STAFF only. Submits today's attendance. Returns 409
"Attendance already submitted today." if already submitted that day.

**GET `/api/attendance/me`** — STAFF only. Returns the staff member's attendance history.

### Admin (ADMIN)

**GET `/api/admin/pending-users`** — returns staff with `status = PENDING`.

**PATCH `/api/admin/users/:id/approve`** — sets `status = ACTIVE`.

**PATCH `/api/admin/users/:id/reject`** — sets `status = REJECTED`.

**GET `/api/admin/attendance`** — paginated list with related staff info.
Query params: `date`, `department`, `status`, `search`, `page`, `limit`.

**GET `/api/admin/dashboard/stats`** — returns
`{ date, total_staff, present, late, absent }`.
`total_staff` counts only `ACTIVE` + `STAFF`.

## Setup

```bash
# install
npm install

# configure env (see .env.example)
# create database
createdb school_attendance
createdb school_attendance_test

# migrate + seed
npm run migrate
npm run seed

# run
npm run dev
```

## Testing

Tests run against `DATABASE_URL_TEST` and reset the database between tests.

```bash
npm test
```

## Commands

| Command            | Description                                 |
| ------------------ | ------------------------------------------- |
| `npm run dev`      | Run dev server (ts-node-dev)                |
| `npm run build`    | Compile TypeScript to `dist/`               |
| `npm run start`    | Run compiled server                         |
| `npm run migrate`  | Create/apply Prisma migrations              |
| `npm run seed`     | Seed departments + first admin              |
| `npm test`         | Run Jest + Supertest suite                  |
| `npm run lint`     | ESLint                                      |
| `npm run format`   | Prettier                                    |
