import re
import sys
from PIL import Image, ImageDraw

def parse_svg_path(svg_path_str):
    # Regex to find command letters and numbers
    tokens = re.findall(r'([MmLlCcZz])|(-?\d+\.?\d*)', svg_path_str)
    commands = []
    current_numbers = []
    
    for token in tokens:
        cmd, num = token
        if cmd:
            if current_numbers or cmd in ('Z', 'z'):
                commands.append((prev_cmd, current_numbers))
                current_numbers = []
            prev_cmd = cmd
            if cmd in ('Z', 'z'):
                commands.append((cmd, []))
        elif num:
            current_numbers.append(float(num))
            
    if current_numbers:
        commands.append((prev_cmd, current_numbers))
        
    return commands

def bezier_point(p0, p1, p2, p3, t):
    x = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
    y = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
    return (x, y)

def svg_commands_to_points(commands, scale=1.0, offset=(0, 0)):
    subpaths = []
    current_path = []
    current_pos = (0, 0)
    
    for cmd, args in commands:
        if cmd in ('M', 'm'):
            if current_path:
                subpaths.append(current_path)
                current_path = []
            x, y = args[0], args[1]
            if cmd == 'm':
                x += current_pos[0]
                y += current_pos[1]
            current_pos = (x, y)
            current_path.append((x * scale + offset[0], y * scale + offset[1]))
            
        elif cmd in ('L', 'l'):
            for i in range(0, len(args), 2):
                x, y = args[i], args[i+1]
                if cmd == 'l':
                    x += current_pos[0]
                    y += current_pos[1]
                current_pos = (x, y)
                current_path.append((x * scale + offset[0], y * scale + offset[1]))
                
        elif cmd in ('C', 'c'):
            for i in range(0, len(args), 6):
                cp1x, cp1y = args[i], args[i+1]
                cp2x, cp2y = args[i+2], args[i+3]
                endx, endy = args[i+4], args[i+5]
                
                if cmd == 'c':
                    cp1x += current_pos[0]
                    cp1y += current_pos[1]
                    cp2x += current_pos[0]
                    cp2y += current_pos[1]
                    endx += current_pos[0]
                    endy += current_pos[1]
                    
                p0 = current_pos
                p1 = (cp1x, cp1y)
                p2 = (cp2x, cp2y)
                p3 = (endx, endy)
                
                # Evaluate bezier curve in 20 steps
                steps = 20
                for s in range(1, steps + 1):
                    t = s / steps
                    pt = bezier_point(p0, p1, p2, p3, t)
                    current_path.append((pt[0] * scale + offset[0], pt[1] * scale + offset[1]))
                    
                current_pos = p3
                
        elif cmd in ('Z', 'z'):
            if current_path:
                subpaths.append(current_path)
                current_path = []
                
    if current_path:
        subpaths.append(current_path)
        
    return subpaths

def render_logo_to_png(svg_path, output_png_path, size=1024, fill_color=(82, 179, 154)):
    # Read SVG content
    with open(svg_path, 'r') as f:
        svg_content = f.read()
        
    # Extract path data
    path_data_match = re.search(r'd="([^"]+)"', svg_content)
    if not path_data_match:
        print("Error: Could not find path data in SVG")
        return
        
    path_data = path_data_match.group(1)
    commands = parse_svg_path(path_data)
    
    # Calculate scale and offset to fit in the image
    # Standard viewbox is 100x100
    # Let's add padding: logo should occupy about 60% of the icon size
    logo_size = size * 0.60
    scale = logo_size / 100.0
    offset_val = (size - logo_size) / 2.0
    offset = (offset_val, offset_val)
    
    subpaths = svg_commands_to_points(commands, scale, offset)
    
    # Create image with transparent background (RGBA)
    im = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    
    # To do antialiasing, we render at 4x resolution and downscale
    oversample = 4
    large_size = size * oversample
    large_logo_size = logo_size * oversample
    large_scale = large_logo_size / 100.0
    large_offset_val = (large_size - large_logo_size) / 2.0
    large_offset = (large_offset_val, large_offset_val)
    
    large_subpaths = svg_commands_to_points(commands, large_scale, large_offset)
    
    # Draw on high-res mask
    mask = Image.new('L', (large_size, large_size), 0)
    draw_mask = ImageDraw.Draw(mask)
    
    # Fill subpaths using evenodd logic
    # Path 1 is outer, Path 2 is inner hole
    if len(large_subpaths) >= 1:
        draw_mask.polygon(large_subpaths[0], fill=255)
    if len(large_subpaths) >= 2:
        draw_mask.polygon(large_subpaths[1], fill=0)
        
    # Resize mask back to target size for beautiful antialiasing
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    
    # Create solid color image
    color_im = Image.new('RGBA', (size, size), fill_color + (255,))
    
    # Composite the color image onto transparent background using the mask
    final_im = Image.composite(color_im, im, mask)
    
    final_im.save(output_png_path)
    print(f"Generated high-definition PNG: {output_png_path}")

if __name__ == '__main__':
    render_logo_to_png(
        'c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/englabs_logo.svg',
        'c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/assets/icon.png',
        size=1024,
        fill_color=(82, 179, 154) # brand green
    )
