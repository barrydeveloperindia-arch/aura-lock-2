// AuraLock2 Universal Enclosure - TDD Parametric CAD
// Compile with OpenSCAD to generate .STL files

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

/* --- TDD ASSEMBLY (Uncomment the part you want to export as STL) --- */

// 1. Export the Base
// Universal_Backplate();

// 2. Export the Pi Faceplate
// translate([0, 0, base_depth/2 + wall_thickness]) Faceplate_1B_Pi();

// 3. Export the iPad Faceplate
// translate([0, 0, base_depth/2 + wall_thickness]) Faceplate_1C_iPad();

// 4. Test View (See components inside base)
Universal_Backplate();
translate([-20, 20, 0]) ESP32_Mockup();
translate([25, -20, 0]) BuckConverter_Mockup();
%translate([0, 0, base_depth/2 + wall_thickness]) Faceplate_1B_Pi(); // Transparent overlay
