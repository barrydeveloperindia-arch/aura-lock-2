import pytest
import io
import numpy as np
from unittest.mock import patch, MagicMock, AsyncMock
from biometric_api import app, FACE_VECTORS, FACE_METADATA, verify_face
from fastapi import UploadFile
from PIL import Image
import json
import asyncio

@pytest.fixture
def mock_dependencies():
    with patch("deepface.DeepFace.represent", create=True) as mock_df, \
         patch("biometric_api.supabase") as mock_supabase, \
         patch("biometric_api.check_liveness") as mock_liveness:
        
        # Mock liveness
        mock_liveness.return_value = (True, "Live Human")
        
        yield mock_df, mock_supabase

def test_verify_face_with_mirror_fallback(mock_dependencies):
    mock_df, mock_supabase = mock_dependencies
    
    # 1. Setup in-memory cache with one employee
    import biometric_api
    original_vectors = biometric_api.FACE_VECTORS
    original_metadata = biometric_api.FACE_METADATA
    
    biometric_api.FACE_VECTORS = np.array([[1.0, 0.0, 0.0]]) # Dummy 3D vector for testing, though normally 128D
    biometric_api.FACE_METADATA = [{"employee_id": "EMP-012", "name": "Gaurav Panchal", "role": "employee"}]
    
    # 2. Setup mock DeepFace behavior
    # First call (original frame) returns an embedding that does NOT match (high distance)
    # Second call (mirrored frame) returns an embedding that DOES match (low distance)
    
    mock_df.side_effect = [
        [{"embedding": [0.0, 1.0, 0.0]}], # Original frame encoding
        [{"embedding": [1.0, 0.0, 0.0]}]  # Mirrored frame encoding
    ]
    
    # 3. Create dummy image payload
    img = Image.new('RGB', (100, 100), color='blue')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    
    # 4. Perform Verification
    mock_upload = MagicMock(spec=UploadFile)
    mock_upload.read = AsyncMock(return_value=img_byte_arr)
    
    response = asyncio.run(verify_face(mock_upload))
    
    # Restore cache
    biometric_api.FACE_VECTORS = original_vectors
    biometric_api.FACE_METADATA = original_metadata
    
    # 5. Assertions
    assert response["success"] is True, "Verification failed, mirror fallback was likely not triggered"
    assert response["employee_id"] == "EMP-012"
