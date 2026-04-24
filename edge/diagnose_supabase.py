import os
from supabase_client import supabase
from datetime import datetime
import uuid

def diagnose():
    print("🔍 Starting Supabase Diagnosis...")
    
    # 1. Check Connection
    try:
        print("📡 Testing Table Access (employees)...")
        res = supabase.table("employees").select("*").limit(1).execute()
        print(f"✅ Table Access Success: Found {len(res.data)} records.")
    except Exception as e:
        print(f"❌ Table Access Failed: {str(e)}")

    # 2. Check Storage
    try:
        print("📦 Testing Storage Access (biometrics bucket)...")
        buckets = supabase.storage.list_buckets()
        bucket_found = False
        for b in buckets:
            if b.name == "biometrics":
                bucket_found = True
                break
        
        if bucket_found:
            print("✅ Bucket 'biometrics' exists.")
            
            # Test upload
            print("📤 Testing dummy upload...")
            test_file_path = f"test_{uuid.uuid4().hex[:8]}.txt"
            test_content = b"This is a test upload from diagnosis script."
            
            up_res = supabase.storage.from_("biometrics").upload(
                path=test_file_path,
                file=test_content,
                file_options={"content-type": "text/plain"}
            )
            print(f"✅ Upload Success! Path: {test_file_path}")
            
            # Test Public URL
            print("🔗 Getting Public URL...")
            url = supabase.storage.from_("biometrics").get_public_url(test_file_path)
            print(f"✅ Public URL: {url}")
            
            # Cleanup
            print("🗑️ Cleaning up test file...")
            supabase.storage.from_("biometrics").remove([test_file_path])
            print("✅ Cleanup Success.")
            
        else:
            print("❌ Bucket 'biometrics' NOT found in Supabase project.")
            print("💡 Please create a 'biometrics' bucket in Supabase Storage with public access.")

    except Exception as e:
        print(f"❌ Storage Test Failed: {str(e)}")

if __name__ == "__main__":
    diagnose()
