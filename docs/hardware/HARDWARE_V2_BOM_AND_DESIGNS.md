# 🛠️ AuraLock V2 Hardware: Design Ideas & BOM

Moving to the Raspberry Pi + component ecosystem gives us complete freedom over the physical form factor. Here are five design concepts tailored for HP MJF manufacturing, followed by the Bill of Materials (BOM).

## 💡 Top 5 Enclosure Design Concepts

### 1. The Monolithic Slate (Minimalist & Flush)
![Concept 1: Monolithic Slate](file:///C:/Users/pc/.gemini/antigravity/brain/789fba3f-6280-4b49-b809-6a72890e7e87/concept_monolithic_slate_1778222432930.png)
A perfectly rectangular, vertical slab with zero protrusions. The 5-inch touchscreen is mounted completely flush with the front faceplate. Above the screen is a subtle 2mm pinhole for the camera. Below is the fingerprint sensor. The entire unit sits tight against the wall.
* **Vibe:** Apple-esque, high-end corporate office.

### 2. The Angled Operator Console (Ergonomic)
![Concept 2: Angled Operator Console](file:///C:/Users/pc/.gemini/antigravity/brain/789fba3f-6280-4b49-b809-6a72890e7e87/concept_angled_console_1778222449265.png)
The top half of the chassis sits flat against the wall, but the bottom half flares outward at a 15-degree angle. This tilts the touchscreen slightly upward, making it much easier for users of varying heights to read the screen and tap buttons without bending down.
* **Vibe:** Industrial, factory-floor terminal.

### 3. The "Pill" with LED Halo (Status-Driven)
![Concept 3: The Pill with LED Halo](file:///C:/Users/pc/.gemini/antigravity/brain/789fba3f-6280-4b49-b809-6a72890e7e87/concept_pill_halo_1778222464673.png)
A modern, rounded capsule shape (half-circles at the top and bottom). The standout feature is a recessed channel running around the entire perimeter of the screen. Inside this channel, a diffused RGB LED strip is mounted. It glows soft white when idle, flashes bright Green when unlocking, and Red on failure.
* **Vibe:** Futuristic, high-visibility.

### 4. The Dual-Lens "Owl" (High-Security)
![Concept 4: The Dual-Lens Owl](file:///C:/Users/pc/.gemini/antigravity/brain/789fba3f-6280-4b49-b809-6a72890e7e87/concept_dual_owl_1778222480473.png)
An imposing, ruggedized design featuring a prominent black bezel at the top housing *two* visible camera lenses (the standard RGB camera and a dummy/active IR sensor). The enclosure features visible Torx screws on the front and thicker bezels to convey maximum physical security.
* **Vibe:** Server room, banking, military.

### 5. The "Floating Glass" In-Wall (Architectural)
![Concept 5: The Floating Glass In-Wall](file:///C:/Users/pc/.gemini/antigravity/brain/789fba3f-6280-4b49-b809-6a72890e7e87/concept_floating_glass_1778222496388.png)
Instead of a box hanging *on* the wall, the chassis is designed to be recessed *into* a cutout in the drywall. The only thing visible to the user is a 5mm thick, over-sized faceplate that covers the hole, making the screen appear to be embedded directly into the architecture of the building.
* **Vibe:** Luxury real estate, custom architectural builds.

---

## 🛒 Bill of Materials (BOM) - Prototype Shopping List
Since direct supplier URLs frequently expire, use the exact search terms below on Indian electronic distributors like **Robocraze**, **Thingbits**, **Zbotic**, or **Amazon.in** to source these standard components.

| Item | Search Term / Description | Est. Cost (INR) |
| :--- | :--- | :--- |
| **Compute Board** | **"Raspberry Pi Zero 2 W"** or **"Raspberry Pi 3 Model A+"** (if Zero is out of stock). Runs Chromium Kiosk mode. | ₹1,500 |
| **Display** | **"Waveshare 5 inch Capacitive Touch Screen DSI"**. DSI uses a flat ribbon cable, saving internal space compared to HDMI. | ₹3,000 |
| **Vision** | **"5MP USB Camera Module PCB"** or **"Arducam OV5647"**. The bare PCB version mounts flush behind a tiny pinhole in the 3D print. | ₹1,200 |
| **Power** | **"LM2596 DC-DC Buck Converter"**. Splice the 12V lines from your Maglock into this to step the voltage down to a clean 5V. | ₹150 |
| **Cabling** | **"Right-Angle Micro-USB cable"**. Essential for tight clearance inside the 3D-printed enclosure. | ₹400 |
| **Cooling** | **"15x15mm Copper Heatsink Raspberry Pi"**. Prevents thermal throttling inside the closed plastic box. | ₹200 |

**Existing Components (Reused):**
*   **ESP32 Module:** Keeps handling the physical relay/Bluetooth.
*   **Relay Module:** Handles the high-voltage maglock trigger.
*   **Adafruit Fingerprint Sensor:** Mounts on the new faceplate.

**Total new hardware cost per door:** ~$75.00
