#!/usr/bin/env python3
"""Align the COLMAP drone reconstruction to the measured Blender site axes.

The reconstruction has an arbitrary similarity transform.  We recover its
vertical direction from the drone orbit, fit the dominant ground plane, cast
the four audited frame-00401 arena pixels onto that plane, and solve the final
2D similarity against the arena coordinates already used by the Blender
blockout.  The resulting top view is a real multi-view measurement reference,
not a single-frame projective warp.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester")
TEXT_MODEL = ROOT / "artifacts/photogrammetry/sparse/text"
OUT = ROOT / "artifacts/photogrammetry/aligned"

ARENA_PIXELS = np.array(
    [
        [1970.20, 860.63],
        [2266.60, 1179.90],
        [2031.44, 1252.62],
        [1766.17, 908.59],
    ],
    dtype=np.float64,
)
ARENA_TARGET = np.array(
    [
        [-2.02910298, -0.51947612],
        [-1.48047949, -1.41474829],
        [-1.13089702, -1.20052388],
        [-1.67952051, -0.30525171],
    ],
    dtype=np.float64,
)


def qvec_to_rotmat(qvec: np.ndarray) -> np.ndarray:
    w, x, y, z = qvec
    return np.array(
        [
            [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * w * z, 2 * z * x + 2 * w * y],
            [2 * x * y + 2 * w * z, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * w * x],
            [2 * z * x - 2 * w * y, 2 * y * z + 2 * w * x, 1 - 2 * x * x - 2 * y * y],
        ],
        dtype=np.float64,
    )


def read_points() -> tuple[np.ndarray, np.ndarray]:
    xyz = []
    rgb = []
    with (TEXT_MODEL / "points3D.txt").open("r", encoding="utf-8") as stream:
        for line in stream:
            if not line or line.startswith("#"):
                continue
            fields = line.split()
            xyz.append([float(fields[1]), float(fields[2]), float(fields[3])])
            rgb.append([int(fields[4]), int(fields[5]), int(fields[6])])
    return np.asarray(xyz, dtype=np.float64), np.asarray(rgb, dtype=np.uint8)


def read_images() -> dict[str, tuple[np.ndarray, np.ndarray]]:
    images = {}
    lines = (TEXT_MODEL / "images.txt").read_text(encoding="utf-8").splitlines()
    data_index = 0
    while data_index < len(lines):
        line = lines[data_index]
        if not line or line.startswith("#"):
            data_index += 1
            continue
        fields = line.split()
        qvec = np.asarray([float(value) for value in fields[1:5]], dtype=np.float64)
        tvec = np.asarray([float(value) for value in fields[5:8]], dtype=np.float64)
        images[fields[9]] = (qvec_to_rotmat(qvec), tvec)
        data_index += 2  # skip the following POINTS2D line
    return images


def read_camera() -> tuple[float, float, float, float]:
    for line in (TEXT_MODEL / "cameras.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            fields = line.split()
            return tuple(float(value) for value in fields[4:8])
    raise RuntimeError("No camera in cameras.txt")


def fit_ground_plane(points: np.ndarray, camera_centers: np.ndarray) -> tuple[np.ndarray, float, dict]:
    centered_cameras = camera_centers - np.mean(camera_centers, axis=0)
    _, _, camera_axes = np.linalg.svd(centered_cameras, full_matrices=False)
    orbit_up = camera_axes[-1]
    if np.median(camera_centers @ orbit_up) < np.median(points @ orbit_up):
        orbit_up *= -1.0

    # Robustly find the largest near-horizontal plane.  A histogram along the
    # camera-orbit normal fails when the drone changes altitude; RANSAC uses the
    # actual field/road points and only keeps the orbit normal as a loose prior.
    rng = np.random.default_rng(20260722)
    sample_pool = points[rng.choice(len(points), size=min(35000, len(points)), replace=False)]
    best_count = -1
    normal = orbit_up.copy()
    offset = -float(np.median(points @ orbit_up))
    ransac_tolerance = 0.030
    for _ in range(1800):
        a, b, c = sample_pool[rng.choice(len(sample_pool), size=3, replace=False)]
        candidate = np.cross(b - a, c - a)
        length = np.linalg.norm(candidate)
        if length < 1e-8:
            continue
        candidate /= length
        if np.dot(candidate, orbit_up) < 0:
            candidate *= -1.0
        if np.dot(candidate, orbit_up) < math.cos(math.radians(35.0)):
            continue
        candidate_offset = -float(np.dot(candidate, a))
        count = int(np.count_nonzero(np.abs(sample_pool @ candidate + candidate_offset) < ransac_tolerance))
        if count > best_count:
            best_count = count
            normal = candidate
            offset = candidate_offset

    mask = np.abs(points @ normal + offset) < ransac_tolerance
    for tolerance in (0.045, 0.035, 0.030):
        selected = points[mask]
        centroid = np.median(selected, axis=0)
        _, _, axes = np.linalg.svd(selected - centroid, full_matrices=False)
        candidate = axes[-1]
        if np.dot(candidate, orbit_up) < 0:
            candidate *= -1.0
        normal = candidate / np.linalg.norm(candidate)
        offset = -float(np.median(points[mask] @ normal))
        mask = np.abs(points @ normal + offset) < tolerance

    diagnostics = {
        "orbit_up": orbit_up.tolist(),
        "normal": normal.tolist(),
        "offset": offset,
        "ground_inliers": int(mask.sum()),
        "point_count": int(len(points)),
        "ransac_sample_inliers": int(best_count),
        "ransac_tolerance": ransac_tolerance,
        "camera_height_native": float(np.median(camera_centers @ normal + offset)),
    }
    return normal, offset, diagnostics


def undistorted_ray(pixel: np.ndarray, focal: float, cx: float, cy: float, radial: float) -> np.ndarray:
    distorted = np.array([(pixel[0] - cx) / focal, (pixel[1] - cy) / focal], dtype=np.float64)
    undistorted = distorted.copy()
    for _ in range(12):
        radius_sq = float(np.dot(undistorted, undistorted))
        undistorted = distorted / (1.0 + radial * radius_sq)
    return np.array([undistorted[0], undistorted[1], 1.0], dtype=np.float64)


def intersect_pixel_with_plane(
    pixel: np.ndarray,
    rotation: np.ndarray,
    translation: np.ndarray,
    camera: tuple[float, float, float, float],
    normal: np.ndarray,
    offset: float,
) -> np.ndarray:
    focal, cx, cy, radial = camera
    camera_center = -rotation.T @ translation
    direction = rotation.T @ undistorted_ray(pixel, focal, cx, cy, radial)
    distance = -(float(np.dot(normal, camera_center)) + offset) / float(np.dot(normal, direction))
    return camera_center + direction * distance


def solve_similarity(source: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    # Try the orientation-preserving and mirrored 2D similarity forms.
    candidates = []
    for mirrored in (False, True):
        matrix = []
        values = []
        for (x, y), (tx, ty) in zip(source, target):
            if not mirrored:
                matrix.extend(([x, -y, 1, 0], [y, x, 0, 1]))
            else:
                matrix.extend(([x, y, 1, 0], [-y, x, 0, 1]))
            values.extend((tx, ty))
        solution, *_ = np.linalg.lstsq(np.asarray(matrix), np.asarray(values), rcond=None)
        a, b, shift_x, shift_y = solution
        if not mirrored:
            linear = np.array([[a, -b], [b, a]])
        else:
            linear = np.array([[a, b], [b, -a]])
        shift = np.array([shift_x, shift_y])
        residual = float(np.sqrt(np.mean(np.sum((source @ linear.T + shift - target) ** 2, axis=1))))
        candidates.append((linear, shift, residual))
    return min(candidates, key=lambda item: item[2])


def render_top(
    points_xzh: np.ndarray,
    colors: np.ndarray,
    arena: np.ndarray,
    output: Path,
    point_mask: np.ndarray | None = None,
    point_radius: int = 1,
    title: str = "COLMAP multi-view top reference | 0.5 KSplat-unit grid",
) -> None:
    x_bounds = (-5.25, 3.90)
    z_bounds = (-3.25, 4.30)
    width = 2200
    height = round(width * (z_bounds[1] - z_bounds[0]) / (x_bounds[1] - x_bounds[0]))
    canvas = np.full((height, width, 3), 28, dtype=np.uint8)

    if point_mask is None:
        point_mask = np.ones(len(points_xzh), dtype=bool)
    x_pixels = np.rint((points_xzh[:, 0] - x_bounds[0]) / (x_bounds[1] - x_bounds[0]) * (width - 1)).astype(int)
    z_pixels = np.rint((points_xzh[:, 1] - z_bounds[0]) / (z_bounds[1] - z_bounds[0]) * (height - 1)).astype(int)
    valid = (x_pixels >= 0) & (x_pixels < width) & (z_pixels >= 0) & (z_pixels < height)
    valid &= point_mask
    order = np.argsort(points_xzh[:, 2])
    for index in order[valid[order]]:
        px = x_pixels[index]
        py = z_pixels[index]
        color = colors[index]
        canvas[
            max(0, py - point_radius) : min(height, py + point_radius + 1),
            max(0, px - point_radius) : min(width, px + point_radius + 1),
        ] = color

    image = Image.fromarray(canvas)
    draw = ImageDraw.Draw(image, "RGBA")
    for x in np.arange(math.ceil(x_bounds[0] * 2) / 2, x_bounds[1] + 0.001, 0.5):
        px = (x - x_bounds[0]) / (x_bounds[1] - x_bounds[0]) * (width - 1)
        draw.line((px, 0, px, height), fill=(255, 110, 40, 70), width=1)
    for z in np.arange(math.ceil(z_bounds[0] * 2) / 2, z_bounds[1] + 0.001, 0.5):
        py = (z - z_bounds[0]) / (z_bounds[1] - z_bounds[0]) * (height - 1)
        draw.line((0, py, width, py), fill=(255, 110, 40, 70), width=1)
    arena_pixels = []
    for x, z in arena:
        arena_pixels.append(
            (
                (x - x_bounds[0]) / (x_bounds[1] - x_bounds[0]) * (width - 1),
                (z - z_bounds[0]) / (z_bounds[1] - z_bounds[0]) * (height - 1),
            )
        )
    draw.line(arena_pixels + [arena_pixels[0]], fill=(0, 255, 255, 255), width=5)
    draw.text((18, 16), title, fill=(255, 255, 255, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def main() -> None:
    points, colors = read_points()
    images = read_images()
    camera = read_camera()
    camera_centers = np.asarray([-rotation.T @ translation for rotation, translation in images.values()])
    normal, offset, diagnostics = fit_ground_plane(points, camera_centers)
    rotation, translation = images["frame_00401.jpg"]

    # Stable in-plane basis; its arbitrary heading is removed by the arena fit.
    centered_cameras = camera_centers - np.mean(camera_centers, axis=0)
    _, _, orbit_axes = np.linalg.svd(centered_cameras, full_matrices=False)
    basis_x = orbit_axes[0] - normal * np.dot(orbit_axes[0], normal)
    basis_x /= np.linalg.norm(basis_x)
    basis_z = np.cross(normal, basis_x)
    basis_z /= np.linalg.norm(basis_z)

    arena_native_3d = np.asarray(
        [
            intersect_pixel_with_plane(pixel, rotation, translation, camera, normal, offset)
            for pixel in ARENA_PIXELS
        ]
    )
    arena_native_2d = np.column_stack((arena_native_3d @ basis_x, arena_native_3d @ basis_z))
    linear, shift, residual = solve_similarity(arena_native_2d, ARENA_TARGET)
    scale = math.sqrt(abs(float(np.linalg.det(linear))))
    long_length = 0.5 * (
        np.linalg.norm(arena_native_3d[1] - arena_native_3d[0])
        + np.linalg.norm(arena_native_3d[2] - arena_native_3d[3])
    )
    short_length = 0.5 * (
        np.linalg.norm(arena_native_3d[2] - arena_native_3d[1])
        + np.linalg.norm(arena_native_3d[3] - arena_native_3d[0])
    )

    source_2d = np.column_stack((points @ basis_x, points @ basis_z))
    aligned_2d = source_2d @ linear.T + shift
    aligned_height = (points @ normal + offset) * scale
    aligned = np.column_stack((aligned_2d, aligned_height))
    aligned_arena = arena_native_2d @ linear.T + shift

    diagnostics.update(
        {
            "arena_native_3d": arena_native_3d.tolist(),
            "arena_aligned": aligned_arena.tolist(),
            "arena_target": ARENA_TARGET.tolist(),
            "arena_fit_rms_splat_units": residual,
            "arena_native_aspect_ratio": float(long_length / short_length),
            "scale_splat_per_colmap": scale,
            "basis_x": basis_x.tolist(),
            "basis_z": basis_z.tolist(),
            "similarity_linear": linear.tolist(),
            "similarity_shift": shift.tolist(),
        }
    )

    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "paasleben-aligned-points.npz", xzh=aligned, rgb=colors)
    (OUT / "alignment.json").write_text(json.dumps(diagnostics, indent=2), encoding="utf-8")
    render_top(aligned, colors, aligned_arena, OUT / "paasleben-multiview-top.png")
    render_top(
        aligned,
        colors,
        aligned_arena,
        OUT / "paasleben-ground-top.png",
        point_mask=np.abs(aligned[:, 2]) < 0.030,
        point_radius=2,
        title="COLMAP ground layer | |height| < 0.9 m | 0.5-unit grid",
    )
    render_top(
        aligned,
        colors,
        aligned_arena,
        OUT / "paasleben-roof-top.png",
        point_mask=(aligned[:, 2] > 0.075) & (aligned[:, 2] < 0.36),
        point_radius=3,
        title="COLMAP roofs / trees | 2.25-10.8 m | 0.5-unit grid",
    )
    print(json.dumps(diagnostics, indent=2))


if __name__ == "__main__":
    main()
