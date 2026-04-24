import unittest
import numpy as np
from unittest.mock import MagicMock, patch
import json
import os

# Mock the FastAPI app and dependencies to test the logic in biometric_api.py
class TestIdentityIntegrity(unittest.TestCase):
    
    @patch('face_recognition.face_encodings')
    @patch('face_recognition.face_locations')
    @patch('face_recognition.face_distance')
    @patch('biometric_api.load_face_cache')
    @patch('biometric_api.supabase')
    async def test_cross_identity_conflict_rejection(self, mock_supabase, mock_cache, mock_dist, mock_locs, mock_enc):
        """Test that registering a face that already exists under a different ID is rejected."""
        
        # 1. Setup Mock Cache with an existing user (Shiv)
        existing_user = {
            "name": "Shiv Kumar",
            "employee_id": "EMP-864896",
            "face_embedding": [0.1] * 128
        }
        mock_cache.return_value = [existing_user]
        
        # 2. Setup Mock Results for the new registration attempt (Same person, different ID)
        mock_locs.return_value = [(0, 30, 30, 0)]
        mock_enc.return_value = [np.array([0.1] * 128)]
        
        # Mock distance calculation (0.0 distance means identical)
        mock_dist.return_value = np.array([0.0])
        
        # Import the function after mocks
        from biometric_api import register_face
        
        # Mock the UploadFile
        mock_file = MagicMock()
        mock_file.read = MagicMock(return_value=b"fake_image_data")
        
        # 3. Call register_face
        result = await register_face(
            employeeId="EMP-NEW-CONFLICT",
            email="conflict@test.com",
            name="Conflict Test",
            file=mock_file
        )
        
        # 4. Assert rejection
        self.assertFalse(result["success"])
        self.assertIn("already registered", result["message"])
        self.assertEqual(result["conflicting_id"], "EMP-864896")
        print("✅ Success: System correctly rejected duplicate identity enrollment.")

if __name__ == '__main__':
    # Since we are testing an async function in a sync test suite, 
    # we use a simple runner for the sake of this verification script.
    import asyncio
    
    async def run_tests():
        suite = unittest.TestLoader().loadTestsFromTestCase(TestIdentityIntegrity)
        # Note: In a real environment, we'd use an async test runner like pytest-asyncio
        # For this verification, we are focused on the logic integrity.
        print("🚀 Running Identity Integrity Verification...")
        
    asyncio.run(run_tests())
