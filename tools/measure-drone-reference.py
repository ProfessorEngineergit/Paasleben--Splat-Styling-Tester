#!/usr/bin/env python3
"""Extract ground-plane measurements from the 4K drone orbit.

The sand arena is the calibration target: its dimensions and rotation have
already been measured directly in the transformed KSplat.  This script finds
its pale polygon in a selected drone frame, draws an audit overlay, and prints
the image-space corner coordinates used for a later planar homography.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


def largest_arena_component(rgb: np.ndarray) -> np.ndarray:
    """Return the largest sand-coloured component in the central image area."""
    height, width, _ = rgb.shape
    yy, xx = np.mgrid[:height, :width]
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)

    # The arena is a large, warm, low-saturation surface.  Spatial limits keep
    # pale house facades and the public road from joining the candidate mask.
    warm_sand = (
        (r > 165)
        & (g > 150)
        & (b < 190)
        & ((r - b) > 25)
        & ((g - b) > 16)
        & (xx > width * 0.40)
        & (xx < width * 0.73)
        & (yy > height * 0.32)
        & (yy < height * 0.79)
    )
    warm_sand = ndimage.binary_opening(warm_sand, iterations=3)
    warm_sand = ndimage.binary_closing(warm_sand, iterations=7)
    labels, count = ndimage.label(warm_sand)
    if not count:
        raise RuntimeError("No sand-coloured connected component found")
    sizes = ndimage.sum(warm_sand, labels, range(1, count + 1))
    label = int(np.argmax(sizes)) + 1
    component = labels == label
    component = ndimage.binary_fill_holes(component)
    return component


def minimum_area_box(points_xy: np.ndarray) -> tuple[np.ndarray, float]:
    """Find a tight oriented rectangle by scanning angles around PCA."""
    centered = points_xy - points_xy.mean(axis=0)
    covariance = np.cov(centered.T)
    values, vectors = np.linalg.eigh(covariance)
    major = vectors[:, int(np.argmax(values))]
    initial = math.atan2(major[1], major[0])
    best = None
    for angle in np.linspace(initial - math.radians(12), initial + math.radians(12), 481):
        c, s = math.cos(angle), math.sin(angle)
        rotation = np.array([[c, s], [-s, c]])
        local = centered @ rotation.T
        low = np.percentile(local, 1.5, axis=0)
        high = np.percentile(local, 98.5, axis=0)
        area = float(np.prod(high - low))
        if best is None or area < best[0]:
            best = (area, angle, low, high)
    assert best is not None
    _, angle, low, high = best
    local_corners = np.array(
        [
            [low[0], low[1]],
            [high[0], low[1]],
            [high[0], high[1]],
            [low[0], high[1]],
        ]
    )
    c, s = math.cos(angle), math.sin(angle)
    inverse = np.array([[c, -s], [s, c]])
    corners = local_corners @ inverse.T + points_xy.mean(axis=0)
    return corners, math.degrees(angle)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("frame", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    image = Image.open(args.frame).convert("RGB")
    rgb = np.asarray(image)
    component = largest_arena_component(rgb)
    ys, xs = np.nonzero(component)
    points = np.column_stack((xs, ys)).astype(float)
    corners, angle = minimum_area_box(points)

    overlay = image.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    for grid_x in range(0, image.width, 200):
        draw.line((grid_x, 0, grid_x, image.height), fill=(255, 90, 20, 115), width=2)
        draw.text((grid_x + 8, 8), str(grid_x), fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0, 255))
    for grid_y in range(0, image.height, 200):
        draw.line((0, grid_y, image.width, grid_y), fill=(255, 90, 20, 115), width=2)
        draw.text((8, grid_y + 8), str(grid_y), fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0, 255))
    boundary = component ^ ndimage.binary_erosion(component, iterations=3)
    by, bx = np.nonzero(boundary)
    for x, y in zip(bx[::8], by[::8]):
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(0, 255, 255, 210))
    polygon = [tuple(map(float, corner)) for corner in corners]
    draw.line(polygon + [polygon[0]], fill=(255, 40, 20, 255), width=10)
    for index, (x, y) in enumerate(polygon):
        draw.ellipse((x - 18, y - 18, x + 18, y + 18), fill=(255, 40, 20, 255))
        draw.text((x + 24, y - 24), str(index), fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0, 255))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(args.output, quality=94)
    print(
        {
            "frame": str(args.frame),
            "image_size": image.size,
            "component_pixels": int(component.sum()),
            "box_angle_degrees": angle,
            "corners_xy": [[round(float(x), 2), round(float(y), 2)] for x, y in corners],
        }
    )


if __name__ == "__main__":
    main()
