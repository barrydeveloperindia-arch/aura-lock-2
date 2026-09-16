import pytest
import io
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import biometric_api
from biometric_api import app
from PIL import Image

client = TestClient(app)

def test_health_check_warming_and_ready():
    # When cache is empty -> 503 warming
    original_vectors = biometric_api.FACE_VECTORS
    biometric_api.FACE_VECTORS = np.array([])
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "warming"
    
    # When cache has embeddings -> 200 ready
    biometric_api.FACE_VECTORS = np.array([[0.1] * 128])
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["faces"] == 1
    
    # Restore
    biometric_api.FACE_VECTORS = original_vectors

def test_register_face_no_file():
    response = client.post("/api/biometrics/face/register", data={"employeeId": "EMP001", "email": "test@test.com"})
    assert response.status_code == 422 # FastAPI missing file validation error

def test_verify_face_no_file():
    response = client.post("/api/biometrics/face/verify")
    assert response.status_code == 422

def test_door_status_endpoint():
    response = client.get("/api/door/status")
    assert response.status_code == 200
    data = response.json()
    assert "online" in data
    assert "isLocked" in data
