"""Measure dominant hall-roof and sand-arena silhouettes in the KSplat top crop.

This is a deliberately narrow validation helper for reference 15. It converts
segmented pixels back to transformed KSplat coordinates using the exact camera
preset, then reports robust PCA-oriented footprint sizes.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
IMAGE_PATH = ROOT / "artifacts" / "splat-reference-set" / "15-top-halls.jpg"
WIDTH_SPAN = 2.85
CENTER_X = -2.12
CENTER_Z = -1.03


def robust_oriented_bounds(xs, ys):
    points = np.column_stack((xs, ys)).astype(float)
    center = points.mean(axis=0)
    covariance = np.cov((points - center).T)
    values, vectors = np.linalg.eigh(covariance)
    vectors = vectors[:, np.argsort(values)[::-1]]
    projected = (points - center) @ vectors
    low = np.quantile(projected, 0.01, axis=0)
    high = np.quantile(projected, 0.99, axis=0)
    local_center = (low + high) / 2
    pixel_center = center + local_center @ vectors.T
    dimensions = high - low
    if dimensions[1] > dimensions[0]:
        dimensions = dimensions[::-1]
        vectors = vectors[:, ::-1]
    angle = float(np.degrees(np.arctan2(vectors[1, 0], vectors[0, 0])))
    pixels_per_unit = image.width / WIDTH_SPAN
    return {
        "centerPixel": [float(pixel_center[0]), float(pixel_center[1])],
        "centerKSplat": [
            CENTER_X + (float(pixel_center[0]) - image.width / 2) / pixels_per_unit,
            CENTER_Z + (float(pixel_center[1]) - image.height / 2) / pixels_per_unit,
        ],
        "lengthPixels": float(dimensions[0]),
        "widthPixels": float(dimensions[1]),
        "lengthKSplat": float(dimensions[0] / pixels_per_unit),
        "widthKSplat": float(dimensions[1] / pixels_per_unit),
        "lengthMetres": float(dimensions[0] / pixels_per_unit * 30),
        "widthMetres": float(dimensions[1] / pixels_per_unit * 30),
        "anglePixelsDeg": angle,
    }


def components(mask, minimum_pixels):
    labels, count = ndimage.label(mask)
    result = []
    for index in range(1, count + 1):
        ys, xs = np.where(labels == index)
        if len(xs) < minimum_pixels:
            continue
        measured = robust_oriented_bounds(xs, ys)
        measured["pixels"] = int(len(xs))
        result.append(measured)
    return sorted(result, key=lambda item: item["pixels"], reverse=True)


image = Image.open(IMAGE_PATH).convert("RGB")
rgb = np.asarray(image)
red = rgb[:, :, 0].astype(int)
green = rgb[:, :, 1].astype(int)
blue = rgb[:, :, 2].astype(int)

# Blue-grey galvanized roofs; bounds exclude pond/sky and the service strip.
roof_mask = (blue - red > 10) & (blue - green > 3) & (green > 52) & (green < 190)
roof_mask[:, :70] = False
roof_mask[:, 760:] = False
roof_mask[565:, :] = False
roof_mask_raw = roof_mask.copy()
roof_mask = ndimage.binary_closing(roof_mask, np.ones((7, 7)), iterations=2)
roof_mask = ndimage.binary_opening(roof_mask, np.ones((4, 4)))

# Warm low-saturation arena surface, constrained to its half of the crop.
sand_mask = (red - blue > 17) & (green - blue > 10) & (red > 78) & (red < 210)
sand_mask[:, :690] = False
sand_mask[:105, :] = False
sand_mask = ndimage.binary_closing(sand_mask, np.ones((9, 9)), iterations=2)
sand_mask = ndimage.binary_opening(sand_mask, np.ones((5, 5)))

output = {
    "reference": str(IMAGE_PATH),
    "camera": {"centerX": CENTER_X, "centerZ": CENTER_Z, "width": WIDTH_SPAN},
    "roofComponentsRaw": components(roof_mask_raw, 300)[:16],
    "roofComponents": components(roof_mask, 800)[:8],
    "sandComponents": components(sand_mask, 1500)[:4],
}

print(json.dumps(output, indent=2))
