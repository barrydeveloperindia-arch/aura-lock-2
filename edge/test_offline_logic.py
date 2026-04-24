import json
import os
import unittest
import sys
from unittest.mock import MagicMock

# --- Robust Mocking of missing libraries ---
# This prevents ModuleNotFoundError during import of biometric_api
sys.modules['face_recognition'] = MagicMock()
sys.modules['PIL'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['cv2'] = MagicMock()
sys.modules['supabase'] = MagicMock()
sys.modules['supabase.client'] = MagicMock()
sys.modules['supabase_client'] = MagicMock()
sys.modules['fastapi'] = MagicMock()
sys.modules['fastapi.middleware.cors'] = MagicMock()

# --- Configuration for testing ---
CACHE_FILE = "face_cache.json"
PENDING_LOGS_FILE = "pending_logs.json"

class TestOfflineLogic(unittest.TestCase):
    def setUp(self):
        # Cleanup before tests
        if os.path.exists(CACHE_FILE): os.remove(CACHE_FILE)
        if os.path.exists(PENDING_LOGS_FILE): os.remove(PENDING_LOGS_FILE)

    def tearDown(self):
        # Cleanup after tests
        if os.path.exists(CACHE_FILE): os.remove(CACHE_FILE)
        if os.path.exists(PENDING_LOGS_FILE): os.remove(PENDING_LOGS_FILE)

    def test_cache_io(self):
        print("Testing Cache I/O Workflow...")
        # Import inside test to ensure mocks are active
        import biometric_api
        
        mock_data = [{"id": 1, "name": "Offline User", "employee_id": "OFFLINE_001"}]
        biometric_api.save_face_cache(mock_data)
        
        self.assertTrue(os.path.exists(CACHE_FILE))
        loaded = biometric_api.load_face_cache()
        self.assertEqual(loaded[0]["employee_id"], "OFFLINE_001")
        print("Cache I/O verified.")

    def test_log_queuing_logic(self):
        print("Testing Offline Log Queuing...")
        import biometric_api
        
        test_log = {"status": "success", "id": "emp_final_test"}
        biometric_api.queue_pending_log(test_log)
        
        self.assertTrue(os.path.exists(PENDING_LOGS_FILE))
        with open(PENDING_LOGS_FILE, "r") as f:
            logs = json.load(f)
        
        self.assertEqual(logs[0]["id"], "emp_final_test")
        print("Log Queuing verified.")

if __name__ == "__main__":
    unittest.main()
