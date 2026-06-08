import subprocess
import time
import sys
import re

PACKAGE = "com.auralock.terminal.v3"
UID_SHORT = "u0a507"
UID_LONG = "10507"

def run_adb(cmd):
    """Helper to run adb command and return stdout as string."""
    try:
        full_cmd = ["adb"] + cmd.split()
        res = subprocess.run(full_cmd, capture_output=True, text=True, check=True)
        return res.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error executing adb command '{cmd}': {e.stderr}", file=sys.stderr)
        return ""

def get_wakefulness():
    out = run_adb("shell dumpsys power")
    for line in out.splitlines():
        if "mWakefulness=" in line:
            return line.strip().split("=")[1]
    return "Unknown"

def reset_battery_mock():
    print("Resetting battery mocking on device...")
    run_adb("shell dumpsys battery reset")

def setup_battery_mock():
    print("Setting up battery mock (simulating discharging)...")
    run_adb("shell dumpsys battery set status 3")
    run_adb("shell dumpsys battery set ac 0")
    run_adb("shell dumpsys battery set usb 0")
    run_adb("shell dumpsys batterystats --reset")

def tap_checkin():
    # Tap at (300, 1350)
    print("Tapping CHECK IN button...")
    run_adb("shell input tap 300 1350")

def run_profile(profile_name, duration_seconds=60, active_scan=False, background_sleep=False):
    print("\n" + "="*50)
    print(f"STARTING BATTERY PROFILE: {profile_name}")
    print("="*50)
    
    # 1. Setup mock
    setup_battery_mock()
    time.sleep(2) # Let stats settle
    
    # Relaunch/ensure app state
    if background_sleep:
        print("Putting app in background and screen off...")
        run_adb("shell input keyevent 3") # Press Home
        time.sleep(2)
        run_adb("shell input keyevent KEYCODE_SLEEP") # Screen off
        time.sleep(2)
        print(f"Wakefulness state: {get_wakefulness()}")
    else:
        # Screen ON and app in foreground
        run_adb("shell input keyevent KEYCODE_WAKEUP")
        run_adb("shell input keyevent 82") # Unlock
        run_adb("shell input swipe 500 1500 500 500")
        run_adb(f"shell monkey -p {PACKAGE} -c android.intent.category.LAUNCHER 1")
        time.sleep(3)
        print(f"Wakefulness state: {get_wakefulness()}")
        if active_scan:
            tap_checkin()
            
    # 2. Countdown and actions
    print(f"Monitoring battery draw for {duration_seconds} seconds...")
    start_time = time.time()
    last_tap = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed >= duration_seconds:
            break
            
        # If active scan, we need to keep tapping Check In every 10 seconds to keep camera open
        if active_scan and (time.time() - last_tap) >= 10:
            tap_checkin()
            last_tap = time.time()
            
        sys.stdout.write(f"\rProgress: {int(elapsed)}/{duration_seconds} seconds elapsed...")
        sys.stdout.flush()
        time.sleep(1)
        
    print("\nDone monitoring. Dumping battery stats...")
    
    # 3. Read stats
    stats_out = run_adb(f"shell dumpsys batterystats {PACKAGE}")
    
    # Restore battery settings if we turned screen off
    if background_sleep:
        run_adb("shell input keyevent KEYCODE_WAKEUP")
        run_adb("shell input keyevent 82")
        run_adb("shell input swipe 500 1500 500 500")
        
    # Reset mock
    reset_battery_mock()
    
    # 4. Parse stats
    parse_results(profile_name, stats_out)

def parse_results(profile_name, out):
    print("\n" + "-"*40)
    print(f"RESULTS FOR PROFILE: {profile_name}")
    print("-"*40)
    
    lines = out.splitlines()
    
    # Section 1: Estimated Power Use
    estimated_drain = "0.0 mAh"
    cpu_drain = "0.0 mAh"
    wifi_drain = "0.0 mAh"
    sensor_drain = "0.0 mAh"
    
    found_power_use = False
    app_power_line = ""
    for line in lines:
        if "Estimated power use" in line:
            found_power_use = True
            continue
        if found_power_use:
            # We look for UID_SHORT (u0a507) or UID_LONG (10507) in the estimated power list
            if UID_SHORT in line or UID_LONG in line:
                app_power_line = line.strip()
                # Parse details e.g., "UID u0a507: 0.270 ( cpu=0.200 wifi=0.0654 )"
                m = re.search(r"UID\s+\w+:\s+([\d.]+)", line)
                if m:
                    estimated_drain = m.group(1) + " mAh"
                break
                
    if app_power_line:
        print(f"App UID Power Drain Line: {app_power_line}")
    else:
        print("Estimated power drain not explicitly listed (reverting to CPU time calculations or estimated as < 0.001 mAh)")
        
    # Section 2: CPU details for the UID
    cpu_time_user = "0ms"
    cpu_time_sys = "0ms"
    foreground_time = "0ms"
    active_process_info = []
    
    in_uid_section = False
    indent_level = 0
    
    for i, line in enumerate(lines):
        # Find the section starting with u0a507: or 10507:
        if line.strip().startswith(f"{UID_SHORT}:") or line.strip().startswith(f"{UID_LONG}:"):
            in_uid_section = True
            indent_level = len(line) - len(line.lstrip())
            continue
            
        if in_uid_section:
            # Check if we left the section (less or equal indentation than the start, or new UID section)
            current_indent = len(line) - len(line.lstrip())
            if current_indent <= indent_level and line.strip() and not line.strip().startswith(f"{UID_SHORT}"):
                # If we hit another UID or major section, we break
                if ":" in line and not any(x in line for x in [PACKAGE, "Sandboxed", "org.chromium"]):
                    in_uid_section = False
                    
            if in_uid_section:
                stripped = line.strip()
                if "Total cpu time:" in stripped:
                    # e.g., "Total cpu time: u=11s 910ms s=7s 465ms"
                    cpu_time_user = stripped
                elif "Foreground activities:" in stripped or "Foreground for:" in stripped:
                    foreground_time = stripped
                elif "Service" in stripped or "Process" in stripped:
                    active_process_info.append(stripped)
                    
    print(f"Foreground Duration: {foreground_time}")
    print(f"CPU Time Breakdown: {cpu_time_user}")
    if active_process_info:
        print("Active Services/Processes:")
        for p in active_process_info:
            print(f"  - {p}")
            
    # Compile a visual dictionary/log
    print(f"Summary: App consumed estimated {estimated_drain} during this 60s window.")

if __name__ == "__main__":
    # Run the three profiles
    run_profile("STANDBY MODE", duration_seconds=60, active_scan=False)
    time.sleep(5)
    run_profile("ACTIVE FACE SCAN MODE", duration_seconds=60, active_scan=True)
    time.sleep(5)
    run_profile("BACKGROUND SLEEP MODE", duration_seconds=60, background_sleep=True)
