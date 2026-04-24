from supabase_client import supabase
import sys

def verify():
    print("Checking EMP-961231 in Supabase...")
    res = supabase.table("employees").select("employee_id, name, face_embedding").eq("employee_id", "EMP-961231").single().execute()
    
    if not res.data:
        print("❌ User not found.")
        sys.exit(1)
        
    embedding = res.data.get("face_embedding")
    if embedding and isinstance(embedding, list) and len(embedding) == 128:
        print(f"[SUCCESS] {res.data['name']} has {len(embedding)} dims.")
    else:
        print(f"[ERROR] INVALID DATA: Len = {len(embedding) if embedding else 'None'}")
        sys.exit(1)

if __name__ == "__main__":
    verify()
