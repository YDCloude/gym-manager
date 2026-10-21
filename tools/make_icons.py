"""Generate the app icons (pure Python, no dependencies): python tools/make_icons.py"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
BLUE = (42, 120, 214)
WHITE = (255, 255, 255)


def rrect(cx, cy, hw, hh, r):
    """Signed-distance-ish test for a rounded rectangle centred at (cx, cy)."""
    def inside(x, y):
        dx = max(abs(x - cx) - (hw - r), 0.0)
        dy = max(abs(y - cy) - (hh - r), 0.0)
        return dx * dx + dy * dy <= r * r
    return inside


def dumbbell(scale):
    """Dumbbell glyph in unit coordinates, scaled about the centre."""
    def s(v):
        return 0.5 + (v - 0.5) * scale
    def w(v):
        return v * scale
    shapes = [rrect(s(0.5), s(0.5), w(0.21), w(0.035), w(0.02))]
    for side in (-1, 1):
        shapes.append(rrect(s(0.5 + side * 0.215), s(0.5), w(0.045), w(0.19), w(0.03)))
        shapes.append(rrect(s(0.5 + side * 0.305), s(0.5), w(0.04), w(0.135), w(0.03)))
    return shapes


def render(size, maskable, corner):
    ss = 3
    glyph = dumbbell(0.80 if maskable else 1.0)
    bg = rrect(0.5, 0.5, 0.5, 0.5, corner) if corner else (lambda x, y: True)
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            a = g = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    if bg(x, y):
                        a += 1
                        if any(f(x, y) for f in glyph):
                            g += 1
            n = ss * ss
            if a == 0:
                row += bytes([0, 0, 0, 0])
                continue
            t = g / a
            r = round(BLUE[0] + (WHITE[0] - BLUE[0]) * t)
            gr = round(BLUE[1] + (WHITE[1] - BLUE[1]) * t)
            b = round(BLUE[2] + (WHITE[2] - BLUE[2]) * t)
            row += bytes([r, gr, b, round(255 * a / n)])
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, False, 0.22),
        ("icon-512.png", 512, False, 0.22),
        ("maskable-512.png", 512, True, 0),      # full bleed; the OS applies its own mask
        ("apple-touch-icon.png", 180, True, 0),  # iOS rounds the corners itself
    ]
    for name, size, maskable, corner in jobs:
        write_png(os.path.join(OUT, name), size, render(size, maskable, corner))
        print("wrote", name)
