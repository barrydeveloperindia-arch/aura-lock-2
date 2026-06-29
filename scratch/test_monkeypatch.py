import sys
import os

# Get short path helper
def get_short_path(long_path):
    import ctypes
    from ctypes import wintypes
    buf = ctypes.create_unicode_buffer(260)
    # GetShortPathNameW
    func = ctypes.windll.kernel32.GetShortPathNameW
    func.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
    func.restype = wintypes.DWORD
    status = func(long_path, buf, 260)
    if status == 0 or status > 260:
        return long_path
    return buf.value

# Try to resolve the virtual environment path and get its short path
venv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../.venv'))
short_venv = get_short_path(venv_path)
print("Long venv:", repr(venv_path))
print("Short venv:", repr(short_venv))

# Let's monkeypatch face_recognition_models before it or face_recognition is loaded
import face_recognition_models

# Original functions
orig_pose_predictor = face_recognition_models.pose_predictor_model_location
orig_pose_predictor_5 = face_recognition_models.pose_predictor_five_point_model_location
orig_face_rec = face_recognition_models.face_recognition_model_location
orig_cnn = face_recognition_models.cnn_face_detector_model_location

# Wrap them to return the short path version
face_recognition_models.pose_predictor_model_location = lambda: get_short_path(orig_pose_predictor())
face_recognition_models.pose_predictor_five_point_model_location = lambda: get_short_path(orig_pose_predictor_5())
face_recognition_models.face_recognition_model_location = lambda: get_short_path(orig_face_rec())
face_recognition_models.cnn_face_detector_model_location = lambda: get_short_path(orig_cnn())

print("Monkeypatched model locations:")
print("Pose predictor:", repr(face_recognition_models.pose_predictor_model_location()))

try:
    import face_recognition
    print("✅ face_recognition imported successfully!")
except Exception as e:
    print("❌ Import failed:", e)
