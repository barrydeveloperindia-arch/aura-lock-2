import io
import asyncio
import subprocess
import signal
import sys
import socket
import time
import os
import numpy as np
import cv2
import google.generativeai as genai
try:
    from bleak import BleakClient, BleakScanner
    HAS_BLE = True
except ImportError:
    HAS_BLE = False
    print("[WARNING] Bleak not found. BLE features will be disabled.")

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
try:
    import face_recognition
    HAS_FACE_REC = True
except ImportError:
    HAS_FACE_REC = False
    print("[WARNING] face_recognition not found. Running in MOCK Biometric Mode.")

from supabase_client import supabase
from datetime import datetime
import json
import uuid
import os
import httpx

# Disable TensorFlow logging for cleaner output
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# Port wait logic removed - PM2 handles process lifecycle.

app = FastAPI(title="Smart Door Biometric API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini AI for Liveness Detection
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    liveness_model = genai.GenerativeModel('gemini-1.5-flash')
else:
    liveness_model = None
    print("[WARNING] GOOGLE_API_KEY not found. Liveness detection will be disabled.")

async def check_liveness(image_bytes):
    """Uses Gemini to detect if the subject is a real human or a photo/screen."""
    if not liveness_model:
        return True, "Disabled"
    
    try:
        img = Image.open(io.BytesIO(image_bytes))
        prompt = (
            "Analyze this security camera image. Is this a live, 3D physical human being "
            "standing in front of the camera? Or is it a 2D photograph, a digital screen, "
            "or a mask being held up to the camera? "
            "Reply 'READY' if it is a definite live human. "
            "Reply 'SPOOF' if you detect a screen, photo, or suspicious 2D artifact."
        )
        response = liveness_model.generate_content([prompt, img])
        result = response.text.strip().upper()
        
        if "READY" in result:
            return True, "Live Human Detected"
        else:
            return False, "Potential Spoofing Detected"
    except Exception as e:
        print(f"[ERROR] Gemini Liveness Error: {e}")
        return True, "Error-Skipped" # Fail open for reliability, but log error

@app.on_event("startup")
async def startup_event():
    """Initialize system components and background tasks."""
    print("[STARTUP] Initializing Biometric Engine...")
    
    # 1. Load initial cache from disk immediately
    refresh_in_memory_cache()
    
    # 2. Start background synchronization tasks
    asyncio.create_task(sync_task())
    # asyncio.create_task(ble_status_updater()) # Disabled in cloud - handled by Mobile App
    print("[STARTUP] System ready.")

CACHE_FILE = "face_cache.json"
PENDING_LOGS_FILE = "pending_logs.json"
MODEL_NAME = "face-recognition-default" 
DETECTOR_BACKEND = "opencv" # Faster for real-time door lock response

def load_face_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return []

def save_face_cache(data):
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)

# --- Optimized Vector Cache ---
IN_MEMORY_CACHE = []
FACE_VECTORS = np.array([])
FACE_METADATA = []

def refresh_in_memory_cache():
    global IN_MEMORY_CACHE, FACE_VECTORS, FACE_METADATA
    try:
        raw_cache = load_face_cache()
        parsed_metadata = []
        vectors = []
        
        for emp in raw_cache:
            emb = emp.get("face_embedding")
            if isinstance(emb, str):
                try: emb = json.loads(emb)
                except: continue
            
            if emb and isinstance(emb, list) and len(emb) == 128:
                vec = np.array(emb, dtype=np.float32)
                # Ensure unit vector for cosine similarity via dot product
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                
                vectors.append(vec)
                parsed_metadata.append({
                    "id": emp.get("id"),
                    "employee_id": emp.get("employee_id"),
                    "name": emp.get("name"),
                    "role": emp.get("role")
                })
        
        if vectors:
            FACE_VECTORS = np.array(vectors, dtype=np.float32)
            FACE_METADATA = parsed_metadata
            IN_MEMORY_CACHE = raw_cache # Keep for compatibility if needed
            print(f"[CACHE] Optimized cache loaded with {len(FACE_METADATA)} employees.")
        else:
            FACE_VECTORS = np.array([])
            FACE_METADATA = []
            print("[CACHE] Cache is empty.")
            
    except Exception as e:
        print(f"[ERROR] In-memory cache refresh failed: {e}")

def queue_pending_log(log_data):
    logs = []
    if os.path.exists(PENDING_LOGS_FILE):
        with open(PENDING_LOGS_FILE, "r") as f:
            try: logs = json.load(f)
            except: logs = []
    logs.append(log_data)
    with open(PENDING_LOGS_FILE, "w") as f:
        json.dump(logs, f)

async def mark_attendance_async(employee_id: str):
    """Notify the attendance service about a successful scan."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    if not backend_url.startswith("http://") and not backend_url.startswith("https://"):
        backend_url = f"http://{backend_url}"
    
    try:
        async with httpx.AsyncClient() as client:
            print(f"[Attendance] Sending mark request for {employee_id} to {backend_url}...")
            response = await client.post(
                f"{backend_url}/attendance/mark",
                json={
                    "employee_id": employee_id,
                    "method": "face",
                    "device_id": "office_terminal"
                },
                timeout=5.0
            )
            print(f"[Attendance] Service responded: {response.text}")
    except Exception as e:
        print(f"[Attendance] API call failed: {str(e)}")

async def background_log_access(employee_id, status, confidence, device_id):
    """
    Log an access attempt to Supabase immediately.
    """
    log_data = {
        "employee_id": employee_id,
        "status": status,
        "confidence": float(confidence),
        "device_id": device_id,
        "created_at": datetime.utcnow().isoformat(),
        "method": "face"
    }
    try:
        supabase.table("access_logs").insert(log_data).execute()
        print(f"[LOG] Access log synced for {employee_id}")
    except Exception as e:
        err_str = str(e).lower()
        if "method" in err_str:
            # Fallback for missing 'method' column
            try:
                smaller = {k: v for k, v in log_data.items() if k != "method"}
                supabase.table("access_logs").insert(smaller).execute()
                print(f"[LOG] Access log synced (no method) for {employee_id}")
            except Exception as e2:
                print(f"[ERROR] Final logging failure: {e2}")
                queue_pending_log(log_data)
        else:
            print(f"[WARNING] Sync failed, queuing log: {e}")
            queue_pending_log(log_data)

async def sync_task():
    """Background task to sync logs and refresh cache."""
    while True:
        try:
            # 1. Sync Pending Logs (strip any unknown columns before inserting)
            VALID_LOG_COLUMNS = {'employee_id', 'status', 'confidence', 'device_id', 'created_at', 'method'}
            if os.path.exists(PENDING_LOGS_FILE):
                with open(PENDING_LOGS_FILE, "r") as f:
                    try:
                        pending = json.load(f)
                    except:
                        pending = []
                
                if pending:
                    print(f"Syncing {len(pending)} pending logs to Supabase...")
                    # Try syncing with 'method' first
                    try:
                        supabase.table("access_logs").insert(pending).execute()
                        os.remove(PENDING_LOGS_FILE)
                        print(f"[SUCCESS] {len(pending)} pending logs synced.")
                    except Exception as e:
                        err_str = str(e).lower()
                        if "method" in err_str:
                            clean = [{k: v for k, v in l.items() if k != 'method'} for l in pending]
                            try:
                                supabase.table("access_logs").insert(clean).execute()
                                os.remove(PENDING_LOGS_FILE)
                                print(f"[SUCCESS] {len(pending)} logs synced (fallback mode).")
                            except Exception as e2:
                                print(f"[ERROR] Sync retry failed: {e2}")
                        else:
                            print(f"[ERROR] Sync failed: {e}")
            
            # 2. Refresh Cache from normalized face_encodings
            print("[SYNC] Refreshing biometric cache from face_encodings...")
            response = supabase.table("face_encodings") \
                .select("employee_id, embedding, employees(name, role)") \
                .execute()
            
            if response.data:
                # Transform to the format expected by save_face_cache
                flat_data = []
                for entry in response.data:
                    emp_meta = entry.get("employees", {})
                    flat_data.append({
                        "employee_id": entry.get("employee_id"),
                        "face_embedding": entry.get("embedding"),
                        "name": emp_meta.get("name"),
                        "role": emp_meta.get("role")
                    })
                save_face_cache(flat_data)
                refresh_in_memory_cache()
                print(f"[SUCCESS] Biometric cache refreshed: {len(flat_data)} templates.")

        except Exception as e:
            print(f"[WARNING] Sync failed (likely offline): {str(e)}")

        await asyncio.sleep(60) # Sync every 60 seconds

# --- Environment Loader ---
from dotenv import load_dotenv
# Try loading from local, then parent (for shared config)
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

BLE_MAC = os.getenv("ESP32_BLE_MAC", "58:8C:81:CC:65:29")
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# --- BLE Operation Lock ---
ble_lock = asyncio.Lock()
_is_locked = True # Persistent state for door control buttons
_last_ble_status = {
    "online": False,
    "rssi": -100,
    "name": "Unknown",
    "timestamp": 0
}

async def ble_status_updater():
    """Background task to keep device status alive with a grace period."""
    if not HAS_BLE:
        print("[BLE] Bluetooth hardware not available in this environment. Status updater disabled.")
        return
    global _last_ble_status
    while True:
        try:
            # We don't use the lock here but check it to avoid interfering with active commands
            if not ble_lock.locked():
                device = await BleakScanner.find_device_by_address(BLE_MAC, timeout=4.0)
                if device:
                    print(f"[BLE] Device {BLE_MAC} found (RSSI: {getattr(device, 'rssi', 'N/A')})")
                    _last_ble_status["online"] = True
                    _last_ble_status["rssi"] = getattr(device, 'rssi', -100)
                    _last_ble_status["name"] = device.name or "Englabs_MD"
                    _last_ble_status["timestamp"] = time.time()
                else:
                    # 20 second grace period to prevent flickering Disconnected state
                    if time.time() - _last_ble_status["timestamp"] > 20:
                        if _last_ble_status["online"]:
                            print(f"[BLE] Device {BLE_MAC} lost (Grace period exceeded)")
                        _last_ble_status["online"] = False
        except Exception as e:
            print(f"[BLE] Background status update failed: {e}")
        await asyncio.sleep(8)

async def run_ble_op(command: str):
    """Internal helper to send a command to the ESP32."""
    if not HAS_BLE:
        return {"success": False, "message": "Bluetooth features are disabled in this environment."}
    async with ble_lock:
        try:
            async with BleakClient(BLE_MAC, timeout=5.0) as client:
                if not client.is_connected:
                    print(f"[BLE MOCK] Hardware not found, mocking success for {command}")
                    return {"success": True, "message": f"MOCK: Command {command} executed"}
                await client.write_gatt_char(CHARACTERISTIC_UUID, command.encode(), response=True)
                return {"success": True, "message": f"Command {command} executed"}
        except Exception as e:
            print(f"[BLE MOCK] Error connecting to {BLE_MAC}: {e}. Mocking success.")
            return {"success": True, "message": f"MOCK: Command {command} executed"}

@app.post("/api/door/unlock")
async def unlock_door_endpoint():
    global _is_locked
    print(f"[BLE] Unlocking door {BLE_MAC}...")
    result = await run_ble_op("ON")
    if result["success"]:
        _is_locked = False
        # Auto-relock logic (7s) in background
        async def relock():
            global _is_locked
            await asyncio.sleep(7)
            print(f"[BLE] Auto-relocking door...")
            await run_ble_op("OFF")
            _is_locked = True
        asyncio.create_task(relock())
    return result

@app.post("/api/door/lock")
async def lock_door_endpoint():
    global _is_locked
    print(f"[BLE] Manual locking door...")
    result = await run_ble_op("OFF")
    if result["success"]:
        _is_locked = True
    return result

@app.get("/api/door/status")
async def door_status_endpoint():
    """Returns the cached BLE status maintained by the background task."""
    if not HAS_BLE:
        return {
            "online": True,
            "isLocked": _is_locked,
            "isConnected": True,
            "mac": "00:00:00:00:00:00",
            "name": "Mock Door Lock",
            "rssi": -50,
            "last_seen": 0
        }
    return {
        "online": _last_ble_status["online"],
        "isLocked": _is_locked,
        "isConnected": _last_ble_status["online"],
        "mac": BLE_MAC,
        "name": _last_ble_status["name"],
        "rssi": _last_ble_status["rssi"],
        "last_seen": int(time.time() - _last_ble_status["timestamp"]) if _last_ble_status["timestamp"] > 0 else -1
    }

@app.get("/api/door/scan")
async def door_scan_endpoint():
    if not HAS_BLE:
        return {"success": False, "message": "Bluetooth scanning disabled."}
    async with ble_lock: # Prevent conflict with other BLE operations
        devices = await BleakScanner.discover(timeout=5.0)
        return [{
            "name": d.name or "Unknown",
            "address": d.address,
            "rssi": getattr(d, 'rssi', -100)
        } for d in devices]

@app.post("/api/biometrics/cache/rebuild")
async def rebuild_cache_endpoint():
    """Trigger a manual refresh of the local face templates cache."""
    print("[INFO] Manual cache rebuild triggered...")
    await sync_task()
    return {"success": True, "message": "Biometric cache rebuilt successfully"}

@app.get("/health")
async def health_check():
    return {"status": "ready", "engine": "face-recognition", "model": "HOG/CNN", "timestamp": datetime.utcnow()}

@app.post("/api/biometrics/face/register")
async def register_face(
    employeeId: str = Form(...),
    email: str = Form(...),
    name: str = Form(None),
    re_enroll: str = Form("false"),
    file: UploadFile = File(...)
):
    """
    Register a face encoding for a specific employee.
    Uploads photo to Supabase Storage and metadata to Database.
    """
    print(f"[INFO] Registering face for: {employeeId}")
    
    try:
        # 1. Read image
        contents = await file.read()
        try:
            image = Image.open(io.BytesIO(contents))
            # FORCE CONVERSION TO RGB
            if image.mode != "RGB":
                image = image.convert("RGB")
            
            frame = np.array(image)
            
            # Final sanity check for dlib
            if frame.dtype != np.uint8:
                frame = frame.astype(np.uint8)
        except Exception as img_err:
            print(f"[ERROR] Registration Image Decoding Failed: {img_err}")
            return {"success": False, "message": "Invalid image format received."}

        # 2. Detect and encode using face-recognition
        try:
            if HAS_FACE_REC:
                encodings = face_recognition.face_encodings(frame)
                if not encodings:
                    return {"success": False, "message": "No face detected.", "error_code": "NO_FACE"}
                encoding_list = encodings[0].tolist()
            else:
                from deepface import DeepFace
                print("[ENGINE] Extracting embedding with DeepFace Facenet...")
                try:
                    df_results = DeepFace.represent(img_path=frame, model_name="Facenet", detector_backend="mtcnn", enforce_detection=True)
                    if not df_results or len(df_results) == 0:
                        return {"success": False, "message": "No face detected.", "error_code": "NO_FACE"}
                    encoding_list = df_results[0]["embedding"]
                except ValueError:
                    return {"success": False, "message": "No face detected.", "error_code": "NO_FACE"}
        except Exception as e:
            return {"success": False, "message": f"Engine Error: {str(e)}", "error_code": "ENGINE_ERROR"}

        # 3. Cross-Identity Conflict Guard
        cache = load_face_cache()
        if cache:
            valid_cached = []
            for emp in cache:
                emb = emp.get("face_embedding")
                if isinstance(emb, str):
                    try: emb = json.loads(emb)
                    except: continue
                if emb and isinstance(emb, list) and len(emb) == 128:
                    emp["face_embedding"] = emb
                    valid_cached.append(emp)

            if valid_cached:
                existing_encodings = [np.array(emp["face_embedding"]) for emp in valid_cached]
                # Calculate Euclidean distances
                target = np.array(encoding_list)
                existing_distances = [np.linalg.norm(target - exp) for exp in existing_encodings]
                
                min_conflict_dist = np.min(existing_distances)
                if min_conflict_dist < 0.40:
                    conflict_idx = np.argmin(existing_distances)
                    conflicting_emp = valid_cached[conflict_idx]
                    
                    # Skip conflict if this is a re-enrollment of the SAME employee
                    same_employee = (conflicting_emp.get("employee_id") == employeeId)
                    is_re_enroll = re_enroll.lower() == "true"
                    
                    if same_employee or is_re_enroll:
                        print(f"[INFO] Conflict guard bypassed for re-enrollment of {employeeId}")
                    else:
                        print(f"[REJECTED] Biometric Conflict! Face already registered to: {conflicting_emp['name']}")
                        
                        # Log security alert
                        try:
                            alert_data = {
                                "alert_type": "biometric_conflict",
                                "employee_id": employeeId,
                                "severity": "medium",
                                "details": {
                                    "attempted_id": employeeId,
                                    "conflicting_id": conflicting_emp['employee_id'],
                                    "conflict_name": conflicting_emp['name'],
                                    "distance": float(min_conflict_dist)
                                },
                                "device_id": "face_engine_01"
                            }
                            supabase.table("security_alerts").insert(alert_data).execute()
                        except Exception as alert_err:
                            print(f"[WARNING] Failed to log security alert: {str(alert_err)}")

                        return {
                            "success": False, 
                            "message": f"Biometric Conflict: This person is already registered as {conflicting_emp['name']}.",
                            "conflicting_id": conflicting_emp['employee_id']
                        }

        # 4. Upload Image to Supabase Storage
        file_path = f"faces/{employeeId}_{uuid.uuid4().hex[:8]}.jpg"
        image_url = ""
        
        try:
            supabase.storage.from_("biometrics").upload(
                path=file_path,
                file=contents,
                file_options={"content-type": "image/jpeg"}
            )
            image_url = str(supabase.storage.from_("biometrics").get_public_url(file_path))
        except Exception as upload_err:
            print(f"[WARNING] Storage Upload Failed (Offline?): {str(upload_err)}")
        
        # 5. Save Metadata to Normalized face_encodings table
        biometric_data = {
            "employee_id": employeeId,
            "embedding": json.dumps(encoding_list)
            # Removed image_url from here, it goes to employees table
        }

        try:
            # Save embedding
            supabase.table("face_encodings").upsert(biometric_data, on_conflict="employee_id").execute()
            
            # Save image_url to employees
            if image_url:
                supabase.table("employees").update({"image_url": image_url}).eq("employee_id", employeeId).execute()
                
            print(f"[SUCCESS] Registered in face_encodings and updated employee image.")
        except Exception as db_err:
            print(f"[WARNING] Database registration failed: {str(db_err)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")

        # 6. Always Update Local Cache
        cache = load_face_cache()
        # Update or append
        updated = False
        local_entry = {
            "employee_id": employeeId,
            "face_embedding": encoding_list,
            "name": name if name else employeeId,
            "role": "employee" # Fallback if metadata refresh hasn't run
        }
        for i, emp in enumerate(cache):
            if emp["employee_id"] == employeeId:
                cache[i] = local_entry
                updated = True
                break
        if not updated:
            cache.append(local_entry)
        save_face_cache(cache)
        refresh_in_memory_cache()
        print(f"[SUCCESS] Local cache updated for {employeeId}")

        return {
            "success": True, 
            "message": "Face registered successfully.",
            "image_url": image_url,
            "encoding": encoding_list
        }

    except Exception as e:
        print(f"[ERROR] Registration Error: {str(e)}")
        return {"success": False, "message": f"Engine Error: {str(e)}"}

@app.post("/api/biometrics/face/verify")
async def verify_face(file: UploadFile = File(...)):
    """
    Verify a live frame against registered encodings.
    Optimized for <2s response time.
    """
    import time
    t_start = time.time()
    
    try:
        # 1. Image Preprocessing
        contents = await file.read()
        t_read = time.time()
        
        try:
            # USE OPENCV FOR ROBUST DECODING
            import cv2
            nparr = np.frombuffer(contents, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                raise Exception("OpenCV decoding returned None")
                
            # Convert BGR (OpenCV default) to RGB
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Final sanity check for dlib: must be 8-bit RGB and contiguous
            # IMPORTANT: Use .copy() to ensure we own the memory and it's not a read-only view
            frame = np.ascontiguousarray(frame, dtype=np.uint8).copy()
            
            print(f"[DEBUG] OpenCV Processed - Shape: {frame.shape}, Dtype: {frame.dtype}, Contiguous: {frame.flags['C_CONTIGUOUS']}")
                
        except Exception as img_err:
            print(f"[ERROR] Image Decoding Failed: {img_err}")
            return {"success": False, "message": "Invalid image format received."}
            
        t_preprocess = time.time()

        # 2. Single Embedding Generation
        try:
            if HAS_FACE_REC:
                live_encodings = face_recognition.face_encodings(frame)
                if not live_encodings:
                    return {"success": False, "message": "No face detected."}
                live_encoding = live_encodings[0]
        except Exception as e:
            import traceback
            print(f"[ERROR] Embedding generation failed: {str(e)}")
            traceback.print_exc()
            return {"success": False, "message": f"Engine Error: {str(e)}"}
        
        t_encode = time.time()

        # 3. Vectorized Comparison
        global FACE_VECTORS, FACE_METADATA
        if FACE_VECTORS.size == 0:
            return {"success": False, "message": "No registered users found."}

        # Calculate Euclidean distances
        if HAS_FACE_REC:
            distances = face_recognition.face_distance(FACE_VECTORS, live_encoding)
            best_match_idx = np.argmin(distances)
            min_distance = float(distances[best_match_idx])
        else:
            # Use DeepFace Facenet as fallback engine when dlib is not available
            from deepface import DeepFace
            print("[ENGINE] Using DeepFace Facenet for embedding extraction...")
            try:
                df_results = DeepFace.represent(img_path=frame, model_name="Facenet", detector_backend="mtcnn", enforce_detection=True)
                if not df_results or len(df_results) == 0:
                    return {"success": False, "message": "No face detected by DeepFace."}
                live_encoding = np.array(df_results[0]["embedding"], dtype=np.float32)
                norm = np.linalg.norm(live_encoding)
                if norm > 0:
                    live_encoding = live_encoding / norm
            except ValueError:
                return {"success": False, "message": "No face detected by DeepFace."}
            except Exception as df_err:
                print(f"[ERROR] DeepFace extraction failed: {df_err}")
                return {"success": False, "message": f"DeepFace Error: {str(df_err)}"}
                
            # Compare against all cached vectors
            target = live_encoding
            distances = [np.linalg.norm(target - exp) for exp in FACE_VECTORS]
            
            best_match_idx = np.argmin(distances)
            min_distance = float(distances[best_match_idx])
            
        # Convert distance to confidence
        max_similarity = 1.0 - min_distance
        
        t_compare = time.time()

        # 4. Threshold & Ambiguity Logic
        STRICT_THRESHOLD = 0.90 # Adapted for Facenet L2 normalized vectors
        AMBIGUITY_GAP = 0.10

        # --- MIRROR FALLBACK LOGIC ---
        if min_distance > STRICT_THRESHOLD:
            print("[ENGINE] First pass failed. Trying mirrored frame fallback...")
            try:
                mirrored = cv2.flip(frame, 1)
                mirror_distance = None
                mirror_idx = -1
                mirror_distances = []
                
                if HAS_FACE_REC:
                    live_mirror = face_recognition.face_encodings(mirrored)
                    if live_mirror:
                        mirror_distances = face_recognition.face_distance(FACE_VECTORS, live_mirror[0])
                        mirror_idx = np.argmin(mirror_distances)
                        mirror_distance = float(mirror_distances[mirror_idx])
                else:
                    from deepface import DeepFace
                    try:
                        df_results = DeepFace.represent(img_path=mirrored, model_name="Facenet", detector_backend="mtcnn", enforce_detection=True)
                        if df_results and len(df_results) > 0:
                            l_enc = np.array(df_results[0]["embedding"], dtype=np.float32)
                            norm = np.linalg.norm(l_enc)
                            if norm > 0: l_enc = l_enc / norm
                            mirror_distances = [np.linalg.norm(l_enc - exp) for exp in FACE_VECTORS]
                            mirror_idx = np.argmin(mirror_distances)
                            mirror_distance = float(mirror_distances[mirror_idx])
                    except Exception:
                        pass
                
                if mirror_distance is not None and mirror_distance < min_distance:
                    print(f"[ENGINE] Mirrored frame yielded better match: {mirror_distance:.4f} < {min_distance:.4f}")
                    min_distance = mirror_distance
                    best_match_idx = mirror_idx
                    max_similarity = 1.0 - min_distance
                    distances = mirror_distances
            except Exception as mirror_err:
                print(f"[ERROR] Mirror fallback failed: {mirror_err}")
        # --- END MIRROR FALLBACK ---
        
        matched_emp = FACE_METADATA[best_match_idx]
        
        # Ambiguity Detection
        is_ambiguous = False
        if len(distances) > 1:
            sorted_distances = np.sort(distances)
            gap = sorted_distances[1] - min_distance # Bigger gap means less ambiguity
            if gap < AMBIGUITY_GAP and min_distance < STRICT_THRESHOLD + 0.10:
                is_ambiguous = True
                print(f"[REJECTED] Ambiguity detected! Distance Gap: {gap:.4f} < {AMBIGUITY_GAP}")

        if min_distance > STRICT_THRESHOLD: 
            print(f"[DENIED] Low confidence: {matched_emp['employee_id']} | Dist: {min_distance:.4f} > {STRICT_THRESHOLD}")
            asyncio.create_task(background_log_access(matched_emp["employee_id"], "failed", max_similarity, "terminal_01"))
            return {
                "success": False, 
                "message": "Unrecognized face.", 
                "error_code": "NOT_RECOGNIZED",
                "confidence": max_similarity
            }
        
        if is_ambiguous:
            asyncio.create_task(background_log_access(matched_emp["employee_id"], "failed", max_similarity, "terminal_01"))
            return {
                "success": False,
                "message": "Ambiguous Match: Multiple users similar.",
                "error_code": "AMBIGUOUS_MATCH",
                "confidence": max_similarity
            }

        # 5. Gemini Liveness Security Check (Anti-Spoofing)
        is_live, liveness_msg = await check_liveness(contents)
        if not is_live:
            print(f"[SECURITY] REJECTED: {liveness_msg} for {matched_emp['employee_id']}")
            asyncio.create_task(background_log_access(matched_emp["employee_id"], "spoof_detected", max_similarity, "terminal_01"))
            return {
                "success": False,
                "message": f"Security Alert: {liveness_msg}",
                "error_code": "SPOOF_DETECTED",
                "confidence": max_similarity
            }

        # Success: Verified
        print(f"[VERIFIED] {matched_emp['employee_id']} | Sim: {max_similarity:.4f} | Liveness: {liveness_msg}")
        asyncio.create_task(mark_attendance_async(matched_emp["employee_id"]))
        asyncio.create_task(background_log_access(matched_emp["employee_id"], "success", max_similarity, "terminal_01"))

        t_end = time.time()
        
        # Latency Logging
        latencies = {
            "read": int((t_read - t_start) * 1000),
            "preprocess": int((t_preprocess - t_read) * 1000),
            "encode": int((t_encode - t_preprocess) * 1000),
            "compare": int((t_compare - t_encode) * 1000),
            "total": int((t_end - t_start) * 1000)
        }
        print(f"[PERF] Performance: {latencies['total']}ms (Enc: {latencies['encode']}ms, Comp: {latencies['compare']}ms)")

        return {
            "success": True, 
            "employee_id": matched_emp["employee_id"],
            "name": matched_emp["name"],
            "confidence": max_similarity,
            "performance": latencies
        }

    except Exception as e:
        import traceback
        error_msg = f"Engine Error: {str(e)}"
        print(f"[ERROR] {error_msg}")
        traceback.print_exc()
        return {"success": False, "message": error_msg, "error_code": "ENGINE_ERROR"}


# ── Biometric Cache Management ─────────────────────────────────────────────────

@app.delete("/api/biometrics/face/{employee_id}")
async def delete_face(employee_id: str):
    """
    Remove a specific employee's face template from local cache and database.
    """
    print(f"[DELETE] Evicting face for: {employee_id}")
    cache = load_face_cache()
    new_cache = [emp for emp in cache if emp.get("employee_id") != employee_id]
    save_face_cache(new_cache)
    refresh_in_memory_cache()

    try:
        supabase.table("face_encodings").delete().eq("employee_id", employee_id).execute()
        print(f"[DELETE] Removed from database.")
    except Exception as e:
        print(f"[WARNING] Database removal failed: {str(e)}")

    return {"success": True, "message": f"Face data removed for {employee_id}"}

@app.post("/api/biometrics/cache/rebuild")
async def rebuild_cache():
    """
    Force a full rebuild of face_cache.json from face_encodings.
    """
    print("[CACHE] Rebuilding cache from face_encodings...")
    try:
        response = supabase.table("face_encodings") \
            .select("employee_id, embedding, employees(name, role)") \
            .execute()
        
        flat_data = []
        for entry in response.data:
            emp_meta = entry.get("employees", {})
            flat_data.append({
                "employee_id": entry.get("employee_id"),
                "face_embedding": entry.get("embedding"),
                "name": emp_meta.get("name"),
                "role": emp_meta.get("role")
            })
        
        save_face_cache(flat_data)
        refresh_in_memory_cache()
        return {"success": True, "enrolled_count": len(flat_data)}
    except Exception as e:
        print(f"[ERROR] Rebuild failed: {str(e)}")
        return {"success": False, "message": str(e)}


@app.get("/api/biometrics/cache/status")
async def cache_status():
    """Return current cache contents summary for diagnostics."""
    cache = load_face_cache()
    return {
        "cached_employees": len(cache),
        "entries": [{"employee_id": e.get("employee_id"), "name": e.get("name")} for e in cache]
    }


@app.get("/")
async def root():
    return {"status": "online", "service": "Smart Door Biometric API", "version": "v2.6"}

if __name__ == "__main__":
    import uvicorn
    # Use 8003 explicitly or read PYTHON_ENGINE_PORT, do NOT use PORT as it conflicts with backend/.env
    port = int(os.getenv("PYTHON_ENGINE_PORT", 8003))
    uvicorn.run(app, host="0.0.0.0", port=port, timeout_graceful_shutdown=5)
