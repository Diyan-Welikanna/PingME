from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path(r"e:\Projects\PingMe\mobile\assets")
root.mkdir(parents=True, exist_ok=True)
out = root / 'icon.png'

size = 1024
img = Image.new('RGBA', (size, size), (230, 104, 74, 255))
d = ImageDraw.Draw(img)

pad = 120
d.rounded_rectangle([(pad, pad), (size - pad, size - pad)], radius=240, fill=(255, 255, 255, 26))

d.ellipse((size // 2 - 190, size // 2 - 190, size // 2 + 190, size // 2 + 190), fill=(255, 255, 255, 245))

try:
    font = ImageFont.truetype('arial.ttf', 520)
except Exception:
    font = ImageFont.load_default()

text = 'P'
text_box = d.textbbox((0, 0), text, font=font)
text_w = text_box[2] - text_box[0]
text_h = text_box[3] - text_box[1]
text_x = (size - text_w) / 2
text_y = (size - text_h) / 2 - 50
d.text((text_x, text_y), text, font=font, fill=(28, 42, 53, 255))

img.save(out)
print(f"Created: {out}")
