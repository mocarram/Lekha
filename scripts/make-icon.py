#!/usr/bin/env python3
"""make-icon.py - Generate build/icon.png, the source PNG for the app icon.

Produces a 1024x1024 RGBA PNG using only the Python standard library (struct +
zlib), so it has no third-party dependencies. The artwork is a parchment "L"
monogram on an indigo rounded square with a soft violet accent bar - matching
Lekha's brand palette.

After regenerating the PNG, run scripts/make-icon.sh to build build/icon.icns
(via macOS sips + iconutil) which electron-builder consumes.

Usage:  python3 scripts/make-icon.py
"""
import struct
import zlib

SIZE = 1024
BG = (43, 49, 84)        # indigo background
FG = (244, 241, 232)     # parchment "L"
ACCENT = (108, 99, 255)  # soft violet accent bar

R = 180          # corner radius of the rounded square
STROKE = 150     # thickness of the "L" strokes
LEFT, TOP, BOTTOM, RIGHT = 360, 250, 774, 690


def in_rounded_rect(x: int, y: int) -> bool:
    if x < R and y < R:
        return (R - x) ** 2 + (R - y) ** 2 <= R * R
    if x >= SIZE - R and y < R:
        return (x - (SIZE - R)) ** 2 + (R - y) ** 2 <= R * R
    if x < R and y >= SIZE - R:
        return (R - x) ** 2 + (y - (SIZE - R)) ** 2 <= R * R
    if x >= SIZE - R and y >= SIZE - R:
        return (x - (SIZE - R)) ** 2 + (y - (SIZE - R)) ** 2 <= R * R
    return True


def is_l(x: int, y: int) -> bool:
    if LEFT <= x < LEFT + STROKE and TOP <= y < BOTTOM:
        return True
    if LEFT <= x < RIGHT and BOTTOM - STROKE <= y < BOTTOM:
        return True
    return False


def build_raw() -> bytearray:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # PNG filter type 0 per scanline
        for x in range(SIZE):
            if not in_rounded_rect(x, y):
                raw += bytes((0, 0, 0, 0))
                continue
            if is_l(x, y):
                raw += bytes((*FG, 255))
            elif 820 <= y < 850 and 250 <= x < 774:
                raw += bytes((*ACCENT, 255))
            else:
                raw += bytes((*BG, 255))
    return raw


def chunk(tag: bytes, data: bytes) -> bytes:
    c = tag + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)


def main() -> None:
    raw = build_raw()
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open("build/icon.png", "wb") as f:
        f.write(png)
    print("Wrote build/icon.png")


if __name__ == "__main__":
    main()
