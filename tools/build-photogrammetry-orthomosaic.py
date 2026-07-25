#!/usr/bin/env python3
"""Build a measured ground orthomosaic from the registered drone orbit."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
IMAGE_ROOT = Path(
    '/Users/bahriannovotny/Library/Containers/com.laan.labs.splat-app/'
    'Data/Documents/scan-2026-04-12-003737/images'
)
ALIGNMENT = ROOT / 'artifacts/photogrammetry/aligned/alignment.json'
OUTPUT = ROOT / 'artifacts/photogrammetry/aligned/paasleben-ground-orthomosaic.jpg'
WORLD_X = (-5.25, 3.90)
WORLD_Z = (-3.25, 4.30)
OUTPUT_WIDTH = 1900


def load_alignment_module():
    source = ROOT / 'tools/align-photogrammetry-reference.py'
    spec = importlib.util.spec_from_file_location('paasleben_alignment', source)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main() -> None:
    alignment_module = load_alignment_module()
    alignment = json.loads(ALIGNMENT.read_text(encoding='utf-8'))
    images = alignment_module.read_images()
    focal, cx, cy, radial = alignment_module.read_camera()
    normal = np.asarray(alignment['normal'], dtype=np.float64)
    offset = float(alignment['offset'])
    basis_x = np.asarray(alignment['basis_x'], dtype=np.float64)
    basis_z = np.asarray(alignment['basis_z'], dtype=np.float64)
    linear = np.asarray(alignment['similarity_linear'], dtype=np.float64)
    shift = np.asarray(alignment['similarity_shift'], dtype=np.float64)
    inverse_linear = np.linalg.inv(linear)

    world_width = WORLD_X[1] - WORLD_X[0]
    world_height = WORLD_Z[1] - WORLD_Z[0]
    output_height = round(OUTPUT_WIDTH * world_height / world_width)
    x_values = np.linspace(WORLD_X[0], WORLD_X[1], OUTPUT_WIDTH)
    z_values = np.linspace(WORLD_Z[0], WORLD_Z[1], output_height)
    target_x, target_z = np.meshgrid(x_values, z_values)
    target = np.column_stack((target_x.ravel(), target_z.ravel()))
    source_2d = (target - shift) @ inverse_linear.T
    ground_points = (
        source_2d[:, :1] * basis_x[None, :]
        + source_2d[:, 1:] * basis_z[None, :]
        - offset * normal[None, :]
    )

    best_score = np.full(len(ground_points), -np.inf, dtype=np.float32)
    result = np.zeros((len(ground_points), 3), dtype=np.uint8)
    coverage = np.zeros(len(ground_points), dtype=np.uint16)

    # Every second registered frame keeps broad orbit coverage while avoiding
    # nearly identical neighbours and excessive I/O.
    selected = sorted(images.items())[::2]
    for image_index, (name, (rotation, translation)) in enumerate(selected, start=1):
        camera_points = ground_points @ rotation.T + translation
        in_front = camera_points[:, 2] > 0.10
        normalized_x = camera_points[:, 0] / np.maximum(camera_points[:, 2], 1e-9)
        normalized_y = camera_points[:, 1] / np.maximum(camera_points[:, 2], 1e-9)
        radius_sq = normalized_x * normalized_x + normalized_y * normalized_y
        distortion = 1.0 + radial * radius_sq
        image_x = focal * normalized_x * distortion + cx
        image_y = focal * normalized_y * distortion + cy
        valid = (
            in_front
            & (image_x >= 2)
            & (image_x < 3838)
            & (image_y >= 2)
            & (image_y < 2158)
        )
        if not np.any(valid):
            continue

        camera_center = -rotation.T @ translation
        to_camera = camera_center[None, :] - ground_points
        distance = np.linalg.norm(to_camera, axis=1)
        incidence = (to_camera @ normal) / np.maximum(distance, 1e-9)
        center_x = (image_x - cx) / (3840 * 0.52)
        center_y = (image_y - cy) / (2160 * 0.52)
        center_weight = np.clip(1.0 - 0.55 * (center_x * center_x + center_y * center_y), 0.08, 1.0)
        score = incidence * center_weight / np.maximum(camera_points[:, 2], 0.15)
        update = valid & (score > best_score)
        coverage[valid] += 1
        if not np.any(update):
            continue

        source = np.asarray(Image.open(IMAGE_ROOT / name).convert('RGB'))
        sample_x = np.rint(image_x[update]).astype(np.int32)
        sample_y = np.rint(image_y[update]).astype(np.int32)
        result[update] = source[sample_y, sample_x]
        best_score[update] = score[update].astype(np.float32)
        print(f'ORTHOMOSAIC_FRAME {image_index:02d}/{len(selected):02d} {name} updates={int(update.sum())}')

    raster = result.reshape(output_height, OUTPUT_WIDTH, 3)
    uncovered = ~np.isfinite(best_score.reshape(output_height, OUTPUT_WIDTH))
    raster[uncovered] = (22, 25, 22)
    image = Image.fromarray(raster)
    draw = ImageDraw.Draw(image, 'RGBA')
    for x in np.arange(np.ceil(WORLD_X[0] * 10) / 10, WORLD_X[1] + 0.001, 0.1):
        pixel_x = (x - WORLD_X[0]) / world_width * (OUTPUT_WIDTH - 1)
        draw.line((pixel_x, 0, pixel_x, output_height), fill=(255, 80, 25, 48), width=1)
    for z in np.arange(np.ceil(WORLD_Z[0] * 10) / 10, WORLD_Z[1] + 0.001, 0.1):
        pixel_y = (z - WORLD_Z[0]) / world_height * (output_height - 1)
        draw.line((0, pixel_y, OUTPUT_WIDTH, pixel_y), fill=(255, 80, 25, 48), width=1)
    draw.text((16, 14), 'COLMAP ground orthomosaic | 0.1 KSplat unit = 3 m', fill=(255, 255, 255, 255))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, quality=95)
    print(
        json.dumps(
            {
                'output': str(OUTPUT),
                'size': image.size,
                'selected_frames': len(selected),
                'coverage_percent': float(np.mean(~uncovered) * 100.0),
                'median_views': float(np.median(coverage[coverage > 0])) if np.any(coverage > 0) else 0.0,
            },
            indent=2,
        )
    )


if __name__ == '__main__':
    main()
