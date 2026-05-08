# 📋 AuraLock2 - Master Refactoring & Security Task List

This document serves as the master checklist for addressing technical debt, architectural improvements, and security vulnerabilities within the AuraLock2 ecosystem.

## 🔴 Priority 0: Critical Security & Compliance (Immediate Action Required)
These tasks address active vulnerabilities that expose the system to unauthorized access or severe data privacy breaches.

- [ ] **SEC-1: Remove Master Login Bypass**
  - **Location:** `backend/server.js` (around line ~416)
  - **Action:** Delete the hardcoded bypass that currently grants "Super Admin" access to any email/password combination. Re-enable proper JWT and bcrypt password validation.
- [ ] **SEC-2: Secure Supabase Biometrics Bucket**
  - **Location:** Supabase Dashboard & `edge/biometric_api.py`
  - **Action:** Change the `biometrics` storage bucket from "Public" to "Private". Refactor the image upload logic to generate and use short-lived Signed URLs instead of permanent public URLs.
- [ ] **SEC-3: Encrypt Biometric Encodings at Rest**
  - **Location:** `edge/biometric_api.py` (line ~531)
  - **Action:** Implement application-level encryption (e.g., Fernet) for the 128D facial vectors before `json.dumps()` so they are encrypted before being saved to the `face_encodings` database table.

## 🟠 Priority 1: High Priority Architectural Refactoring
These tasks untangle the monolithic structures, making the codebase maintainable and less prone to regression bugs.

- [ ] **ARCH-1: Backend Script Extraction**
  - **Location:** `backend/` root directory
  - **Action:** Move the 60+ scattered `check_*.js`, `test_*.js`, `migrate_*.js`, and `audit_*.js` files into a dedicated `backend/scripts/` folder to clean up the execution root.
- [ ] **ARCH-2: Dismantle `server.js` Monolith**
  - **Location:** `backend/server.js`
  - **Action:** Break the 2,700-line file into a structured MVC format:
    - `/src/routes/`
    - `/src/controllers/`
    - `/src/services/`
    - `/src/middlewares/`
- [ ] **ARCH-3: Setup Monorepo Workspace**
  - **Location:** Project Root `package.json`
  - **Action:** Configure `npm workspaces` (or Turborepo) to unify the dependencies and build commands across `backend`, `admin-panel`, `frontend`, and `terminal-app`.
- [ ] **ARCH-4: Terminal App Battery Optimization**
  - **Location:** `terminal-app/src/TerminalHome.jsx`
  - **Action:** Refactor the camera streaming and API polling logic. Currently, it keeps the camera constantly active and fires a POST request every 2 seconds (`setInterval(captureAndVerify, 2000)`). Transition to a "Tap to Scan" button or a motion-activated wake state to stop severe battery drain.
- [ ] **ARCH-5: Configurable Terminal ID (Directional Context)**
  - **Location:** `terminal-app/src/TerminalHome.jsx`
  - **Action:** Add a settings menu to allow configuring a unique `device_id` (e.g., `terminal_in` for the outside phone and `terminal_out` for the inside phone). Currently, all devices are hardcoded as `office_terminal`, making it impossible to determine the direction of access.
- [ ] **ARCH-6: Unified Hardware Enclosure Design (Pi Kiosk Migration)**
  - **Location:** Physical Infrastructure
  - **Action:** Design a commercial-grade MJF (PA12) enclosure based on **Concept 5: The "Floating Glass" In-Wall**. Instead of a costly Android phone, engineer the chassis to be recessed into the drywall and mount a cheap Raspberry Pi + 5" Touchscreen + USB Webcam module. This retains the exact React codebase (running in Chromium Kiosk Mode) while slashing hardware costs to ~$75 per door. Incorporate internal tunneling for the 12V maglock lines to a 5V buck converter.

## 🟡 Priority 2: Medium Priority Stability Improvements
These tasks improve the reliability and logic flow of the system.

- [ ] **STAB-1: Standardize Timezone Handling**
  - **Location:** `backend/server.js` (Stats API)
  - **Action:** Replace manual UTC-to-IST string manipulation math with a robust date-handling library (e.g., `date-fns-tz` or `luxon`) to prevent leap-year/midnight edge-case bugs.
- [ ] **STAB-2: Python Edge Service Modularization**
  - **Location:** `edge/biometric_api.py`
  - **Action:** Break the 800+ line Python script into smaller service modules: `services/vision.py`, `services/liveness.py`, and `services/ble_controller.py`.
- [ ] **STAB-3: Review Gemini "Fail-Open" Logic**
  - **Location:** `edge/biometric_api.py` (`check_liveness` function)
  - **Action:** Discuss with stakeholders whether a Gemini API timeout should grant access ("Fail-Open") or deny access ("Fail-Closed"). Adjust the exception block accordingly.
- [ ] **STAB-4: Centralize Hardware/Software Logging**
  - **Location:** `firmware/` and `backend/`
  - **Action:** Implement a unified remote logging solution (e.g., GCP Cloud Logging or Datadog). This solves the SWOT "Decoupling" threat where debugging a physical door failure currently requires pulling disjointed logs from the ESP32, Python Edge API, and Node.js backend manually.
- [ ] **STAB-5: Refactor Attendance to Event Sourcing Model**
  - **Location:** `backend/server.js` (Attendance Logic) & Supabase
  - **Action:** Replace the current "Rolling Check-Out" flaw with an Event Sourcing approach. Rely solely on the `access_logs` table to record scans immutably. Utilize the new `terminal_in` and `terminal_out` device IDs (from ARCH-5) to pair IN/OUT events dynamically, perfectly calculating total working hours while accounting for breaks and lunches.

## 🟢 Priority 3: Low Priority Organization & Cleanup
These tasks focus on workspace cleanliness and developer experience.

- [ ] **ORG-1: Root Directory Cleanup**
  - **Location:** Project Root
  - **Action:** Move all screenshots (`.png`) and `.md` files into a `docs/` folder. Move all `.bat` and `.ps1` files into a `scripts/` folder.
- [ ] **ORG-2: Frontend Deduplication Audit**
  - **Location:** `frontend/` vs `admin-panel/`
  - **Action:** Investigate the `frontend/` directory to determine if it is deprecated dead-code. If it is entirely superseded by `admin-panel/`, delete the folder to reduce maintenance overhead.
