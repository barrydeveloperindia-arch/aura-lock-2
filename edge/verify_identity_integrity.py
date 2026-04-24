import asyncio
import numpy as np
import sys
from unittest.mock import MagicMock, patch, AsyncMock

# --- PROACTIVE AGGRESSIVE MOCKING ---
def create_mock_module(name, attrs=None):
    mock = MagicMock()
    if attrs:
        for attr, val in attrs.items():
            setattr(mock, attr, val)
    sys.modules[name] = mock
    return mock

# Setup mocks for all dependencies
create_mock_module("fastapi", {
    "FastAPI": MagicMock,
    "File": MagicMock,
    "UploadFile": MagicMock,
    "HTTPException": Exception,
    "Form": MagicMock
})
create_mock_module("fastapi.middleware.cors", {"CORSMiddleware": MagicMock})

# PIL needs special care: Image.open must exist
mock_image_class = MagicMock()
mock_image_class.open = MagicMock()
create_mock_module("PIL", {"Image": mock_image_class})

create_mock_module("face_recognition", {
    "face_locations": MagicMock(return_value=[]),
    "face_encodings": MagicMock(return_value=[]),
    "face_distance": MagicMock(return_value=np.array([]))
})
create_mock_module("supabase_client", {"supabase": MagicMock()})

# Now import the target module
import biometric_api

async def verify_identity_guard():
    print("Starting Identity Integrity Verification (Final Mock Pass)...")
    
    # Existing user in cache
    existing_user = {
        "name": "Shiv Kumar",
        "employee_id": "EMP-864896",
        "face_embedding": [0.1] * 128
    }
    
    # Patch the internal implementation details
    with patch('biometric_api.load_face_cache', return_value=[existing_user]), \
         patch('biometric_api.Image.open') as mock_img_open, \
         patch('biometric_api.np.array') as mock_np_array, \
         patch('biometric_api.face_recognition.face_locations', return_value=[(0,30,30,0)]), \
         patch('biometric_api.face_recognition.face_encodings', return_value=[np.array([0.1]*128)]), \
         patch('biometric_api.face_recognition.face_distance') as mock_dist:
        
        # Setup PIL and Numpy mocks to not crash
        mock_img_open.return_value.convert.return_value = MagicMock()
        mock_np_array.return_value = np.array([[0.1]*128]) # Frame
        
        # Mock UploadFile
        mock_file = MagicMock()
        mock_file.read = AsyncMock(return_value=b"fake_data")
        
        # Scenario 1: Conflict
        print("Testing: Duplicate Face Registration...")
        mock_dist.return_value = np.array([0.02]) # High similarity
        
        result = await biometric_api.register_face(
            employeeId="EMP-CONFLICT",
            email="test@test.com",
            name="Conflicting User",
            file=mock_file
        )
        
        if not result.get("success") and "already registered" in str(result.get("message")):
            print("PASS: System blocked duplicate enrollment.")
        else:
            print(f"FAIL: Unexpected result in conflict test: {result}")
            return False

        # Scenario 2: Unique
        print("Testing: Unique Face Registration...")
        mock_dist.return_value = np.array([0.6]) # Far match
        
        with patch('biometric_api.supabase') as mock_supa:
            mock_supa.storage.from_.return_value.upload.return_value = True
            mock_supa.table.return_value.upsert.return_value.execute.return_value = True
            
            result = await biometric_api.register_face(
                employeeId="EMP-UNIQUE",
                email="unique@test.com",
                name="New User",
                file=mock_file
            )
            
            if result.get("success"):
                print("PASS: System allowed unique enrollment.")
            else:
                print(f"FAIL: System blocked unique enrollment: {result}")
                return False

    print("\nAll Identity Verification Tests Passed!")
    return True

if __name__ == "__main__":
    try:
        if asyncio.run(verify_identity_guard()):
            sys.exit(0)
        else:
            sys.exit(1)
    except Exception as e:
        print(f"Test Runtime Error: {e}")
        sys.exit(1)
