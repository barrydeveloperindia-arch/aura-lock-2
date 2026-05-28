// AuraLock2 Universal Enclosure - TDD Parametric CAD
// Compile with OpenSCAD to generate .STL files

include <Englabs_Logo_Mesh.scad>

/* --- DIMENSIONAL CONSTRAINTS (THE TESTS) --- */
$fn = 60; // Curve resolution
wall_thickness = 3.0; // MJF PA12 minimum sturdy wall

// Universal Base Dimensions (Internal bounds)
base_width = 130;
base_height = 90;
base_depth = 25;

/* --- COMPONENT MOCKUPS (FOR TDD VISUALIZATION) --- */
module ESP32_Mockup() {
    color("black") cube([52, 28, 13], center=true);
}
module BuckConverter_Mockup() {
    color("blue") cube([43, 21, 14], center=true);
}
module Nothing_Phone_Mockup() {
    phone_l = 162.1;
    phone_w = 76.4;
    phone_t = 8.6;
    r = 8;
    
    // Sleek dark grey phone body (solid for rendering clarity)
    color([0.15, 0.15, 0.15])
        rounded_box(phone_w, phone_l, phone_t, r=r);
        
    // Black screen insert on front face
    translate([0, 0, 0.1])
        color([0.05, 0.05, 0.05])
            rounded_box(phone_w - 4, phone_l - 4, phone_t, r=r-1.5);
            
    // Glyph Interface LEDs on back face
    translate([0, 0, -phone_t/2 - 0.1]) {
        color("white") {
            // Central coil loop
            difference() {
                cylinder(h=0.2, d=36, $fn=60, center=true);
                cylinder(h=0.3, d=33, $fn=60, center=true);
                cube([6, 40, 1], center=true);
                cube([40, 6, 1], center=true);
            }
            // Diagonal slash top-right
            translate([phone_w/2 - 12, phone_l/2 - 15, 0])
                rotate([0, 0, -45]) cube([1.5, 12, 0.2], center=true);
            // Camera loop
            translate([-phone_w/2 + 14, phone_l/2 - 20, 0])
                difference() {
                    cylinder(h=0.2, d=16, $fn=30, center=true);
                    cylinder(h=0.3, d=13, $fn=30, center=true);
                    translate([-10, 0, -0.5]) cube([20, 20, 1.0]);
                }
            // Bottom vertical slash
            translate([0, -phone_l/2 + 25, 0])
                cube([1.5, 15, 0.2], center=true);
        }
        
        // Cameras
        translate([-phone_w/2 + 14, phone_l/2 - 20, 0]) {
            color([0.1, 0.1, 0.1]) {
                translate([0, 3.5, -0.2]) cylinder(h=0.5, d=4.5, $fn=20, center=true);
                translate([0, -3.5, -0.2]) cylinder(h=0.5, d=4.5, $fn=20, center=true);
            }
        }
    }
}
module LCD_5inch_Mockup() {
    color("grey") cube([121, 76, 4.5], center=true);
}

/* --- THE UNIVERSAL BACKPLATE (WALL MOUNT) --- */
module Universal_Backplate() {
    difference() {
        // Main Outer Box
        cube([base_width + (wall_thickness*2), base_height + (wall_thickness*2), base_depth], center=true);
        
        // Internal Cavity (Testing against bounding boxes)
        translate([0, 0, wall_thickness])
            cube([base_width, base_height, base_depth], center=true);
            
        // Wall Mounting Holes (VESA 75mm spacing for universal wall brackets)
        for (x = [-37.5, 37.5]) {
            for (y = [-37.5, 37.5]) {
                translate([x, y, -base_depth]) cylinder(h=base_depth*3, d=4.5, center=true);
            }
        }
        
        // Wire routing hole (Bottom)
        translate([0, -base_height/2 - wall_thickness, 0])
            cube([20, 10, 10], center=true);
    }
}

/* --- FACEPLATE 1B: PI ZERO + 5" SCREEN --- */
module Faceplate_1B_Pi() {
    difference() {
        // Faceplate base
        cube([base_width + (wall_thickness*2), base_height + (wall_thickness*2), wall_thickness], center=true);
        
        // LCD Active Area Cutout (108 x 64.8 mm)
        cube([108, 64.8, wall_thickness*3], center=true);
    }
    
    // M2.5 Standoffs for the LCD
    for (x = [-56.5, 56.5]) {
        for (y = [-34.0, 34.0]) {
            translate([x, y, wall_thickness/2]) cylinder(h=5, d=5);
        }
    }
}

/* --- FACEPLATE 1C: VESA iPAD MOUNT --- */
module Faceplate_1C_iPad() {
    difference() {
        // Faceplate base
        cube([base_width + (wall_thickness*2), base_height + (wall_thickness*2), wall_thickness], center=true);
        
        // VESA 75mm M4 Screw holes for iPad Bracket
        for (x = [-37.5, 37.5]) {
            for (y = [-37.5, 37.5]) {
                cylinder(h=wall_thickness*3, d=4.5, center=true);
            }
        }
    }
}

/* --- FACEPLATE_UNIVERSAL_PHONE: ANTI-THEFT SMARTPHONE ENCLOSURE --- */
// Fits phones from 130mm to 170mm long, and 65mm to 85mm wide.
module Faceplate_Universal_Phone(phone_l=162, phone_w=76, phone_t=9) {
    inner_cavity_l = 175;
    inner_cavity_w = 90;
    
    difference() {
        // 1. Faceplate Outer Box (covers base and creates internal phone tray)
        cube([inner_cavity_l + (wall_thickness*4), inner_cavity_w + (wall_thickness*4), phone_t + (wall_thickness*2)], center=true);
        
        // 2. Main Phone Pocket (Friction and slide clearance area)
        translate([0, 0, wall_thickness])
            cube([inner_cavity_l + 2, inner_cavity_w + 2, phone_t + 5], center=true);
            
        // 3. Screen & Camera Viewing Window (Exposes touchscreen, blocks bezels/buttons)
        // Standard window fits Redmi/Samsung (e.g. 145mm x 68mm active screen)
        cube([145, 68, (phone_t + wall_thickness*4)*2], center=true);
        
        // 4. Front Camera Slot (Centered at the top)
        translate([0, 42, 0])
            cube([20, 10, (phone_t + wall_thickness*4)*2], center=true);
            
        // 5. Sliding Clamp Screw Slots (Left and Right tracks to slide clamps inwards)
        for (x = [-inner_cavity_l/2 + 10, inner_cavity_l/2 - 10]) {
            for (y = [-20, 20]) {
                translate([x, y, 0])
                    cube([12, 4.5, 50], center=true); // M4 screw slide tracks
            }
        }
    }
}

// Adjustable Clamp (Printed separately, slides along tracks to lock the phone)
module Security_Clamp_Wing(phone_t=9) {
    difference() {
        union() {
            // Main clamp slider
            cube([25, 25, 4], center=true);
            // Raised bumper to hold the phone's edge
            translate([8, 0, (phone_t/2) + 2])
                cube([6, 25, phone_t], center=true);
        }
        // Adjustment screw hole
        translate([-4, 0, 0])
            cylinder(h=20, d=4.5, center=true);
    }
}

/* --- PRODUCTION-READY ERGONOMIC TWO-PIECE POS-STYLE SNAP-FIT ENCLOSURE (MJF OPTIMIZED) --- */

// Global design dimensions for the POS Enclosure
phone_l = 162;
phone_w = 76;
phone_t = 9;

tray_w = phone_w + 4;
tray_l = phone_l + 16; // Extra space for connectors
head_l = 50;
head_w = tray_w;
head_h = 35;
total_l = tray_l + head_l;

// Parting plane Z-height (Separation plane between bottom chassis and cover)
parting_z = 8.0;

// Rounded box helper for organic DFM profiles (rounded X-Y corners, flat Z parting surfaces)
module rounded_box(w, l, h, r=6) {
    hull() {
        for (x = [-w/2 + r, w/2 - r]) {
            for (y = [-l/2 + r, l/2 - r]) {
                translate([x, y, 0])
                    cylinder(h=h, r=r, center=true);
            }
        }
    }
}

// Cantilever Snap-Fit Hook Module (Optimized for flexible Nylon PA12 flexure)
module Snap_Hook(h=10, w=8, d=1.2, lip=1.0) {
    // Vertical cantilever arm
    translate([0, -d/2, -h/2])
        cube([w, d, h], center=true);
    // Outward facing hook lip at the bottom tip
    translate([0, 0, -h])
        rotate([0, 90, 0])
            linear_extrude(height=w, center=true)
                polygon(points=[[0,-d], [1.5,-d], [0, lip - d]]);
}

module POS_Backplate() {
    difference() {
        union() {
            // Main backing box with rounded corners (8mm high, Z-centered at 4mm)
            translate([0, 0, parting_z/2])
                rounded_box(tray_w + wall_thickness*4, total_l, parting_z, r=8);
                
            // 6 solid screw bosses inside the cavity (8mm high, Z-centered at 4mm)
            for (x = [-41.5, 41.5]) {
                for (y = [-104, 44, 104]) {
                    translate([x, y, parting_z/2])
                        cylinder(h=parting_z, d=7.5, center=true, $fn=30);
                }
            }
        }
        
        // --- HOLLOWING FOR ELECTRONICS & WIRING ---
        
        // 1. Hollow the main electronics head cavity (top section: Y > total_l/2 - head_l)
        translate([0, total_l/2 - head_l/2, parting_z/2 + wall_thickness/2])
            rounded_box(head_w + wall_thickness*2, head_l - wall_thickness*2, parting_z, r=5);
            
        // 2. Hollow the phone support bed (bottom section: Y < total_l/2 - head_l)
        translate([0, -total_l/2 + tray_l/2, parting_z/2 + wall_thickness/2])
            rounded_box(tray_w + wall_thickness*2, tray_l - wall_thickness*2, parting_z, r=5);
            
        // 3. Wire channel between compartments
        translate([0, -total_l/2 + tray_l, parting_z/2])
            cube([25, 20, parting_z + 2], center=true);
            
        // 4. Screw assembly clearance holes with counter-sinks (for mounting Cover to Backplate)
        for (x = [-41.5, 41.5]) {
            for (y = [-104, 44, 104]) {
                // Clearance hole (3.4mm diameter)
                translate([x, y, -1])
                    cylinder(h=parting_z + 2, d=3.4, $fn=30);
                // Counter-sink (6.0mm diameter, 2.5mm deep)
                translate([x, y, -0.1])
                    cylinder(h=2.5, d=6.0, $fn=30);
            }
        }
        
        // 5. VESA 75mm spacing wall-mounting screw holes
        for (y = [-37.5, 37.5]) {
            for (x = [-37.5, 37.5]) {
                translate([x, y - 20, -5])
                    cylinder(h=30, d=4.5);
            }
        }
        
        // 6. Cable feed-through port to the wall
        translate([0, total_l/2 - head_l/2, -5])
            cube([25, 20, 30], center=true);
            
        // 7. High-Efficiency Convection Ventilation Grille (Directly under ESP32 and Buck Converter)
        for (x = [-28 : 7 : 28]) {
            translate([x, 50, -5])
                cube([3.0, 45, 30], center=true);
        }
    }
}

module POS_Faceplate() {
    difference() {
        // 1. Organic outer wedge shell (continuous sweep from top hump to bottom tray)
        hull() {
            // Bottom block (height = 7mm, Z-centered at 11.5mm)
            translate([0, -total_l/2 + tray_l/2, parting_z + (15 - parting_z)/2])
                rounded_box(tray_w + wall_thickness*2, tray_l, 15 - parting_z, r=8);
                
            // Top block (height = 27mm, Z-centered at 21.5mm)
            translate([0, total_l/2 - head_l/2, parting_z + (35 - parting_z)/2])
                rounded_box(head_w + wall_thickness*2, head_l, 35 - parting_z, r=8);
        }
        
        // --- CUTOUTS & HOLLOWS ---
        
        // 1. Internal Phone Cavity (recessed from the underside of the faceplate)
        // Positioned at Z = 11mm to 20mm (9mm phone thickness)
        translate([0, -total_l/2 + tray_l/2, parting_z + wall_thickness + phone_t/2])
            rounded_box(phone_w + 2, phone_l + 2, phone_t + 1, r=4);
            
        // 2. Head electronics cavity (hollowed from underside Z=8 up to Z=32, leaving 3mm top wall)
        translate([0, total_l/2 - head_l/2, parting_z + (head_h - parting_z - wall_thickness)/2])
            rounded_box(head_w - wall_thickness*2, head_l - wall_thickness*2, head_h - parting_z - wall_thickness, r=4);
            
        // 3. Screen View window (Portrait: 68mm x 145mm)
        translate([0, -total_l/2 + tray_l/2, 0])
            rounded_box(68, 145, 100, r=4);
            
        // 4. Front camera slot (8mm diameter circle)
        translate([0, -total_l/2 + tray_l/2 + 145/2 + 8, 0])
            cylinder(h=100, d=8, center=true);
            
        // 5. Internal cable channel from phone compartment to electronics cavity
        translate([0, -total_l/2 + tray_l, parting_z + wall_thickness + phone_t/2])
            cube([25, 20, phone_t + 5], center=true);
            
        // 6. Security Pinhole for physical Power Button (1.8mm diameter on the right side)
        translate([tray_w/2 + wall_thickness, -total_l/2 + tray_l/2 + 30, parting_z + wall_thickness + phone_t/2])
            rotate([0, 90, 0])
                cylinder(h=20, d=1.8, center=true);
        
        // 7. Ventilation Slots (Top of the raised head)
        for (x = [-head_w/2 + 12, 0, head_w/2 - 12]) {
            translate([x, total_l/2 - 10, head_h - 2])
                cube([10, 4, 10], center=true);
        }
        
        // 8. Engraved Branding (Official Englabs Swirl Logo and Text) on top flat head surface
        // Logo (centered at Y = 93, Z = 34 to 36)
        translate([0, 93, 34])
            linear_extrude(height=2)
                scale(0.8)
                    Englabs_Logo_Swirl();
                    
        // Text: "ENGLABS" (centered at Y = 78, Z = 34 to 36)
        translate([0, 78, 34])
            linear_extrude(height=2)
                text("ENGLABS", size=6.0, font="Liberation Sans:style=Bold:Arial:style=Bold", halign="center", valign="center");
                        
        // Text: "AURA LOCK" (centered at Y = 66, Z = 34 to 36)
        translate([0, 66, 34])
            linear_extrude(height=2)
                text("AURA LOCK", size=4.0, font="Liberation Sans:style=Bold:Arial:style=Bold", halign="center", valign="center");
    }
    
    // --- INTEGRATED SCREW BOSSES (for M3 heat-set threaded inserts) ---
    for (x = [-41.5, 41.5]) {
        for (y = [-104, 44, 104]) {
            translate([x, y, parting_z])
                difference() {
                    cylinder(h=6.0, d=7.5, $fn=30);
                    translate([0, 0, -0.1])
                        cylinder(h=5.0, d=4.0, $fn=30); // pilot hole for M3 heat-set insert
                }
        }
    }
}

/* --- TDD ASSEMBLY (Uncomment the part you want to export as STL) --- */

// To export parts for 3D printing, uncomment one of these:
// POS_Backplate();
// POS_Faceplate();

// Test View: Exploded Assembly View for production confirmation
// Grey bottom chassis (Backplate)
color("dimgrey") POS_Backplate();

// Render internal components inside
translate([-18, 55, 6]) %ESP32_Mockup();
translate([18, 35, 6]) %BuckConverter_Mockup();

// Exploded floating Orange Faceplate (Z offset of 40mm)
translate([0, 0, 40]) color("darkorange") POS_Faceplate();

// Exploded floating Nothing Phone (2) with Glyph Interface showing (Z offset of 22mm, flipped to show back)
translate([0, -total_l/2 + tray_l/2, 22]) rotate([165, 0, 0]) Nothing_Phone_Mockup();





