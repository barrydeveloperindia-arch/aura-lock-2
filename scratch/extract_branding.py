import sys
from PIL import Image

def get_dominant_colors(image_path, num_colors=10):
    try:
        im = Image.open(image_path)
        im = im.convert('RGB')
        
        # Get all pixels
        pixels = list(im.getdata())
        
        # Count occurrences
        counts = {}
        for p in pixels:
            # Skip near-white/light gray background (R, G, B > 200)
            if p[0] > 200 and p[1] > 200 and p[2] > 200:
                continue
            # Skip grey/black/white (where channels are close to each other)
            if max(p) - min(p) < 20:
                continue
            counts[p] = counts.get(p, 0) + 1
            
        # Sort by count
        sorted_colors = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        
        print(f"--- Dominant Colors for {image_path} ---")
        for color, count in sorted_colors[:num_colors]:
            hex_color = '#{:02x}{:02x}{:02x}'.format(*color)
            print(f"Color: {hex_color} (RGB: {color}) - Count: {count}")
    except Exception as e:
        print(f"Error reading {image_path}: {e}")

if __name__ == '__main__':
    get_dominant_colors(r'C:\Users\SAM\.gemini\antigravity-ide\brain\903d68c9-c1ef-49ca-baf5-6fef97bfd053\media__1780832236332.png')
    get_dominant_colors(r'C:\Users\SAM\.gemini\antigravity-ide\brain\903d68c9-c1ef-49ca-baf5-6fef97bfd053\media__1780832247746.png')
