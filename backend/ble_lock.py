import sys
import asyncio
from bleak import BleakClient, BleakScanner

# ESP32 BLE Details
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

async def send_command(address, command):
    """Connects to the ESP32 and sends a command (ON/OFF)."""
    try:
        async with BleakClient(address, timeout=15.0) as client:
            if not client.is_connected:
                print(f"FAILED: Handshake failed with {address}")
                return False
            
            # Send command
            await client.write_gatt_char(CHARACTERISTIC_UUID, command.encode(), response=True)
            print(f"SUCCESS: {command} transmitted to {address}")
            return True
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

async def check_status(address):
    """Checks if the BLE device is advertising and reachable."""
    try:
        # Scan for specific address
        device = await BleakScanner.find_device_by_address(address, timeout=5.0)
        if device:
            print(f"ONLINE: {device.name} [{address}] is reachable")
            return True
        else:
            print(f"OFFLINE: Device {address} not found in airspace")
            return False
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

async def scan_devices():
    """Scans for nearby BLE devices and returns them as JSON."""
    try:
        devices = await BleakScanner.discover(timeout=5.0)
        result = []
        for d in devices:
            # Enriched data including connectable and updated RSSI
            result.append({
                "name": str(d.name) if d.name else "Unknown",
                "address": str(d.address),
                "rssi": getattr(d, 'rssi', -100),
                "connectable": getattr(d.details, 'connectable', True) if hasattr(d, 'details') else True
            })
        import json
        print(json.dumps(result))
        return True
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

async def check_adapter():
    """Checks if the Bluetooth adapter is available."""
    try:
        # A simple scan to check if the adapter works
        await BleakScanner.discover(timeout=1.0)
        print("ADAPTER_OK")
        return True
    except Exception as e:
        print(f"ADAPTER_ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ble_lock.py <COMMAND> [MAC_ADDRESS]")
        print("Commands: ON, OFF, STATUS, SCAN, ADAPTER")
        sys.exit(1)

    cmd = sys.argv[1].upper()
    
    if cmd == "SCAN":
        asyncio.run(scan_devices())
        sys.exit(0)
    elif cmd == "ADAPTER":
        asyncio.run(check_adapter())
        sys.exit(0)

    if len(sys.argv) < 3:
        print("Error: MAC address required for this command.")
        sys.exit(1)

    mac = sys.argv[2]

    if cmd == "STATUS":
        asyncio.run(check_status(mac))
    elif cmd in ["ON", "OFF"]:
        asyncio.run(send_command(mac, cmd))
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
