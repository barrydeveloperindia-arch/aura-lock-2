# 🏗️ AuraLock Architecture Handover (GCP Migration)

This document details the transition from local/Render-based hosting to a high-performance **Google Cloud Run** architecture in the Mumbai region.

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
- **New Feature:** **Gemini Anti-Spoofing (Liveness Detection)**.
    - Every face match is cross-verified by Gemini 1.5 Flash to detect screen/photo spoofing before the door unlocks.

### 2. Smart Door Backend & Admin Dashboard (`smart-door-backend`)
- **Runtime:** Node.js 18+ (Express)
- **Significant Architecture Change:** **Dashboard Unification**.
    - The `admin-panel` (React/Vite) is no longer a separate service.
    - It is pre-built into `backend/public` and served as static files by the Node.js server.
    - **Catch-all Routing:** All non-API requests are automatically routed to the React Single Page App (SPA).
- **Service Discovery:** Points to the production `smart-door-edge` URL via the `PYTHON_ENGINE_URL` environment variable.

## 🔐 Environment Variables (Managed in GCP Console)
| Name | Description |
| :--- | :--- |
| `GOOGLE_API_KEY` | Google AI Studio Key for Gemini Liveness. |
| `PYTHON_ENGINE_URL` | Permanent URL of the production Edge service. |
| `ADMIN_EMAIL` | `5089shivkumar@gmail.com` |
| `ADMIN_PASSWORD` | `Admin@123` |
| `SUPABASE_URL` | Database endpoint. |

## 🛠️ Operational Notes for Successive Agents
- **Local Logs:** `.gitignore` has been updated to exclude `logs/` and `backend/public/` to prevent repository bloat.
- **Re-building UI:** If the dashboard needs updates, run `npm run build` in `admin-panel`, then move `dist/` contents to `backend/public/` before redeploying.
- **Port Mapping:** Edge listens on **8001**, Backend listens on **8000** (Cloud Run maps these automatically).

---
**Status:** ✅ Production Verified & Live in Mumbai.
