#!/usr/bin/env python3
"""Generate simple icon files for the Voice Coding Assistant app."""

from PIL import Image, ImageDraw
import os


def create_icon(size, filename):
    """Create a simple microphone icon."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background gradient simulation with solid color
    padding = size // 8
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=size // 8,
        fill=(59, 130, 246, 255),  # Blue color
    )

    # Microphone body (white circle)
    center = size // 2
    mic_size = size // 3
    draw.ellipse(
        [
            center - mic_size // 2,
            center - mic_size // 2 - mic_size // 4,
            center + mic_size // 2,
            center + mic_size // 2 - mic_size // 4,
        ],
        fill=(255, 255, 255, 255),
    )

    # Microphone base
    base_width = mic_size // 2
    base_height = mic_size // 4
    draw.rounded_rectangle(
        [
            center - base_width // 2,
            center + mic_size // 4,
            center + base_width // 2,
            center + mic_size // 4 + base_height,
        ],
        radius=base_height // 4,
        fill=(255, 255, 255, 255),
    )

    img.save(filename)
    print(f"Created {filename}")


# Generate icons in different sizes
sizes = [32, 128, 256]
for size in sizes:
    if size == 256:
        filename = f"icons/128x128@2x.png"
    else:
        filename = f"icons/{size}x{size}.png"
    create_icon(size, filename)

# Create ICO file for Windows
ico_sizes = [(32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_images = []
for w, h in ico_sizes:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    padding = w // 8
    draw.rounded_rectangle(
        [padding, padding, w - padding, h - padding],
        radius=w // 8,
        fill=(59, 130, 246, 255),
    )
    center = w // 2
    mic_size = w // 3
    draw.ellipse(
        [
            center - mic_size // 2,
            center - mic_size // 2 - mic_size // 4,
            center + mic_size // 2,
            center + mic_size // 2 - mic_size // 4,
        ],
        fill=(255, 255, 255, 255),
    )
    base_width = mic_size // 2
    base_height = mic_size // 4
    draw.rounded_rectangle(
        [
            center - base_width // 2,
            center + mic_size // 4,
            center + base_width // 2,
            center + mic_size // 4 + base_height,
        ],
        radius=base_height // 4,
        fill=(255, 255, 255, 255),
    )
    ico_images.append(img)

ico_images[0].save("icons/icon.ico", sizes=[(s[0], s[1]) for s in ico_sizes])
print("Created icons/icon.ico")

# Create ICNS file for macOS (we'll create a simple PNG that can be converted)
# For now, use the 256x256 as the icon
ico_images[-1].save("icons/icon.icns.png")
print("Created icons/icon.icns.png - convert to .icns using iconutil")
