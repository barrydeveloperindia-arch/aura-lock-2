import requests
import os
import json
import time

API_URL = "http://localhost:8001"
CACHE_FILE = "face_cache.json"

def test_offline_verification():
    print("🧪 Testing Offline Face Recognition Fallback...")
    
    # 1. Ensure cache exists (simulate a previous sync)
    mock_employee = [{
        "id": "mock_id_123",
        "name": "Offline Tester",
        "employee_id": "TEST_001",
        "face_embedding": [0.1] * 128,
        "role": "employee"
    }]
    with open(CACHE_FILE, "w") as f:
        json.dump(mock_employee, f)
    
    print("✅ Local cache primed with 'Offline Tester'.")

    # 2. To test "Offline" mode without actually killing the internet, 
    # the server code already has the try-except block. 
    # If the server is running with an invalid key or URL, it will trigger 'offline' mode.
    
    print("📡 Sending verification request (Server should fall back to cache if it can't reach Supabase)...")
    
    # We need a dummy image file
    with open("dummy.jpg", "wb") as f:
        f.write(b"fake image data")

    try:
        # Note: This will likely fail on the face_recognition part if the image is truly fake,
        # but we are testing the FLOW of reaching the cache.
        files = {'file': ('dummy.jpg', open('dummy.jpg', 'rb'), 'image/jpeg')}
        response = requests.post(f"{API_URL}/api/biometrics/face/verify", files=files)
        
        data = response.json()
        print(f"📊 Response: {json.dumps(data, indent=2)}")
        
        if "offline" in data.get("message", "").lower():
            print("✨ SUCCESS: System correctly identified 'offline' mode.")
        else:
            print("ℹ️ Note: System might be 'online' if Supabase is reachable. Check server logs.")

    except Exception as e:
        print(f"❌ Test request failed: {e}")
    finally:
        if os.path.exists("dummy.jpg"): os.remove("dummy.jpg")

if __name__ == "__main__":
    test_offline_verification()
