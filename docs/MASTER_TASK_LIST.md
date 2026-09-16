# 📋 AuraLock2 - Master Refactoring & Security Task List

This document serves as the master checklist for addressing technical debt, architectural improvements, and security vulnerabilities within the AuraLock2 ecosystem.

---

## 📅 May 28 - September 16, 2026: Active & Hardening Tasks (Lock & Biometrics Focus)
- [x] **BLE-1: Implement BLE Connection Retry Loop** (Wrapped `BleClient.connect()` in a 3-attempt exponential backoff loop with 250ms/500ms delay in `terminal-app/src/TerminalHome.jsx` and verified with `BleResilience.test.jsx`).
- [x] **BLE-2: Auto-Disconnect Safety Guard** (Ensured `BleClient.disconnect(BLE_MAC)` executes inside `finally` blocks in `terminal-app/src/TerminalHome.jsx` to prevent leaving sessions hung).
- [x] **BIO-1: Calibrate Biometric Ambiguity Parameters** (Calibrated `AMBIGUITY_GAP` to 0.04 default in `edge/biometric_api.py` to prevent false positive ambiguity rejections).
- [ ] **SEC-1: Remove Master Login Bypass**
  - **Location**: `backend/server.js`
  - **Action**: Ensure JWT authentication is strictly enforced without hardcoded fallback credentials.
- [ ] **SEC-2: Secure Supabase Biometrics Bucket**
  - **Location**: Supabase Dashboard & `edge/biometric_api.py`
  - **Action**: Change the storage bucket configuration from Public to Private, and update upload/fetch logic to utilize short-lived Signed URLs.
- [x] **STAB-3: Strict Liveness Fail-Closed Option** (Added `FAIL_CLOSED_LIVENESS` environment toggle to `edge/biometric_api.py` to allow fail-closed security mode on Gemini API timeout or error).


---

## 📅 June 8, 2026: Completed Tasks (EAT Rebranding & Release v2.0.3)
- [x] **REBRAND-1: EngLabs Attendance Tracker (EAT) Rebranding** (Rebranded the application from AuraLock to EngLabs Attendance Tracker across the frontend, admin-panel, terminal app, and backend).
- [x] **LOGO-1: Logo Bezier Curves Fix** (Resolved logo curve path regressions in Sidebar/Login UI layouts and established Vitest regression tests).
- [x] **BOOT-1: Parallel System Startup** (Parallelized checkBle and checkBiometricHealth calls during system startup in TerminalHome.jsx to speed up terminal app boot time).
- [x] **SPLASH-1: Android Splash Screen Fix** (Updated launch splash theme settings in styles.xml to resolve white screen flash/glitches on launch).
- [x] **APK-2: Standardized APK Rebuild & Archiving v2.0.3** (Generated and froze v2.0.3 production build `englabs-attendance-v2.0.3-20260607-1854-production.apk` successfully).
- [x] **LOG-1: Supabase Logs Utility** (Created `scratch/read_supabase_logs.py` tool to view latest 10 access logs directly from Supabase).

## 📅 May 25, 2026: Completed Tasks
- [x] **BAT-1: Terminal App Camera Suspension Optimization** (Optimized battery drain by introducing a Tap-to-Wake scan mechanism and 15s auto-timeout for camera feed and face recognition polling).
- [ ] **BAT-2: ESP32 Lock Firmware Power Optimization** (Implement deep/light sleep, wake on GPIO touch/interrupt, set CPU clock to 80MHz, and enable WiFi Modem Sleep).
- [x] **APK-1: Standardized APK Rebuild & Archiving** (Generated production build `englabs-attendance-v1.0.0-20260525-1823-production.apk` successfully).
- [x] **QA-1: E2E Emulator Workflow Verification** (Installed APK in emulator, bypassed permission dialogues, validated CAMERA STANDBY/ACTIVE transitions, verified 15-second idle auto-suspend).

---

## 🔴 Priority 0: Critical Security & Compliance
These tasks address active vulnerabilities that expose the system to unauthorized access or severe data privacy breaches.

- [ ] **SEC-1: Remove Master Login Bypass** (Active)
- [ ] **SEC-2: Secure Supabase Biometrics Bucket** (Active)
- [ ] **SEC-3: Encrypt Biometric Encodings at Rest**
  - **Location**: `edge/biometric_api.py` (line ~531)
  - **Action**: Implement application-level encryption (e.g., Fernet) for the 128D facial vectors before `json.dumps()` so they are encrypted before being saved to the `face_encodings` database table.

---

## 🟠 Priority 1: High Priority Architectural Refactoring
These tasks untangle the monolithic structures, making the codebase maintainable and less prone to regression bugs.

- [ ] **ARCH-1: Backend Script Extraction**
  - **Location**: `backend/` root directory
  - **Action**: Move the 60+ scattered `check_*.js`, `test_*.js`, `migrate_*.js`, and `audit_*.js` files into a dedicated `backend/scripts/` folder to clean up the execution root.
- [ ] **ARCH-2: Dismantle `server.js` Monolith**
  - **Location**: `backend/server.js`
  - **Action**: Break the 2,700-line file into routes, controllers, services, and middlewares.
- [ ] **ARCH-3: Setup Monorepo Workspace**
  - **Location**: Project Root `package.json`
  - **Action**: Configure `npm workspaces` to unify dependencies and build commands across sub-projects.
- [x] **ARCH-4: Terminal App Battery Optimization** (Completed in BAT-1)
- [ ] **ARCH-5: Configurable Terminal ID (Directional Context)**
  - **Location**: `terminal-app/src/TerminalHome.jsx`
  - **Action**: Add a settings menu to configure a unique `device_id` (e.g., `terminal_in` vs `terminal_out`) to log access direction.
- [ ] **ARCH-6: Unified Hardware Enclosure Design (Pi Kiosk Migration)**
  - **Location**: Physical Infrastructure
  - **Action**: Design a commercial-grade PA12 enclosure for a recessed wall Raspberry Pi unit to reduce deployment hardware costs.

---

## 🟡 Priority 2: Medium Priority Stability Improvements
These tasks improve the reliability and logic flow of the system.

- [ ] **STAB-1: Standardize Timezone Handling**
  - **Location**: `backend/server.js` (Stats API)
  - **Action**: Replace manual UTC-to-IST string manipulation math with a robust date-handling library (e.g., `date-fns-tz` or `luxon`).
- [ ] **STAB-2: Python Edge Service Modularization**
  - **Location**: `edge/biometric_api.py`
  - **Action**: Break the 800+ line Python script into smaller service modules: `services/vision.py`, `services/liveness.py`, and `services/ble_controller.py`.
- [ ] **STAB-3: Review Gemini "Fail-Open" Logic** (Active)
- [ ] **STAB-4: Centralize Hardware/Software Logging**
  - **Location**: `firmware/` and `backend/`
  - **Action**: Implement a unified remote logging solution (e.g., GCP Cloud Logging or Datadog) to pull disjointed logs.
- [ ] **STAB-5: Refactor Attendance to Event Sourcing Model**
  - **Location**: `backend/server.js` (Attendance Logic) & Supabase
  - **Action**: Replace the current "Rolling Check-Out" flaw with an Event Sourcing approach. Rely solely on the `access_logs` table to record scans immutably. Utilize the new `terminal_in` and `terminal_out` device IDs (from ARCH-5) to pair IN/OUT events dynamically.
