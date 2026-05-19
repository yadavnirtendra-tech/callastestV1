# 🔒 Enterprise Calendar Synchronization Platform

> Private, enterprise-grade, real-time calendar synchronization between **Google Calendar** and **Microsoft Outlook/365**.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![Security](https://img.shields.io/badge/security-enterprise-green) ![Status](https://img.shields.io/badge/status-private-red)

## ⚡ Quick Start

### Prerequisites
- **Node.js** 20+ ([Download](https://nodejs.org/))
- **PostgreSQL** 14+ (already running on your machine)
- **Redis** 7+ (optional for dev — in-memory fallback available)

### 1. Create the Database

> ⚠️ This creates a NEW, SEPARATE database. Your existing databases are NOT touched.

```sql
-- Run in pgAdmin or psql:
CREATE DATABASE calendarsync_app;
```

### 2. Configure Environment

```bash
# Copy the template
cp .env.example .env

# Generate encryption key (run in Node.js):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Edit `.env` with your values:
- `DATABASE_URL` → your PostgreSQL connection string
- `ENCRYPTION_KEY` → the generated key above
- `JWT_SECRET` → the generated secret above
- `GOOGLE_CLIENT_ID/SECRET` → from Google Cloud Console
- `MICROSOFT_CLIENT_ID/SECRET` → from Azure Portal

### 3. Install & Run

```bash
# Install dependencies
npm install

# Generate Prisma client + run migrations
npm run db:generate
npm run db:migrate

# Start the server
npm run dev
```

### 4. Start Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
```

Dashboard available at: `http://localhost:3000`
API available at: `http://localhost:4400`

---

## 🔑 Getting API Keys

### Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add redirect URI: `http://localhost:4400/auth/google/callback`
7. Copy Client ID and Client Secret to `.env`

### Microsoft Graph API

1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. **New Registration**
3. Name: "CalendarSync Enterprise"
4. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
5. Redirect URI: `http://localhost:4400/auth/microsoft/callback` (Web)
6. Go to **Certificates & secrets** → **New client secret**
7. Go to **API Permissions** → Add:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `Mail.Send`
   - `offline_access`
8. Copy Application (client) ID, Client Secret, and Tenant ID to `.env`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard (Next.js)                  │
│                    http://localhost:3000                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ API Proxy
┌──────────────────────────▼──────────────────────────────────┐
│                     API Server (Express)                      │
│                    http://localhost:4400                       │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Auth    │  │ Sync Engine  │  │  Conflict Engine       │ │
│  │ (OAuth)   │  │ (Orchestrate)│  │  (Detect + Reject)     │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Google   │  │  Microsoft   │  │   Audit Logger         │ │
│  │Connector  │  │  Connector   │  │   (Immutable)          │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              PostgreSQL (calendarsync_app)                     │
│              ⚠️ Separate from your existing databases         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Features

| Protection | Implementation | Status |
|------------|---------------|--------|
| **SQL Injection** | Prisma ORM (parameterized queries) | ✅ |
| **XSS** | Helmet CSP + body sanitization | ✅ |
| **CSRF** | SameSite cookies + CSRF tokens | ✅ |
| **Clickjacking** | X-Frame-Options: DENY | ✅ |
| **Brute Force** | Rate limiting (100 req/15min) | ✅ |
| **Data Encryption** | AES-256-GCM (tokens at rest) | ✅ |
| **Search Indexing** | X-Robots-Tag: noindex | ✅ |
| **Social Engineering** | No public API, no info leakage | ✅ |
| **Token Security** | HttpOnly + Secure + SameSite cookies | ✅ |
| **MIME Sniffing** | X-Content-Type-Options: nosniff | ✅ |
| **Audit Trail** | Immutable append-only logs | ✅ |
| **Secret Protection** | Auto-redacted from all logs | ✅ |

---

## 📁 Database Safety

> **Your existing databases are 100% safe.**

- This app creates a **completely separate** database called `calendarsync_app`
- It uses **Prisma ORM** which prevents SQL injection by design
- Docker Compose runs PostgreSQL on **port 5433** (not 5432) to avoid conflicts
- All database operations use **parameterized queries** only
- No raw SQL is ever executed

---

## 📊 Features

- ✅ Two-way sync (Google ↔ Outlook)
- ✅ Loop prevention (fingerprint + idempotency)
- ✅ Conflict detection (checks BOTH calendars)
- ✅ Auto-rejection of conflicting invites
- ✅ Professional rejection emails
- ✅ Immutable audit logging
- ✅ Role-based access control (Admin/User/Viewer)
- ✅ Real-time webhook sync
- ✅ Company + personal email support
- ✅ AES-256-GCM token encryption
- ✅ Premium admin dashboard
- ✅ Docker + Kubernetes ready
