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

## 🚀 V2 Enterprise Roadmap (7-Story / 100+ Person Scale)

Following the initial POC, the architecture is being refactored to support enterprise-scale multi-modal access:

### 1. Event Sourcing Attendance Model
- **Transitioning from "Rolling Check-Out" to Event-Driven:** The current `server.js` attendance logic is flawed for tracking lunch/breaks. It is being refactored to rely purely on the immutable `access_logs` table.
- **Directional Context:** Two separate terminal apps are deployed per entry/exit point. Each is configured with a unique `device_id` (e.g., `terminal_in` and `terminal_out`), allowing the backend to perfectly pair entry and exit timestamps to calculate exact office hours.

### 2. Multi-Modal Zones & RBAC
- **Lobby/Main Doors:** High-throughput Facial Recognition via the Android terminal apps.
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

## 🚀 V2 Enterprise Roadmap (7-Story / 100+ Person Scale)

Following the initial POC, the architecture is being refactored to support enterprise-scale multi-modal access:

### 1. Event Sourcing Attendance Model
- **Transitioning from "Rolling Check-Out" to Event-Driven:** The current `server.js` attendance logic is flawed for tracking lunch/breaks. It is being refactored to rely purely on the immutable `access_logs` table.
- **Directional Context:** Two separate terminal apps are deployed per entry/exit point. Each is configured with a unique `device_id` (e.g., `terminal_in` and `terminal_out`), allowing the backend to perfectly pair entry and exit timestamps to calculate exact office hours.

### 2. Multi-Modal Zones & RBAC
- **Lobby/Main Doors:** High-throughput Facial Recognition via the Android terminal apps.
- **Interior Doors & Server Rooms:** BYOD (Bring Your Own Device) NFC/BLE proximity unlocking from employee phones, plus physical ESP32 Fingerprint modules.
- **RBAC:** Implementing a strict Role-Based Access Control matrix to define which employees can open which interior doors at specific times.

### 3. Edge-Cloud Hybrid Topology
- To mitigate Cloud Run costs and network latency for dozens of doors, the Python AI Engine (`smart-door-edge`) will be migrated to a local on-premise NUC/Server (The Building "Brain"). It will asynchronously sync logs and vectors up to Supabase to maintain global visibility without compromising door unlock speeds during local internet outages.

### 4. Application Optimizations
- **Terminal Battery Saver:** Implementing "Tap-to-Scan" to prevent the constant 2-second polling interval from draining the Android tablet's battery.
- **Centralized Logging:** Deploying centralized logging (e.g. Datadog / Cloud Logging) to decouple and trace hardware/software events from the physical ESP32 firmware up to the Cloud.

### 5. Backend Monolith Decomposition (Ongoing)
- **MVC Architecture Shift:** The legacy `backend/server.js` monolith (~2,600 lines) is actively being broken down into `routes`, `controllers`, and `middleware`. 
- **Completed:** 
  - JWT Authentication Middleware (`auth.js`)
  - Attendance Reporting & Analytics Controllers (`attendanceController.js`, `attendanceRoutes.js`)
  - Dashboard KPI Engine (`statsController.js`, `statsRoutes.js`)
- **Remaining Targets:** Employee CRUD logic, System Settings, and Terminal triggers.
- **Current File Size:** Reduced `server.js` from 2,600 to 1,178 lines. Code compiles with zero syntax errors.

### 6. Hardware Enclosure Prototyping
- **Photogrammetry CAD Generation:** Currently leveraging Meshroom v2023.3.0 (Windows) to convert physical skeletal hand models into 3D CAD assets for aesthetic enclosure testing.
- **Parametric Wall Mount:** The `Sleek_Wall_Mount.scad` design is finalized, featuring friction-fit internal mounting bosses and custom debossing for a premium finish.
