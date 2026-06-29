import requests
import io
import urllib.request

def test_registration():
    try:
        print("📥 Downloading sample face image...")
        url = "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/obama.jpg"
        response = urllib.request.urlopen(url)
        image_data = response.read()

        print("📡 Sending registration request to Biometric API...")
        files = {'file': ('obama.jpg', image_data, 'image/jpeg')}
        data = {
            'employeeId': 'TEST-OBAMA',
            'email': 'obama@example.com',
            'name': 'Barack Obama'
        }

        res = requests.post("http://localhost:8001/api/biometrics/face/register", files=files, data=data)
        
        print("\n=== RESPONSE ===")
        print(f"Status Code: {res.status_code}")
        try:
            json_res = res.json()
            print(f"Success: {json_res.get('success')}")
            print(f"Message: {json_res.get('message')}")
            if json_res.get('encoding'):
                print(f"Encoding Length: {len(json_res.get('encoding'))}")
        except Exception as e:
            print(f"Response Body: {res.text}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_registration()
