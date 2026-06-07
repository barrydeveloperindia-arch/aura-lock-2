import re
import sys
import os
from PIL import Image, ImageDraw, ImageFont

def parse_svg_path(svg_path_str):
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

def generate_splash_screen(svg_path, output_png_path, size=2732, bg_color=(10, 15, 29), logo_color=(82, 179, 154)):
    with open(svg_path, 'r') as f:
        svg_content = f.read()
        
    path_data_match = re.search(r'd="([^"]+)"', svg_content)
    if not path_data_match:
        print("Error: Could not find path data in SVG")
        return
        
    path_data = path_data_match.group(1)
    commands = parse_svg_path(path_data)
    
    # Calculate scale and offset to fit logo in center
    logo_size = size * 0.22 # 22% of screen
    scale = logo_size / 100.0
    # Center logo vertically (shift slightly upwards to make room for text)
    offset_x = (size - logo_size) / 2.0
    offset_y = (size - logo_size) / 2.0 - 150.0
    
    # Render at 4x resolution for antialiasing
    oversample = 4
    large_size = size * oversample
    large_logo_size = logo_size * oversample
    large_scale = large_logo_size / 100.0
    large_offset_x = (large_size - large_logo_size) / 2.0
    large_offset_y = (large_size - large_logo_size) / 2.0 - (150.0 * oversample)
    
    large_subpaths = svg_commands_to_points(commands, large_scale, (large_offset_x, large_offset_y))
    
    # Draw on high-res mask
    mask = Image.new('L', (large_size, large_size), 0)
    draw_mask = ImageDraw.Draw(mask)
    
    if len(large_subpaths) >= 1:
        draw_mask.polygon(large_subpaths[0], fill=255)
    if len(large_subpaths) >= 2:
        draw_mask.polygon(large_subpaths[1], fill=0)
        
    # Resize mask back to target size for antialiasing
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    
    # Create final image with background color
    final_im = Image.new('RGBA', (size, size), bg_color + (255,))
    
    # Composite the logo onto the background using the mask
    logo_im = Image.new('RGBA', (size, size), logo_color + (255,))
    final_im = Image.composite(logo_im, final_im, mask)
    
    # Draw Text
    draw = ImageDraw.Draw(final_im)
    
    # Load a font
    font_path = "C:\\Windows\\Fonts\\arialbd.ttf" # Arial Bold
    if not os.path.exists(font_path):
        font_path = "arial.ttf" # Fallback
        
    try:
        title_font = ImageFont.truetype(font_path, 110)
        subtitle_font = ImageFont.truetype(font_path, 48)
    except IOError:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        print("Warning: Arial font not found, using default font")
        
    # Text content
    title_text = "ENGLABS"
    subtitle_text = "ATTENDANCE TRACKER"
    
    # Calculate text dimensions using textbbox
    title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    
    sub_bbox = draw.textbbox((0, 0), subtitle_text, font=subtitle_font)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_h = sub_bbox[3] - sub_bbox[1]
    
    # Position text below the logo
    title_y = offset_y + logo_size + 180.0
    sub_y = title_y + title_h + 50.0
    
    # Draw "Eng" in white, "labs" in green
    eng_text = "Eng"
    labs_text = "labs"
    
    eng_bbox = draw.textbbox((0, 0), eng_text, font=title_font)
    eng_w = eng_bbox[2] - eng_bbox[0]
    
    labs_bbox = draw.textbbox((0, 0), labs_text, font=title_font)
    labs_w = labs_bbox[2] - labs_bbox[0]
    
    total_w = eng_w + labs_w
    start_x = (size - total_w) / 2.0
    
    # Draw Eng (white)
    draw.text((start_x, title_y), eng_text, fill=(255, 255, 255, 255), font=title_font)
    # Draw labs (brand green)
    draw.text((start_x + eng_w, title_y), labs_text, fill=logo_color + (255,), font=title_font)
    
    # Draw subtitle (slate blue/grey)
    draw.text(((size - sub_w) / 2.0, sub_y), subtitle_text, fill=(148, 163, 184, 255), font=subtitle_font)
    
    final_im.save(output_png_path)
    print(f"Generated splash screen: {output_png_path}")

if __name__ == '__main__':
    generate_splash_screen(
        'c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/englabs_logo.svg',
        'c:/Users/SAM/Documents/Antigravity/aura-lock-2/terminal-app/assets/splash.png',
        size=2732,
        bg_color=(10, 15, 29),
        logo_color=(82, 179, 154)
    )
