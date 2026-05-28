# 🔒 Universal Anti-Theft Smartphone Enclosure Design

This document details a hardware design proposal for a secure, universal, and theft-resistant wall-mounted enclosure that hosts a smartphone (such as a Redmi phone) running the AuraLock terminal application.

---

## 1. The Design Challenge
To mount a standard smartphone at a doorway for public facial recognition/attendance, we must solve three conflicting requirements:
1. **Universal Compatibility:** Accommodate various phone models (Redmi, Samsung, iPhone) with differing aspect ratios, button layouts, and charging port locations (USB-C, Micro-USB, Lightning).
2. **High Security (Anti-Theft):** Prevent physical theft of the phone, unauthorized power disconnection, or access to physical buttons (power/volume) that could disrupt the application.
3. **Usability:** Keep the front-facing camera and screen completely visible and responsive, while allowing clean power routing.

---

## 2. Architectural Concept: "The Steel-Clamped Sandwich"

To avoid custom-printing a new faceplate for every single phone model, we propose a **two-piece adjustable clamping architecture**:

```
      [ Wall ]
         │
 ┌───────┴───────┐
 │               │  ◄─── 1. Heavy Duty Steel Backplate (Screwed to wall)
 │   ┌───────┐   │
 │   │ ESP32 │   │  ◄─── 2. Internal Electronics Cavity (Relay, Buck Converter)
 │   └───────┘   │
 │ ┌───────────┐ │
 ├─┤Smart Phone├─┤  ◄─── 3. Sliding Core Clamps (Adjusts to phone width/height)
 │ └───────────┘ │
 └───────┬───────┘
         │
 ┌───────┴───────┐
 │               │  ◄─── 4. Toughened Polycarbonate Faceplate
 └───────────────┘       (Only exposes screen/camera; covers buttons & ports)
```

### Key Mechanical Components:
1. **The Steel Backplate (Universal Base):**
   * A heavy-gauge sheet steel base plate anchored to the wall using tamper-resistant Torx security screws.
   * Houses the internal cavity for the ESP32 controller, LM2596 buck converter, and 5V relay.
2. **Dual-Axis Internal Clamping Engine:**
   * Uses two adjustable, spring-loaded steel slider bars inside the box.
   * The phone is placed in the center and the sliders are clamped down to its exact length and width, then locked in place with internal set screws. 
   * Rubberized grip pads on the clamps prevent scratching and absorb shock from door vibrations.
3. **The Secure Bezel Shield (Faceplate):**
   * A heavy-duty, impact-resistant matte black polycarbonate cover that attaches over the base.
   * It features a **"Window Cutout"** that exposes only the functional touchscreen area and the front-facing camera.
   * Crucially, the bezel extends over the outer borders of the phone, completely hiding physical volume and power buttons, and blocking access to the charging cable connector so it cannot be unplugged.

---

## 3. Detailed Security Measures

| Threat | Vulnerability Point | Hardware Mitigation Strategy |
| :--- | :--- | :--- |
| **Physical Theft** | Prying the enclosure off the wall or opening it. | • Tamper-resistant Torx security screws (pin-in-head) used for all external assembly.<br/>• Internal wall anchors that can only be unscrewed from *inside* the locked enclosure. |
| **Power Sabotage** | Unplugging the USB charging cable. | • **Internalized Cable Route:** The USB cable routes through a 90-degree right-angle adapter inside the locked housing directly into the backplate cavity, making the connector inaccessible from the outside. |
| **OS Interruption** | Pressing the Power or Volume buttons. | • **Recessed Edge Channels:** The enclosure frame encloses the phone edges. Buttons are physically blocked by the outer shell. A small paperclip pinhole can be drilled for administrators to hit the power button if needed. |
| **Heat/Swelling** | Constantly charging 24/7 in an enclosed space. | • **Ventilation Ports:** Angled louvers on the top and bottom of the casing allow passive heat dissipation without exposing internal wires to water or dust.<br/>• **Battery Delete (Optional):** Solder power directly to the phone motherboard to run battery-free, as outlined in the Samsung A32 blueprint. |

---

## 4. Universal Port & Charging Management
Since smartphones have charging ports on different sides, the backplate contains a **Universal Routing Channel**:

```
        ┌─────────────────────────┐
        │   Camera Cutout Slot    │
        ├─────────────────────────┤
        │                         │
        │      Phone Screen       │
        │                         │
  ◄─────┼── Routing channel ──────┼─────► (Allows routing right-angle USB
        │                         │      cables to the left, right, or bottom)
        └─────────────────────────┘
```
* **Wide-Slotted Base:** The bottom and side walls of the internal tray have rubber-grommeted routing slots.
* **Right-Angle Adapters:** By using ultra-low-profile right-angle USB-C/Lightning cables, the cable sits flush against the phone's edge, preventing it from protruding and widening the enclosure envelope.

---

## 5. Material & Prototyping Options
To build this, we can leverage two manufacturing methodologies:
1. **Hybrid MJF 3D Printing (HP Jet Fusion):**
   * Print the outer cover using **PA12 (Nylon)**. Nylon provides excellent flexibility for snap-fits, impact resistance against vandalism, and a premium matte finish.
2. **Sheet Metal + Acrylic (Rugged Industrial):**
   * Laser-cut a steel box chassis for structural strength, combined with a thick black acrylic faceplate to allow RF signals (Wi-Fi/Bluetooth) to pass through without metal interference.
