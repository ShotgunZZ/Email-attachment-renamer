from PIL import Image, ImageDraw
import math

# Create a new 128x128 image with a transparent background
img = Image.new('RGBA', (128, 128), color=(0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Define colors
primary_color = (66, 133, 244)  # Google blue
secondary_color = (234, 67, 53)  # Google red
accent_color = (251, 188, 5)    # Google yellow
bg_color = (255, 255, 255, 240)  # Slightly transparent white

# Draw a rounded rectangle background
def rounded_rectangle(xy, radius, fill=None, outline=None):
    x0, y0, x1, y1 = xy
    diameter = radius * 2
    
    # Draw the rectangle
    draw.rectangle([(x0, y0 + radius), (x1, y1 - radius)], fill=fill, outline=outline)
    draw.rectangle([(x0 + radius, y0), (x1 - radius, y1)], fill=fill, outline=outline)
    
    # Draw the corners
    draw.pieslice([(x0, y0), (x0 + diameter, y0 + diameter)], 180, 270, fill=fill, outline=outline)
    draw.pieslice([(x1 - diameter, y0), (x1, y0 + diameter)], 270, 360, fill=fill, outline=outline)
    draw.pieslice([(x0, y1 - diameter), (x0 + diameter, y1)], 90, 180, fill=fill, outline=outline)
    draw.pieslice([(x1 - diameter, y1 - diameter), (x1, y1)], 0, 90, fill=fill, outline=outline)

# Apply the rounded rectangle
rounded_rectangle((14, 14, 114, 114), 16, fill=bg_color)

# Draw email icon base (envelope shape)
email_points = [
    (24, 38),      # Top-left
    (104, 38),     # Top-right
    (104, 90),     # Bottom-right
    (24, 90)       # Bottom-left
]
draw.polygon(email_points, fill=primary_color)

# Add envelope flap
flap_points = [
    (24, 38),      # Top-left
    (104, 38),     # Top-right
    (64, 62)       # Bottom-middle
]
draw.polygon(flap_points, fill=secondary_color)

# Draw attachment icon (paper clip)
clip_width = 12
clip_height = 38
clip_x = 76
clip_y = 70

# Draw stylized attachment/arrow
draw.rectangle((clip_x, clip_y - 20, clip_x + clip_width, clip_y + clip_height - 20), 
              fill=accent_color, outline=None)

# Draw arrow for "download/rename" concept
arrow_width = 28
arrow_height = 20
arrow_x = 34
arrow_y = 80

arrow_points = [
    (arrow_x, arrow_y - arrow_height/2),                # Top
    (arrow_x + arrow_width/2, arrow_y + arrow_height/2),  # Bottom-right
    (arrow_x - arrow_width/2, arrow_y + arrow_height/2)   # Bottom-left
]
draw.polygon(arrow_points, fill=(255, 255, 255))

# Save the image
img.save('icons/icon128.png')

# Create smaller versions
img_48 = img.resize((48, 48), Image.Resampling.LANCZOS)
img_48.save('icons/icon48.png')

img_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
img_16.save('icons/icon16.png')

print("Icon files created successfully!")
