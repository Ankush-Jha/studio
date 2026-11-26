#!/usr/bin/env python3
"""Downsample 2x PNG masters to sRGB JPEGs (quality 92, 4:4:4, sRGB ICC embedded).

Usage: finish.py [--size 1080x1350] in@2x.png=out.jpg [more pairs...]
Without --size the output is half the master's size (the masters are rendered at 2x).
"""
import sys

from PIL import Image, ImageCms

SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def finish(src: str, dst: str, size=None) -> None:
    im = Image.open(src)
    if im.mode != "RGB":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
        im = bg
    size = size or (im.size[0] // 2, im.size[1] // 2)
    if im.size != size:
        im = im.resize(size, Image.Resampling.LANCZOS)
    im.save(dst, "JPEG", quality=92, subsampling=0, optimize=True, icc_profile=SRGB)


if __name__ == "__main__":
    args = sys.argv[1:]
    size = None
    if args and args[0] == "--size":
        w, h = args[1].split("x")
        size = (int(w), int(h))
        args = args[2:]
    for pair in args:
        s, d = pair.split("=", 1)
        finish(s, d, size)
