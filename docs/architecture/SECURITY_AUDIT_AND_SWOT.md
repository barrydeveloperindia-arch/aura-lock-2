# 🏗️ AuraLock2 - SWOT Analysis & Security Audit

This document captures the onboarding SWOT analysis and subsequent security audit of the AuraLock2 project, specifically focusing on the Google Cloud Run migration, edge biometrics, and ESP32 hardware interactions.

---

## Part 1: High-Level SWOT Analysis

### 💪 Strengths (What the project does well)
1. **Modern & Robust Tech Stack:** The system uses a highly capable stack: a Python FastAPI engine for AI/Biometrics, a Node.js (Express) backend, a React/Vite frontend admin panel, and Supabase for a scalable database.
2. **Advanced Security & Biometrics:** Features 128D facial recognition (via `dlib`) and notably integrates **Gemini 1.5 Flash for Liveness Detection** (Anti-spoofing). It also supports RFID and fingerprint modalities.
3. **Cloud-Native Scalability:** The project was migrated to Google Cloud Run in the Mumbai region (`asia-south1`), providing low-latency for Indian clients, automatic horizontal scaling, and zero server maintenance overhead.
4. **Unified Dashboard Delivery:** The React admin panel is elegantly bundled into the backend's static delivery (`backend/public/admin`), which simplifies the deployment pipeline and reduces hosting costs.

### 📉 Weaknesses (Areas for immediate improvement)
1. **High Resource Consumption:** The Python edge component (`smart-door-edge`) requires at least 2GiB of RAM and specific build constraints (`CMAKE_BUILD_PARALLEL_LEVEL=1`) to prevent Out-Of-Memory (OOM) crashes when compiling `dlib`. This can heavily inflate GCP billing.
2. **High Architectural Complexity:** The system is fragmented across multiple languages (Python, JavaScript, React, C++ for ESP32 firmware). This introduces a steep learning curve and high maintenance burden.
3. **Brittle Timezone Logic:** The Node.js backend contains custom, manual workarounds for converting UTC to IST for the daily stats dashboard. Manual timezone math without a dedicated library is prone to edge-case bugs.
4. **Hardware/Software Decoupling:** Debugging often requires tracing logs from the ESP32 firmware up to the FastAPI edge and Node.js backend, making root-cause analysis difficult.

### 🚀 Opportunities (Potential for growth)
1. **Enterprise HRMS Integration:** The robust attendance logging system can be integrated via webhooks into major HR platforms (like Zoho People, BambooHR, or Keka) to automate payroll based on physical check-ins.
2. **SaaS Monetization:** The multi-tenant architecture and Cloud Run scalability allow the project to be repackaged as a "Lock-as-a-Service" for coworking spaces and commercial offices.
3. **AI Model Optimization:** Transitioning to smaller, faster, locally-hosted edge AI models instead of relying purely on a cloud-based Gemini API could drastically reduce costs and unlock times.

### ⚠️ Threats (Risks to watch out for)
1. **Network Latency at the Physical Door:** The lock relies on cloud processing for facial recognition and liveness detection.
2. **AI False Positives/Negatives:** Relying on LLMs (Gemini) for liveness detection is experimental and could be fooled by lighting or unexpected clothing.
3. **Strict Privacy Compliance:** Handling and storing biometric data (facial encodings, access logs) falls under strict data protection laws.

---

## Part 2: Detailed Threat Strategy & Action Plan

Following the SWOT analysis, a deeper dive into the codebase revealed the following realities and actionable strategies for the identified threats.

### 1. Threat: Network Latency at the Physical Door
*   **The Concern:** If the internet drops or GCP responds slowly, will people be locked outside?
*   **The Reality (Code Audit):** Code analysis of `firmware/door_lock.ino` (the ESP32 physical lock firmware) reveals a built-in offline hardware fallback. The ESP32 is wired to an `Adafruit_Fingerprint` reader. Inside the main `loop()`, it constantly runs `checkFingerprint()`. Because the fingerprint processing happens locally on the ESP32 hardware, it completely bypasses the cloud.
*   **Strategy & Action:**
    *   **Actionable Step:** Enforce a protocol requiring every employee to register at least one fingerprint on the physical machine as a backup to their facial recognition profile. This fully mitigates the cloud latency risk.

### 2. Threat: AI False Positives/Negatives (Gemini Liveness)
*   **The Concern:** Will Gemini misclassify legitimate employees or accidentally let in a photo?
*   **The Reality (Code Audit):** Inspection of `check_liveness()` in `edge/biometric_api.py` shows it uses `gemini-1.5-flash` with a strict prompt distinguishing between "3D physical human being" and "2D photograph or screen". Crucially, there is a **"Fail-Open"** logic implemented: if the API request times out or fails, the function returns `True, "Error-Skipped"`. The system prioritizes access over security during an outage.
*   **Strategy & Action:**
    *   **Actionable Step 1:** Evaluate company policy to determine if "Fail-Open" (convenience) or "Fail-Closed" (high security) is preferred. If high-security is needed, modify line 84 in `biometric_api.py` to return `False`.
    *   **Actionable Step 2:** Execute the existing `test_face_accuracy.py` script against a dataset of photos displayed on phone screens to empirically test Gemini's false-positive rate.

### 3. Threat: Strict Privacy Compliance
*   **The Concern:** Are we handling biometric data securely enough to comply with data protection laws (e.g., India's DPDP Act)?
*   **The Reality (Code Audit):** The `register_face` endpoint in `biometric_api.py` contains a critical vulnerability.
    1.  Raw facial images are uploaded to Supabase storage, and the code retrieves them using `.get_public_url()`. This implies the `biometrics` storage bucket is set to Public.
    2.  Facial embeddings (128D vectors) are stored as plain-text JSON arrays in the Supabase `face_encodings` table.
*   **Strategy & Action:**
    *   **Actionable Step 1 (Immediate):** Modify the `biometrics` storage bucket in the Supabase dashboard from Public to Private. Refactor the backend code to use short-lived Signed URLs instead.
    *   **Actionable Step 2:** Implement application-level encryption in Python (e.g., using `cryptography.fernet`) before `json.dumps()` is called. This ensures that even in the event of a database breach, the biometric matrices remain mathematically unreadable.
