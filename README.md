# School Staff Attendance Management System

A real-world school staff attendance system with role-based access for **STAFF** and **ADMIN**.

- Staff sign up, wait for admin approval, log in, and submit attendance (once per day).
- Admin logs in, approves/rejects pending staff, views attendance, and sees dashboard statistics.

## Monorepo structure

```
school-attendance-system/
├── frontend/        # React + TypeScript + Vite + Tailwind CSS frontend (standalone package)
├── backend/         # Node.js + Express + TypeScript + PostgreSQL backend (npm workspace)
├── package.json     # npm workspaces root (backend only)
└── README.md
```

## Tech stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Backend   | Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, JWT, bcrypt |
| Frontend  | React, TypeScript, Vite, Tailwind CSS, React Router, Axios        |
| Validation| Zod                                                                 |
| Security  | helmet, CORS, express-rate-limit                                  |

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the backend

Copy `server/.env.example` to `server/.env` and fill in the values:

```bash
cp server/.env.example server/.env
```

Required values: `DATABASE_URL`, `JWT_SECRET`, and the admin seed variables
(`ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### 3. Run migrations and seed

```bash
npm run migrate   # runs `prisma migrate dev` on the server
npm run seed      # seeds departments + first admin from env vars
```

### 4. Run the backend

```bash
npm run dev       # starts the API at http://localhost:5000
```

### 5. Run the frontend

```bash
npm run dev:frontend   # or `npm --prefix frontend run dev`
```

---

## Environment variables

See `server/.env.example` for the full list:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/school_attendance"
DATABASE_URL_TEST="postgresql://USER:PASSWORD@localhost:5432/school_attendance_test"
JWT_SECRET=""
JWT_EXPIRES_IN="7d"
PORT=5000
CLIENT_URL="http://localhost:5173"
NODE_ENV="development"
SCHOOL_NAME="My School"

# Attendance timing (24-hour HH:MM, server local time)
ATTENDANCE_START_TIME=07:30
LATE_AFTER_TIME=08:00

# First admin seed account (seed script only)
ADMIN_NAME="System Administrator"
ADMIN_EMAIL="admin@school.com"
ADMIN_PASSWORD=""
```

> Never commit `server/.env`.

## Commands

| Command          | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `npm run dev`    | Run the backend dev server                             |
| `npm run build`  | Compile the backend TypeScript                         |
| `npm run migrate`| Apply Prisma migrations                                |
| `npm run seed`   | Seed departments and the first admin                   |
| `npm test`       | Run backend tests (Jest + Supertest against test DB)   |
| `npm run lint`   | Lint the backend                                       |

---

## API overview

### Auth

| Method | Endpoint              | Access | Description                          |
| ------ | --------------------- | ------ | ------------------------------------ |
| POST   | `/api/auth/signup`    | Public | Create a PENDING STAFF account       |
| POST   | `/api/auth/login`     | Public | Log in, returns a JWT                |
| GET    | `/api/auth/me`        | Auth   | Return the current user              |

### Departments

| Method | Endpoint             | Access | Description       |
| ------ | -------------------- | ------ | ----------------- |
| GET    | `/api/departments`   | Public | List departments  |

### Attendance

| Method | Endpoint              | Access | Description                      |
| ------ | --------------------- | ------ | -------------------------------- |
| POST   | `/api/attendance`     | STAFF  | Submit today's attendance (once) |
| GET    | `/api/attendance/me`  | STAFF  | View own attendance history      |

### Admin

| Method | Endpoint                              | Access | Description                    |
| ------ | ------------------------------------- | ------ | ------------------------------ |
| GET    | `/api/admin/pending-users`            | ADMIN  | List pending staff             |
| PATCH  | `/api/admin/users/:id/approve`        | ADMIN  | Approve a staff account        |
| PATCH  | `/api/admin/users/:id/reject`         | ADMIN  | Reject a staff account         |
| GET    | `/api/admin/attendance`               | ADMIN  | List attendance (paginated)    |
| GET    | `/api/admin/dashboard/stats`          | ADMIN  | Dashboard statistics           |

### Attendance query parameters (admin)

`GET /api/admin/attendance` supports:
`date` (YYYY-MM-DD), `department` (id), `status` (PRESENT|LATE), `search`,
`page`, `limit`.

### Response format

Successful responses:

```json
{ "success": true, "message": "...", "data": { ... } }
```

Errors:

```json
{ "success": false, "message": "..." }
```

Passwords / password hashes are never returned to the client.

See `server/README.md` for detailed documentation.

---

## Deployment

Monorepo deployed from a single GitHub repository (`school-attendance-system`, branch `main`).

### Backend → Railway

- **Root directory:** `backend`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start` (runs `prisma migrate deploy` then `node dist/server.js`)
- **Health check:** `GET /api/health`
- Listens on `process.env.PORT` (Railway provides `PORT`).

Required Railway variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/school_attendance
JWT_SECRET=<long-random-string>
NODE_ENV=production
FRONTEND_URL=https://<your-vercel-app>.vercel.app
PORT=5000
```

Optionally set `SCHOOL_NAME`, geofence defaults, and `ADMIN_*` seed variables (seed only).

### Frontend → Vercel

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `dist` (`vercel.json` is included)
- **Environment variable:**

```env
VITE_API_URL=https://<your-railway-backend>.up.railway.app
```

### CORS

The backend only allows requests from `CLIENT_URL` and `FRONTEND_URL` (no wildcard). Set `FRONTEND_URL` to the exact deployed Vercel origin for production requests (including the credential-bearing device cookie) to be accepted.
