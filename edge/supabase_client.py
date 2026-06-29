import os
from supabase import create_client, Client
from dotenv import load_dotenv

# --- Windows Unicode/Short-Path Workaround for dotenv path ---
def get_short_path(long_path):
    if os.name != 'nt':
        return long_path
    try:
        import ctypes
        from ctypes import wintypes
        buf = ctypes.create_unicode_buffer(260)
        func = ctypes.windll.kernel32.GetShortPathNameW
        func.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
        func.restype = wintypes.DWORD
        status = func(long_path, buf, 260)
        if status == 0 or status > 260:
            return long_path
        return buf.value
    except Exception:
        return long_path

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend', '.env')
env_path = get_short_path(env_path)
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://wdtizlzfsijikcejerwq.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY not found in environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
