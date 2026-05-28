# AuraLock 2.0 - Smart Door Biometric System

A high-fidelity, professional biometric security system integrated with Google Cloud Run and Supabase.

## 📂 Project Structure

- **`backend/`**: Node.js Express server handling business logic, authentication, and database interactions.
- **`edge/`**: Python-based biometric engine (FastAPI) with Gemini Anti-Spoofing.
- **`admin-panel/`**: React/Vite dashboard for system administrators.
- **`frontend/`**: Main user-facing application.
- **`firmware/`**: IoT device firmware.
- **`supabase/`**: Database migrations and configuration.
- **`scripts/`**: Utility scripts for deployment, diagnostics, and system maintenance.
- **`docs/`**: Documentation and system assets.
- **`archives/`**: Backup archives and deployment zips.

## 🚀 Professional Workflow

### 1. Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase Account
- Google AI Studio API Key (for Gemini Liveness)

### 2. Setup
Copy `.env.example` to `.env` in the root (and subfolders if necessary) and fill in the required credentials.

### 3. Development
Run the following command to start all services concurrently:
```bash
npm run dev
```

### 4. Build & Deployment
To build the admin panel and serve it from the backend:
```bash
cd admin-panel && npm run build
# Move dist contents to backend/public/admin
```

## 🔐 Security Features
- **Gemini Anti-Spoofing**: Liveness detection using Gemini 1.5 Flash.
- **JWT Authentication**: Secure API access.
- **Rate Limiting**: Brute-force protection on authentication endpoints.

---
**Status:** ✅ Production Verified & Live in Mumbai.
