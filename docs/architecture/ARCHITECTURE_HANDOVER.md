# 🏗️ EngLabs Attendance Tracker (EAT) / AuraLock Architecture Handover (GCP Migration)

This document details the transition from local/Render-based hosting to a high-performance **Google Cloud Run** architecture in the Mumbai region, along with the recent rebranding, stabilization, and build releases for version v2.0.3.

## 📍 Deployment Overview
- **Project ID:** `auralock-system-2026`
- **Region:** `asia-south1` (Mumbai) - *Selected for low-latency door-lock response times in India.*
- **Platform:** Google Cloud Run (Fully Managed)

## 🧩 Component Architecture

### 1. Smart Door Biometric Engine (`smart-door-edge`)
- **Runtime:** Python 3.10 (FastAPI)
- **Hardening:**
    - Allocated **2GiB RAM** and **1 CPU** to ensure stable loading of the 128D face recognition models.
    - Docker build uses `CMAKE_BUILD_PARALLEL_LEVEL=1` to prevent Out-of-Memory (OOM) crashes during `dlib` compilation.
- **Liveness Detection (Gemini Anti-Spoofing):**
    - Every face match is cross-verified by Gemini 1.5 Flash to detect screen/photo spoofing before the door unlocks.

### 2. Smart Door Backend & Admin Dashboard (`smart-door-backend`)
- **Runtime:** Node.js 18+ (Express)
- **Dashboard Unification:**
    - The `admin-panel` (React/Vite) is pre-built into `backend/public` and served as static files by the Node.js server.
    - **Catch-all Routing:** All non-API requests are automatically routed to the React Single Page App (SPA).
- **Service Discovery:** Points to the production `smart-door-edge` URL via the `PYTHON_ENGINE_URL` environment variable.

## 🔐 Environment Variables (Managed in GCP Console)
| Name | Description |
| :--- | :--- |
| `GOOGLE_API_KEY` | Google AI Studio Key for Gemini Liveness. |
| `PYTHON_ENGINE_URL` | Permanent URL of the production Edge service. |
| `ADMIN_EMAIL` | `5089shivkumar@gmail.com` |
| `ADMIN_PASSWORD` | set in Cloud Run env (never commit) |
| `SUPABASE_URL` | Database endpoint. |

## 🛠️ Operational Notes for Successive Agents
- **Local Logs:** `.gitignore` excludes `logs/` and `backend/public/` to prevent repository bloat.
- **Re-building UI:** To update the dashboard, run `npm run build` in `admin-panel`, then move `dist/` contents to `backend/public/` before redeploying.
- **Port Mapping:** Edge listens on **8001**, Backend listens on **8000** (Cloud Run maps these automatically).

---
**Status:** ✅ Production Verified & Live in Mumbai.

## 🚀 V2 Enterprise Releases & Roadmap (7-Story / 100+ Person Scale)

Following the initial POC, the architecture has been upgraded and is being refactored for enterprise-scale multi-modal access:

### 1. Rebranding & Releases (v2.0.2 & v2.0.3)
- **EngLabs Attendance Tracker (EAT):** The system has been rebranded from AuraLock to EAT.
- **Production Build Frozen:** Recompiled and froze production APKs (v2.0.3) including `englabs-attendance-v2.0.3-20260607-1854-production.apk`.
- **Splash Screen Stabilization:** Solved white screen flash issue on Android by updating `styles.xml` launch splash theme settings (`android:windowBackground`).

### 2. Performance & UI Optimizations
- **Parallel Startup:** Optimized the initialization of the terminal app (`TerminalHome.jsx`) by parallelizing the BLE status check and biometric health check (no longer blocking sequentially during boot).
- **Logo Bezier Calibration:** Resolved logo curve path regression issues. Standardized the curves and established Vitest regression tests to prevent visual path changes in future builds.

### 3. Event Sourcing Attendance Model
- **Transition to Event-Driven:** Attendance logic is being refactored to rely purely on the immutable `access_logs` table.
- **Directional Context:** Two separate terminal apps will be deployed per entry/exit point. Each is configured with a unique `device_id` (e.g., `terminal_in` and `terminal_out`), allowing the backend to pair entry and exit timestamps to calculate exact office hours.

### 4. Edge-Cloud Hybrid Topology
- To mitigate Cloud Run costs and network latency for dozens of doors, the Python AI Engine (`smart-door-edge`) will be migrated to a local on-premise NUC/Server (The Building "Brain"). It will asynchronously sync logs and vectors up to Supabase to maintain global visibility without compromising door unlock speeds during local internet outages.

### 5. Backend Monolith Decomposition (Completed Phase)
- **MVC Architecture Shift:** Legacy `backend/server.js` monolith (~2,600 lines) was broken down into routes, controllers, and middleware:
  - JWT Authentication Middleware (`auth.js`)
  - Attendance Reporting & Analytics Controllers (`attendanceController.js`, `attendanceRoutes.js`)
  - Dashboard KPI Engine (`statsController.js`, `statsRoutes.js`)
- **Remaining Targets:** Employee CRUD logic, System Settings, and Terminal triggers.
- **Monolith Size reduction:** Reduced `server.js` from 2,600 to 1,178 lines.

### 6. Hardware Enclosure Prototyping
- **Photogrammetry CAD Generation:** Leverage Meshroom v2023.3.0 to convert physical skeletal hand models into 3D CAD assets for aesthetic enclosure testing.
- **Parametric Wall Mount:** The `Sleek_Wall_Mount.scad` design is finalized, featuring friction-fit internal mounting bosses and custom debossing for a premium finish.

### 7. Helper Utilities
- **Supabase Logs Reader:** Created a diagnostic script `scratch/read_supabase_logs.py` to easily fetch and inspect the latest 10 access logs directly from Supabase, detailing timestamps, employee IDs, authentication status, and device IDs.
