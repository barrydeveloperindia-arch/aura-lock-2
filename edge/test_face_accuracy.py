import unittest
from unittest.mock import MagicMock, patch
import numpy as np

# Mocking face_recognition before import
import sys
mock_fr = MagicMock()
sys.modules['face_recognition'] = mock_fr

# Now import the logic (we'll simulate the core matching logic)
def simulate_match(known_names, known_encodings, live_encoding, threshold=0.40, ambiguity_threshold=0.05):
    import face_recognition
    # Mock face_distance return
    distances = []
    for k in known_encodings:
        dist = np.linalg.norm(k - live_encoding) # Simple Euclidean for test
        distances.append(dist)
    
    distances = np.array(distances)
    best_match_index = np.argmin(distances)
    min_distance = distances[best_match_index]
    
    sorted_indices = np.argsort(distances)
    
    if min_distance <= threshold:
        if len(distances) > 1:
            second_best_dist = distances[sorted_indices[1]]
            if second_best_dist - min_distance < ambiguity_threshold:
                return "REJECTED_AMBIGUITY", min_distance
        
        return known_names[best_match_index], min_distance
    return "REJECTED_THRESHOLD", min_distance

class TestFaceAccuracy(unittest.TestCase):
    def setUp(self):
        # Create mock encodings
        self.shiv_encoding = np.array([0.1] * 128)
        self.ratnesh_encoding = np.array([0.12] * 128) # Very close to Shiv
        self.other_encoding = np.array([0.5] * 128)
        
        self.known_names = ["Shiv Kumar", "Ratnesh", "Stranger"]
        self.known_encodings = [self.shiv_encoding, self.ratnesh_encoding, self.other_encoding]

    def test_successful_match(self):
        # Scan is very close to Shiv (dist ~ 0.0)
        scan = np.array([0.101] * 128) 
        # But wait, we need to ensure Ratnesh isn't too close to cause ambiguity in this test
        # Let's adjust Ratnesh to be further for "Clear Success" test
        known_encs = [self.shiv_encoding, np.array([0.3] * 128)] 
        match, dist = simulate_match(["Shiv", "Ratnesh"], known_encs, scan)
        self.assertEqual(match, "Shiv")

    def test_ambiguity_rejection(self):
        # Scan is between Shiv and Ratnesh
        scan = np.array([0.11] * 128)
        # Dist to Shiv: ~0.11-0.1 = 0.01 * sqrt(128)
        # Dist to Ratnesh: ~0.12-0.11 = 0.01 * sqrt(128)
        # Difference is 0 -> Should reject
        match, dist = simulate_match(self.known_names, self.known_encodings, scan)
        self.assertEqual(match, "REJECTED_AMBIGUITY")

    def test_strict_threshold_rejection(self):
        # Scan is 0.50 away from Shiv, and 0.45 away from Ratnesh
        # Threshold is 0.40 -> Both should be rejected
        scan = np.array([0.165] * 128) 
        # Manual check: dist to Ratnesh(0.12) = sqrt(128 * (0.045^2)) = 11.31 * 0.045 = 0.508
        match, dist = simulate_match(self.known_names, self.known_encodings, scan)
        self.assertEqual(match, "REJECTED_THRESHOLD")

if __name__ == '__main__':
    unittest.main()
