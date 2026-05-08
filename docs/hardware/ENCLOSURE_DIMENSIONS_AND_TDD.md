# 📐 Hardware TDD: Universal Enclosure Dimensions

To follow Test-Driven Development (TDD) for physical hardware, we define our physical constraints (our "tests") before we model the 3D geometry. If the final STL dimensions don't perfectly enclose these constraints, the test fails.

## The Architecture: "The Universal Backplate"
To seamlessly switch between **1B (5" Pi Screen)** and **1C (10" iPad)**, we must design a two-part system:
1.  **The Universal Base (Wall Mount):** Permanently screwed to the wall. Houses the ESP32, Buck Converter, and Relay. 
2.  **The Modular Faceplate (Snap-on):** 
    *   *Faceplate A:* Has standoffs for the Pi Zero and a cutout for the 5" screen.
    *   *Faceplate B:* Is entirely flat with a 75x75mm standard VESA mount layout to bolt an off-the-shelf iPad holder to it.

---

## 📏 Phase 1: The Dimensional "Tests"
Before generating STLs, here are the absolute dimensional constraints (Length x Width x Depth in mm) for each component.

### 1. Internal Power & Control (Goes in Universal Base)
| Component | L x W x H (mm) | Mounting Hole Spacing | Tolerances / Notes |
| :--- | :--- | :--- | :--- |
| **ESP32 NodeMCU** | 52.0 x 28.0 x 13.0 | N/A (Friction slot) | Add +2mm depth for wire headers |
| **LM2596 Buck Converter** | 43.0 x 21.0 x 14.0 | 33.0 x 11.0 (M3) | Add ventilation for heat dissipation |
| **5V Single Relay Module**| 43.0 x 17.0 x 19.0 | N/A (Friction slot) | Needs +5mm height clearance for screw terminals |

### 2. The 1B Faceplate (Pi + 5" Screen)
| Component | L x W x H (mm) | Mounting Hole Spacing | Tolerances / Notes |
| :--- | :--- | :--- | :--- |
| **Waveshare 5" DSI LCD** | 121.0 x 76.0 x 4.5 | 113.0 x 68.0 (M2.5) | Front bezel cutout must be exactly 108.0 x 64.8 (Active Area) |
| **Raspberry Pi Zero 2W** | 65.0 x 30.0 x 5.0 | 58.0 x 23.0 (M2.5) | Mounts directly to the back of the LCD standoffs |
| **Adafruit Fingerprint** | 45.0 x 20.0 x 18.0 | 20.0 (M2) | Usually mounted below the screen |

### 3. The 1C Faceplate (iPad VESA)
| Component | L x W x H (mm) | Mounting Hole Spacing | Tolerances / Notes |
| :--- | :--- | :--- | :--- |
| **VESA 75 Bracket** | 120.0 x 120.0 x 10.0| 75.0 x 75.0 (M4) | Center 4 holes drilled directly into the faceplate |

---

## ⚙️ Phase 2: Generating the STLs (Code-Driven CAD)
Because we are using TDD, we will not use a visual tool like Blender. We will use **OpenSCAD** (Code-Based CAD). 

By writing our CAD as code, we can define variables like `esp32_width = 28.0;` and write logic that automatically fails to compile if the enclosure walls intersect the component bounding boxes. 
