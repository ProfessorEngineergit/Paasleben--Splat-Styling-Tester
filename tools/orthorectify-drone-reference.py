#!/usr/bin/env python3
"""Rectify frame 00401 onto the measured KSplat ground plane.

The four arena corners are the control points.  Buildings retain a small
height-parallax offset, but roads, lawns, yards, fences and ground footprints
become directly comparable with an orthographic Blender render.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


WORLD_X = (-3.45, -0.20)
WORLD_Z = (-2.55, 0.50)
OUTPUT_WIDTH = 1600

# Manually audited fence/sand corners in the original 3840 x 2160 frame.
# Order matches the transformed KSplat arena corners below.
IMAGE_POINTS = np.array(
    [
        [1970.20, 860.63],
        [2266.60, 1179.90],
        [2031.44, 1252.62],
        [1766.17, 908.59],
    ],
    dtype=float,
)
WORLD_POINTS = np.array(
    [
        [-2.02910298, -0.51947612],
        [-1.48047949, -1.41474829],
        [-1.13089702, -1.20052388],
        [-1.67952051, -0.30525171],
    ],
    dtype=float,
)


def homography(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    matrix = []
    values = []
    for (u, v), (x, y) in zip(source, target):
        matrix.extend(
            (
                [u, v, 1, 0, 0, 0, -x * u, -x * v],
                [0, 0, 0, u, v, 1, -y * u, -y * v],
            )
        )
        values.extend((x, y))
    coefficients = np.linalg.solve(np.asarray(matrix), np.asarray(values))
    return np.append(coefficients, 1.0).reshape(3, 3)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("frame", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--overlay", type=Path)
    args = parser.parse_args()

    source = np.asarray(Image.open(args.frame).convert("RGB"), dtype=np.float32)
    image_to_world = homography(IMAGE_POINTS, WORLD_POINTS)
    world_to_image = np.linalg.inv(image_to_world)

    world_width = WORLD_X[1] - WORLD_X[0]
    world_height = WORLD_Z[1] - WORLD_Z[0]
    output_height = round(OUTPUT_WIDTH * world_height / world_width)
    x_values = np.linspace(WORLD_X[0], WORLD_X[1], OUTPUT_WIDTH)
    # Blender's top camera has +Y upward; because Blender Y=-KSplat Z, the
    # smallest KSplat Z value belongs at the top edge.
    z_values = np.linspace(WORLD_Z[0], WORLD_Z[1], output_height)
    world_x, world_z = np.meshgrid(x_values, z_values)
    homogeneous_world = np.stack((world_x, world_z, np.ones_like(world_x)), axis=0).reshape(3, -1)
    image_coords = world_to_image @ homogeneous_world
    image_coords /= image_coords[2:3]
    source_x = image_coords[0].reshape(output_height, OUTPUT_WIDTH)
    source_y = image_coords[1].reshape(output_height, OUTPUT_WIDTH)

    rectified = np.empty((output_height, OUTPUT_WIDTH, 3), dtype=np.uint8)
    for channel in range(3):
        rectified[..., channel] = np.clip(
            ndimage.map_coordinates(source[..., channel], (source_y, source_x), order=1, mode="constant", cval=20),
            0,
            255,
        ).astype(np.uint8)

    result = Image.fromarray(rectified)
    draw = ImageDraw.Draw(result, "RGBA")
    for x in np.arange(np.ceil(WORLD_X[0] * 10) / 10, WORLD_X[1] + 0.001, 0.1):
        px = (x - WORLD_X[0]) / world_width * (OUTPUT_WIDTH - 1)
        draw.line((px, 0, px, output_height), fill=(255, 80, 30, 80), width=1)
    for z in np.arange(np.ceil(WORLD_Z[0] * 10) / 10, WORLD_Z[1] + 0.001, 0.1):
        py = (z - WORLD_Z[0]) / world_height * (output_height - 1)
        draw.line((0, py, OUTPUT_WIDTH, py), fill=(255, 80, 30, 80), width=1)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, quality=94)

    if args.model and args.overlay:
        model = Image.open(args.model).convert("RGB").resize(result.size, Image.Resampling.LANCZOS)
        overlay = Image.blend(result.convert("RGB"), model, 0.47)
        args.overlay.parent.mkdir(parents=True, exist_ok=True)
        overlay.save(args.overlay, quality=94)

    print(
        {
            "output": str(args.output),
            "size": result.size,
            "world_x": WORLD_X,
            "world_z": WORLD_Z,
            "overlay": str(args.overlay) if args.overlay else None,
        }
    )


if __name__ == "__main__":
    main()
