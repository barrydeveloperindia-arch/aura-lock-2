import requests
import io
from PIL import Image
import os
import sys

def verify_registration(employee_id="test_user_001", email="test@example.com"):
    print(f"🚀 Starting verification for {employee_id}...")
    
    # 1. Create a dummy face image
    # Note: face_recognition requires a real face to extract encodings.
    # For a real test, we'd need a sample face image.
    # I will create a simple RGB image, but if face_recognition fails,
    # it's because it's not a real face.
    
    img = Image.new('RGB', (100, 100), color='white')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()
    
    url = "http://localhost:8000/api/biometrics/face/register"
    files = {'file': ('test_face.jpg', img_byte_arr, 'image/jpeg')}
    data = {'employeeId': employee_id, 'email': email}
    
    print(f"📡 Sending request to {url}...")
    try:
        response = requests.post(url, files=files, data=data, timeout=30)
        
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get("success"):
                print("✅ Face registration successful!")
                print(f"🔗 Image URL: {res_json.get('image_url')}")
            else:
                print(f"❌ Registration rejected: {res_json.get('message')}")
                if res_json.get("error_code") == "NO_FACE":
                    print("💡 Note: The API is working, but it didn't find a face in the white dummy image.")
        else:
            print(f"❌ Server returned error {response.status_code}: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ CRITICAL: Could not connect to the Biometric API at localhost:8000.")
        print("💡 Please start the server first using: python biometric_api.py")
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}")

if __name__ == "__main__":
    verify_registration()
