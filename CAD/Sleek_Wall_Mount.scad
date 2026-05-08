// Sleek Wall Mount - AuraLock Enterprise
// Mimics the premium "floating" tablet aesthetic with rounded bezels

$fn = 100; // High resolution for smooth curves

// Dimensions (Scaled for the Samsung A32 / 5" Display)
screen_w = 145;
screen_h = 70;
bezel_thickness = 18;  // Thick, premium-looking bezels
corner_radius = 12;    // Smooth, Apple-like rounded corners

overall_w = screen_w + (bezel_thickness * 2);
overall_h = screen_h + (bezel_thickness * 2);

// Depth profile
bezel_depth = 6;        // Thin front plate
shadow_gap_depth = 22;  // The deep base that houses the ESP32 and Buck Converter
shadow_gap_inset = 25;  // How much smaller the base is to create the "floating" illusion

module rounded_rect(w, h, d, r) {
    hull() {
        translate([-w/2+r, -h/2+r, 0]) cylinder(r=r, h=d, center=true);
        translate([w/2-r, -h/2+r, 0]) cylinder(r=r, h=d, center=true);
        translate([-w/2+r, h/2-r, 0]) cylinder(r=r, h=d, center=true);
        translate([w/2-r, h/2-r, 0]) cylinder(r=r, h=d, center=true);
    }
}

module internal_mounts() {
    // M2.5 Standoffs for LM2596 Buck Converter (33mm x 11mm spacing)
    translate([45, 0, 0]) {
        for(x = [-16.5, 16.5]) {
            for(y = [-5.5, 5.5]) {
                translate([x, y, 1.5]) difference() {
                    cylinder(h=5, d=5, center=true); // Plastic Boss
                    cylinder(h=5.1, d=2.1, center=true); // M2.5 self-tapping pilot hole
                }
            }
        }
    }
    
    // Friction-fit rails for the ESP32 (52mm x 28mm)
    translate([-35, 0, 0]) {
        translate([0, 15, 2.5]) cube([54, 2, 5], center=true); // Top rail
        translate([0, -15, 2.5]) cube([54, 2, 5], center=true); // Bottom rail
    }
}

module sleek_enclosure() {
    // 1. The Front Bezel (The part the user sees)
    color("DarkSlateGray")
    translate([0, 0, shadow_gap_depth/2 + bezel_depth/2])
    difference() {
        // Outer bezel shape
        rounded_rect(overall_w, overall_h, bezel_depth, corner_radius);
        
        // Inner screen cutout (with a very slight 2mm rounding for the glass edge)
        rounded_rect(screen_w, screen_h, bezel_depth + 2, 2);
        
        // Debossed "ENGLABS" Logo on the bottom bezel
        translate([0, -overall_h/2 + bezel_thickness/2, bezel_depth/2 - 1])
            linear_extrude(height=2) // 1mm deep deboss into the 6mm plate
                text("ENGLABS", size=7, font="Arial:style=Bold", halign="center", valign="center");
    }
    
    // 2. The "Shadow Box" Base (The wall mount)
    // It is inset significantly from the edge so you can't see it from the front
    color("Black")
    translate([0, 0, 0])
    union() {
        difference() {
            // Solid block
            rounded_rect(overall_w - shadow_gap_inset, overall_h - shadow_gap_inset, shadow_gap_depth, corner_radius);
            
            // Hollow out the internal cavity for the ESP32, Buck Converter, and wiring
            translate([0, 0, 3]) // Leave a 3mm thick back-wall against the drywall
                // To maintain a constant 4mm wall thickness at the corners, the inner radius must be (outer_radius - 4)
                rounded_rect(overall_w - shadow_gap_inset - 8, overall_h - shadow_gap_inset - 8, shadow_gap_depth, corner_radius - 4);
                
            // Large center hole to snake the 12V wires through the drywall
            cylinder(r=15, h=shadow_gap_depth*3, center=true);
            
            // M4 Wall Mounting Screw Holes
            for(x = [-35, 35]) {
                for(y = [-25, 25]) {
                    translate([x, y, 0]) cylinder(r=2.5, h=shadow_gap_depth*3, center=true);
                }
            }
        }
        
        // Add the mechanical mounting posts to the inside floor
        translate([0, 0, -shadow_gap_depth/2 + 3]) internal_mounts();
    }
}

// Render the final assembly
sleek_enclosure();
