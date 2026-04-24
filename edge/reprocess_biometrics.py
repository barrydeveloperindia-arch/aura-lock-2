import io
import requests
import sys
from deepface import DeepFace
import numpy as np
from PIL import Image
from supabase_client import supabase
import os
from dotenv import load_dotenv

# Force UTF-8 encoding for Windows terminal
if sys.stdout.encoding != 'utf-8':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

# Disable TensorFlow logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

load_dotenv()

MODEL_NAME = "Facenet"
DETECTOR_BACKEND = "retinaface"

def reprocess_user(employee_id):
    """
    Fetches the image for a user, generates a REAL encoding using DeepFace, and updates the DB.
    """
    print(f"[PROCESS] Reprocessing biometrics for: {employee_id}")
    
    try:
        # 1. Fetch user metadata
        res = supabase.table("employees").select("image_url, name").eq("employee_id", employee_id).single().execute()
        if not res.data:
            print(f"[ERROR] User {employee_id} not found.")
            return False
        
        image_url = res.data.get("image_url")
        if not image_url:
            print(f"[ERROR] No image_url found for {employee_id}. Cannot reprocess.")
            return False
        
        print(f"[FETCH] Downloading image: {image_url}")
        
        # 2. Download image
        response = requests.get(image_url, timeout=10)
        if response.status_code != 200:
            print(f"[ERROR] Failed to download image. Status: {response.status_code}")
            return False
            
        # 3. Load into DeepFace
        image_bytes = io.BytesIO(response.content)
        image = Image.open(image_bytes).convert("RGB")
        frame = np.array(image)
        
        # 4. Detect and encode
        print(f"[AI] Running DeepFace AI Encoding ({MODEL_NAME})...")
        try:
            objs = DeepFace.represent(
                img_path = frame,
                model_name = MODEL_NAME,
                detector_backend = DETECTOR_BACKEND,
                enforce_detection = True,
                align = True,
                normalization = 'Facenet'
            )
            real_encoding = objs[0]["embedding"]
        except Exception as e:
            print(f"[ERROR] AI detection failed: {repr(e)}")
            return False
            
        # 5. Update Supabase
        print(f"[DB] Updating database with real encoding (128 dimensions)...")
        update_res = supabase.table("employees").update({
            "face_embedding": real_encoding
        }).eq("employee_id", employee_id).execute()
        
        print(f"[SUCCESS] User {employee_id} has been restored with a valid encoding.")
        return True
        
    except Exception as e:
        print(f"[FATAL] Error: {repr(e)}")
        return False

if __name__ == "__main__":
    # Reprocess Shiv Kumar specifically
    reprocess_user("EMP-961231")
