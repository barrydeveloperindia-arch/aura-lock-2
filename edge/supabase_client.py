import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://wdtizlzfsijikcejerwq.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY not found in environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
