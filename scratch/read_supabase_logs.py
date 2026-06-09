import sys
import os

# Ensure we can import from edge
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "edge"))

from supabase_client import supabase

def main():
    try:
        print("Fetching latest access logs from Supabase...")
        res = supabase.table("access_logs").select("*").order("created_at", desc=True).limit(10).execute()
        if res.data:
            print("\nLATEST 10 ACCESS LOGS:")
            print("-" * 120)
            print(f"{'Timestamp':<25} | {'Employee ID':<36} | {'Status':<10} | {'Method':<12} | {'Device':<15}")
            print("-" * 120)
            for log in res.data:
                print(f"{log.get('created_at', 'N/A'):<25} | {log.get('employee_id', 'N/A'):<36} | {log.get('status', 'N/A'):<10} | {log.get('method', 'N/A'):<12} | {log.get('device_id', 'N/A'):<15}")
        else:
            print("No access logs found in the table.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
