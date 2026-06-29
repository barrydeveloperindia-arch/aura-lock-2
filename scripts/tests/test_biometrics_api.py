import requests
import os

def test_biometric_api():
    print("🚀 Testing Biometric API (Port 8000 - Node Fallback)...")
    
    # 1. Check Health
    try:
        health = requests.get("http://localhost:8000/", timeout=5)
        print(f"✅ Health Check: {health.json()}")
    except Exception as e:
        print(f"❌ API is OFFLINE: {e}")
        return

    # 2. Test Registration (Dry Run)
    print("\n📝 Testing Face Detection capability...")
    files = {'file': ('test.jpg', b'dummy_image_data', 'image/jpeg')}
    data = {'employeeId': 'TEST-USER', 'email': 'test@example.com'}
    
    try:
        response = requests.post("http://localhost:8000/api/biometrics/face/register", files=files, data=data)
        print(f"📡 API Response: {response.status_code}")
        result = response.json()
        print(f"✅ Result: {result.get('message')}")
        if result.get("encoding"):
            print(f"🧬 Received Mock Encoding (Size: {len(result['encoding'])})")
            
    except Exception as e:
        print(f"❌ Request failed: {e}")

if __name__ == "__main__":
    test_biometric_api()
