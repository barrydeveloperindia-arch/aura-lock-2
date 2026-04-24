import os
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/smart_door_lock")
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)
db = client.smart_door_lock

# Collections
users_collection = db.users
logs_collection = db.access_logs
