---
name: google-cloud-deploy
description: Specialized skill for deploying Smart Door Lock services to Google Cloud Run in asia-south1.
---
# Google Cloud Deploy Skill

This skill automates the deployment of the Smart Door Lock system to Google Cloud Run (Mumbai region).

## Prerequisites
- gcloud CLI installed and authenticated (`gcloud auth login`)
- Billing enabled for the project `auralock-system-2026`

## Deployment Commands

> **Preferred:** `.scriptsdeploy_backend.ps1 -Stage` then `-Promote` (reads env from backend.env, never commit real values here). The legacy commands below target the OLD smart-door-* services.

### 1. Deploy AI Engine (Edge)
```powershell
& "C:\Users\abrbh\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" run deploy smart-door-edge --source ./edge --platform managed --region asia-south1 --allow-unauthenticated --port 8001 --memory 2Gi --cpu 1 --timeout 600 --set-env-vars "SUPABASE_URL=https://wdtizlzfsijikcejerwq.supabase.co,SUPABASE_KEY=<SUPABASE_KEY from backend.env>,GOOGLE_API_KEY=<GOOGLE_API_KEY from backend.env>" --quiet
```

### 2. Deploy Backend
```powershell
& "C:\Users\abrbh\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" run deploy smart-door-backend --source ./backend --platform managed --region asia-south1 --allow-unauthenticated --port 8000 --memory 1Gi --cpu 1 --set-env-vars "ADMIN_EMAIL=5089shivkumar@gmail.com,ADMIN_PASSWORD=<ADMIN_PASSWORD>,JWT_SECRET=<JWT_SECRET>,SUPABASE_URL=https://wdtizlzfsijikcejerwq.supabase.co,SUPABASE_KEY=<SUPABASE_KEY from backend.env>" --quiet
```

## Logs and Monitoring
- View builds: `gcloud builds list`
- View service logs: `gcloud run logs read smart-door-edge`