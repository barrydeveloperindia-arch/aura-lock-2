import unittest
from unittest.mock import patch, MagicMock
import main

class TestDoorLockSystem(unittest.TestCase):

    @patch('main.supabase')
    def test_fetch_employees(self, mock_supabase):
        # Setup mock behavior
        mock_response = MagicMock()
        mock_response.data = [{'id': '123', 'name': 'John Doe', 'face_embedding': [0.1, 0.2]}]
        mock_supabase.table.return_value.select.return_value.execute.return_value = mock_response

        # Run function
        employees = main.fetch_employees()
        
        # Verify
        self.assertEqual(len(employees), 1)
        self.assertEqual(employees[0]['name'], 'John Doe')

    @patch('main.requests.post')
    def test_unlock_door_success(self, mock_post):
        # Setup mock
        mock_post.return_value.status_code = 200

        # Run
        result = main.unlock_door()

        # Verify
        self.assertTrue(result)
        mock_post.assert_called_with(
            f"{main.ESP32_IP}/unlock",
            headers={"Authorization": f"Bearer {main.ESP32_SECRET}"},
            timeout=2
        )

    @patch('main.requests.post')
    def test_unlock_door_failure(self, mock_post):
        # Setup mock
        mock_post.return_value.status_code = 401

        # Run
        result = main.unlock_door()

        # Verify
        self.assertFalse(result)

if __name__ == '__main__':
    unittest.main()
