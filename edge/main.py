import os
import time
import json
import requests
from supabase import create_client, Client
from datetime import datetime

# Configuration
SUPABASE_URL = "https://wdtizlzfsijikcejerwq.supabase.co"
SUPABASE_KEY = "sb_publishable_mMAzoDNSv_f4SHubPuVxUg_3Xr0KbzQ" # Placeholder from prompt
ESP32_IP = "http://192.168.1.100" # Placeholder
ESP32_SECRET = "my_secure_token"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_employees():
    """Fetch all employees and their embeddings."""
    try:
        response = supabase.table('employees').select("*").execute()
        return response.data
    except Exception as e:
        print(f"Error fetching employees: {e}")
        return []

def log_attempt(employee_id, status, confidence):
    """Log the access attempt to Supabase."""
    data = {
        "employee_id": employee_id,
        "status": status,
        "confidence": confidence,
        "device_id": "main_entrance_camera",
        "created_at": datetime.utcnow().isoformat()
    }
    try:
        supabase.table('access_logs').insert(data).execute()
        print(f"Logged: {status}")
    except Exception as e:
        print(f"Error logging attempt: {e}")

def unlock_door():
    """Send unlock signal to ESP32."""
    try:
        headers = {"Authorization": f"Bearer {ESP32_SECRET}"}
        # Timeout set to 2 seconds to avoid blocking
        response = requests.post(f"{ESP32_IP}/unlock", headers=headers, timeout=2)
        if response.status_code == 200:
            print("Door Unlocked successfully.")
            return True
        else:
            print(f"Failed to unlock door. Status: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error contacting ESP32: {e}")
        return False

def verify_face(known_employees, unknown_encoding):
    """
    Compare unknown encoding with known employees.
    Returns (employee_id, confidence) or (None, 0)
    """
    # This is a mock function since we can't run actual face_recognition in this env easily without dlib installed.
    # In production, use: face_recognition.compare_faces(known_encodings, unknown_encoding)
    
    # Mock Logic:
    print("Comparing faces...")
    return None, 0.0

if __name__ == "__main__":
    print("Starting Face Recognition System...")
    employees = fetch_employees()
    print(f"Loaded {len(employees)} employees.")
    
    # Main Loop (Simulation)
    try:
        while True:
            # logic to capture frame would go here
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping system.")
