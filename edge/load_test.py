import asyncio
import httpx
import time
import io
from PIL import Image

API_URL = "http://localhost:8000"

async def simulate_request(client, request_id):
    """
    Simulate a single face verification request with a dummy image.
    """
    # Create a small dummy image
    img = Image.new('RGB', (100, 100), color='white')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()
    
    files = {"file": ("test.jpg", img_byte_arr, "image/jpeg")}
    
    start = time.time()
    try:
        response = await client.post(f"{API_URL}/api/biometrics/face/verify", files=files)
        latency = (time.time() - start) * 1000
        status = response.status_code
        print(f"Request {request_id}: Status {status}, Latency {latency:.2f}ms")
        return latency
    except Exception as e:
        print(f"Request {request_id} FAILED: {str(e)}")
        return None

async def run_crow_test(concurrency=10, total_requests=50):
    """
    Simulates high concurrent load on the Biometric API.
    """
    print(f"📦 Starting Crow Test: {concurrency} concurrent, {total_requests} total requests...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = []
        for i in range(total_requests):
            tasks.append(simulate_request(client, i))
            
            # Control concurrency
            if len(tasks) >= concurrency:
                await asyncio.gather(*tasks)
                tasks = []
        
        if tasks:
            results = await asyncio.gather(*tasks)
            
    print("\n✅ Crow Test Complete.")

if __name__ == "__main__":
    asyncio.run(run_crow_test(concurrency=5, total_requests=25))
