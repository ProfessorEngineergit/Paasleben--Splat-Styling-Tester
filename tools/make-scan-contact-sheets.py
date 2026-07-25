#!/usr/bin/env python3
"""Build labelled contact sheets for the raw Laan Splat capture frames."""

from __future__ import annotations

import argparse
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def frame_number(path: Path) -> int:
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else -1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--stride", type=int, default=5)
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--rows", type=int, default=5)
    parser.add_argument("--thumb-width", type=int, default=300)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=999999)
    args = parser.parse_args()

    files = sorted(
        (
            path
            for path in args.source.iterdir()
            if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
            and args.start <= frame_number(path) <= args.end
        ),
        key=frame_number,
    )[:: max(1, args.stride)]
    args.output.mkdir(parents=True, exist_ok=True)

    thumb_w = args.thumb_width
    thumb_h = round(thumb_w * 9 / 16)
    label_h = 24
    cell_h = thumb_h + label_h
    per_page = args.columns * args.rows
    font = ImageFont.load_default(size=16)

    for page_index in range(math.ceil(len(files) / per_page)):
        page_files = files[page_index * per_page : (page_index + 1) * per_page]
        sheet = Image.new("RGB", (args.columns * thumb_w, args.rows * cell_h), (18, 20, 22))
        draw = ImageDraw.Draw(sheet)
        for item_index, path in enumerate(page_files):
            column = item_index % args.columns
            row = item_index // args.columns
            x = column * thumb_w
            y = row * cell_h
            with Image.open(path) as source:
                source = ImageOps.exif_transpose(source).convert("RGB")
                thumb = ImageOps.fit(source, (thumb_w, thumb_h), method=Image.Resampling.LANCZOS)
            sheet.paste(thumb, (x, y))
            draw.rectangle((x, y + thumb_h, x + thumb_w, y + cell_h), fill=(12, 14, 16))
            draw.text((x + 8, y + thumb_h + 3), path.stem, fill=(245, 245, 245), font=font)
        first_number = frame_number(page_files[0])
        last_number = frame_number(page_files[-1])
        output = args.output / f"scan-contact-{first_number:05d}-{last_number:05d}.jpg"
        sheet.save(output, quality=90, optimize=True)
        print(output)


if __name__ == "__main__":
    main()
