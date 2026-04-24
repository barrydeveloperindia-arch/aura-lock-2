import pytest
import io
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from biometric_api import app
from PIL import Image

client = TestClient(app)

# ---------------------------------------------------------
# MOCKS
# ---------------------------------------------------------

@pytest.fixture
def mock_db():
    with patch("biometric_api.users_collection") as mock:
        yield mock

@pytest.fixture
def mock_face_rec():
    with patch("biometric_api.face_recognition") as mock:
        yield mock

# ---------------------------------------------------------
# UNIT TESTS (Logic & Validation)
# ---------------------------------------------------------

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "online"

def test_register_face_no_file(mock_db):
    response = client.post("/api/biometrics/face/register", data={"employeeId": "EMP001", "email": "test@test.com"})
    assert response.status_code == 422 # FastAPI validation error

# ---------------------------------------------------------
# MOCK TESTS (Hardware & Detection failure)
# ---------------------------------------------------------

def test_register_face_no_face_detected(mock_face_rec, mock_db):
    # Setup mock to return no faces
    mock_face_rec.face_locations.return_value = []
    
    # Create dummy image
    img = Image.new('RGB', (100, 100), color='red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    data = {"employeeId": "EMP001", "email": "test@test.com"}
    
    response = client.post("/api/biometrics/face/register", data=data, files=files)
    assert response.json()["success"] is False
    assert response.json()["message"] == "No face detected."

def test_register_face_multiple_faces(mock_face_rec, mock_db):
    # Setup mock to return 2 faces
    mock_face_rec.face_locations.return_value = [(0,0,10,10), (20,20,30,30)]
    
    img = Image.new('RGB', (100, 100), color='red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    data = {"employeeId": "EMP001", "email": "test@test.com"}
    
    response = client.post("/api/biometrics/face/register", data=data, files=files)
    assert response.json()["success"] is False
    assert "Multiple faces" in response.json()["message"]

# ---------------------------------------------------------
# E2E TESTS (Flow Simulation)
# ---------------------------------------------------------

def test_full_registration_success(mock_face_rec, mock_db):
    # Mock face logic
    mock_face_rec.face_locations.return_value = [(0,0,10,10)]
    mock_face_rec.face_encodings.return_value = [np.random.rand(128)]
    
    # Mock DB find
    mock_db.find_one.return_value = None # New user
    
    img = Image.new('RGB', (100, 100), color='green')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    data = {"employeeId": "EMP123", "email": "success@test.com"}
    
    response = client.post("/api/biometrics/face/register", data=data, files=files)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert mock_db.update_one.called

def test_verify_face_success(mock_face_rec, mock_db):
    # Mock live face
    mock_face_rec.face_locations.return_value = [(0,0,10,10)]
    mock_face_rec.face_encodings.return_value = [np.random.rand(128)]
    mock_face_rec.compare_faces.return_value = [True] # Match found
    
    # Mock DB cursor for users
    mock_user = {"_id": "123", "employeeId": "EMP123", "faceEncoding": [0.1]*128}
    mock_cursor = MagicMock()
    mock_cursor.to_list.return_value = [mock_user]
    mock_db.find.return_value = mock_cursor
    
    img = Image.new('RGB', (100, 100), color='blue')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    
    response = client.post("/api/biometrics/face/verify", files=files)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["user"]["employeeId"] == "EMP123"
