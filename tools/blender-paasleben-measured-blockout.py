"""Measured Paasleben blockout based on the transformed scene.ksplat.

This is intentionally a validation scene: dimensions, spacing and the hierarchy
of fields/roads/buildings come before realistic grass, materials or final light.
One transformed KSplat unit is mapped to 30 Blender metres so relative dimensions
from the aerial survey remain intact.
"""

import bpy
import json
import math
import os
from mathutils import Euler, Vector
from pathlib import Path

ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
OUT = ROOT / 'artifacts'
U = 30.0
ROAD_CORRIDORS = []


def w(x, z, height=0.0):
    """KSplat x/z -> Blender x/y/z. Negated y matches the reference screenshots."""
    return (x * U, -z * U, height)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def mat(name, color, roughness=0.72, metallic=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return material


def assign(obj, material):
    if material:
        obj.data.materials.append(material)
    return obj


def cube(name, location, dimensions, material, rotation=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel > 0:
        modifier = obj.modifiers.new('Soft blockout edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cylinder(name, location, radius, depth, material, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    return obj


def ico(name, location, radius, material, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    return obj


def torus(name, location, major_radius, minor_radius, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    return obj


def orient_local_z(obj, direction):
    """Rotate an object's local Z axis onto an arbitrary world direction."""
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector(direction).normalized().to_track_quat('Z', 'Y')
    return obj


def upright_ring(name, location, radius, thickness, material, yaw_deg=0.0):
    """Vertical survey ring used for the large wheel/arch sculptures."""
    yaw = math.radians(-yaw_deg)
    normal = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    return orient_local_z(torus(name, location, radius, thickness, material), normal)


def axial_cylinder(name, location, radius, depth, material, direction, vertices=16):
    return orient_local_z(cylinder(name, location, radius, depth, material, vertices=vertices), direction)


def flywheel_sculpture(name, x, z, radius_m, yaw_deg, material, spokes=6):
    """Coarse but recognisable version of the documented Werkstatt flywheel."""
    bx, by, _ = w(x, z)
    center = Vector((bx, by, radius_m + 0.24))
    yaw = math.radians(-yaw_deg)
    normal = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    horizontal = Vector((-normal.y, normal.x, 0.0))
    upright_ring(f'{name}_rim', center, radius_m, 0.24, material, yaw_deg)
    axial_cylinder(f'{name}_hub', center, 0.52, 0.72, material, normal, vertices=18)
    for spoke_index in range(spokes):
        angle = math.tau * spoke_index / spokes
        end = center + horizontal * math.cos(angle) * (radius_m - 0.38) + Vector((0, 0, math.sin(angle) * (radius_m - 0.38)))
        beam(f'{name}_spoke_{spoke_index:02d}', center, end, 0.20, material)


def stacked_ring_sculpture(name, x, z, yaw_deg, material):
    """Three-circle field silhouette visible in the west-paddock references."""
    bx, by, _ = w(x, z)
    rings = ((1.72, 5.45), (1.15, 2.78), (0.58, 0.92))
    for ring_index, (radius, center_height) in enumerate(rings):
        upright_ring(f'{name}_ring_{ring_index:02d}', (bx, by, center_height), radius, 0.18, material, yaw_deg)


def q_sculpture(name, x, z, yaw_deg, material):
    """Low oval-and-tail Corten silhouette documented beside the Piazza."""
    bx, by, _ = w(x, z)
    center = Vector((bx, by, 1.72))
    yaw = math.radians(-yaw_deg)
    normal = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    horizontal = Vector((-normal.y, normal.x, 0.0))
    upright_ring(f'{name}_ring', center, 1.46, 0.24, material, yaw_deg)
    beam(
        f'{name}_tail',
        center + horizontal * 0.42 + Vector((0, 0, -1.18)),
        center + horizontal * 1.62 + Vector((0, 0, -1.43)),
        0.26,
        material,
    )


def triangle_sculpture(name, x, z, yaw_deg, material, height=4.4, width=2.8):
    """Open pointed field sculpture visible in the horse-paddock gallery."""
    bx, by, _ = w(x, z)
    yaw = math.radians(-yaw_deg)
    normal = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    horizontal = Vector((-normal.y, normal.x, 0.0))
    center = Vector((bx, by, 0.0))
    left = center - horizontal * width / 2 + Vector((0, 0, 0.22))
    right = center + horizontal * width / 2 + Vector((0, 0, 0.22))
    apex = center + Vector((0, 0, height))
    beam(f'{name}_left', left, apex, 0.22, material)
    beam(f'{name}_right', right, apex, 0.22, material)
    beam(f'{name}_base', left, right, 0.18, material)


def column_sculpture_group(name, x, z, yaw_deg, material):
    """Varied industrial pillars shown in the same Werkstatt view as the wheel."""
    bx, by, _ = w(x, z)
    yaw = math.radians(-yaw_deg)
    direction = Vector((math.cos(yaw), math.sin(yaw)))
    heights = (2.15, 2.75, 3.20, 2.45, 3.55, 2.90, 3.85, 3.25)
    for index, height in enumerate(heights):
        offset = (index - (len(heights) - 1) / 2) * 0.86
        cx = bx + direction.x * offset
        cy = by + direction.y * offset
        cylinder(f'{name}_{index:02d}_shaft', (cx, cy, height / 2 + 0.18), 0.22, height, material, vertices=10)
        cube(
            f'{name}_{index:02d}_capital',
            (cx, cy, height + 0.30),
            (0.72, 0.72, 0.28),
            material,
            rotation=yaw + (index % 2) * math.radians(18),
            bevel=0.06,
        )


def polygon_prism(name, points, top_z, depth, material):
    verts = [(x, y, top_z) for x, y in points] + [(x, y, top_z - depth) for x, y in points]
    count = len(points)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def site_polygon(name, coords, z, depth, material):
    return polygon_prism(name, [(x * U, -zz * U) for x, zz in coords], z, depth, material)


def ellipse_points(cx, cz, rx, rz, count=48, rotation_deg=0):
    angle = math.radians(rotation_deg)
    result = []
    for i in range(count):
        t = math.tau * i / count
        dx = math.cos(t) * rx
        dz = math.sin(t) * rz
        result.append((cx + dx * math.cos(angle) - dz * math.sin(angle), cz + dx * math.sin(angle) + dz * math.cos(angle)))
    return result


def curve_polyline(name, coords, height, radius, material, cyclic=False):
    curve_data = bpy.data.curves.new(name, 'CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = 1
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 2
    curve_data.resolution_u = 2
    spline = curve_data.splines.new('POLY')
    spline.points.add(len(coords) - 1)
    for point, (x, z) in zip(spline.points, coords):
        bx, by, _ = w(x, z)
        point.co = (bx, by, height, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def road(name, coords, width_m, material, height=0.16):
    # Flat ribbon made of shallow slabs. Using bevelled curves here would turn
    # every road into a round pipe and visually inflate its width.
    ROAD_CORRIDORS.append((tuple(coords), width_m))
    for index, (a, b) in enumerate(zip(coords, coords[1:])):
        av = Vector(w(*a, height))
        bv = Vector(w(*b, height))
        delta = bv - av
        center = (av + bv) / 2
        cube(
            f'{name}_segment_{index:02d}',
            center,
            (delta.length + width_m * 0.20, width_m, 0.18),
            material,
            rotation=math.atan2(delta.y, delta.x),
            bevel=0.12,
        )
    for index, (x, z) in enumerate(coords[1:-1], start=1):
        bx, by, _ = w(x, z)
        cylinder(f'{name}_joint_{index:02d}', (bx, by, height), width_m / 2, 0.18, material, vertices=24)


def beam(name, a, b, thickness, material):
    av = Vector(a)
    bv = Vector(b)
    delta = bv - av
    center = (av + bv) / 2
    obj = cube(name, center, (thickness, thickness, delta.length), material)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    return obj


def sample_polyline(coords, spacing_splat, include_last=True):
    sampled = []
    for a, b in zip(coords, coords[1:]):
        va = Vector(a)
        vb = Vector(b)
        length = (vb - va).length
        count = max(1, int(length / spacing_splat))
        for i in range(count):
            t = i / count
            sampled.append(tuple(va.lerp(vb, t)))
    if include_last:
        sampled.append(coords[-1])
    return sampled


def point_near_registered_road(x, z, clearance_m=0.28):
    """True when a fence point would sit inside a generated road corridor."""
    point = Vector((x, z))
    for road_coords, width_m in ROAD_CORRIDORS:
        threshold = width_m / (2 * U) + clearance_m / U
        for a, b in zip(road_coords, road_coords[1:]):
            av = Vector(a)
            bv = Vector(b)
            segment = bv - av
            length_squared = segment.length_squared
            if length_squared <= 1e-12:
                distance = (point - av).length
            else:
                t = max(0.0, min(1.0, (point - av).dot(segment) / length_squared))
                distance = (point - av.lerp(bv, t)).length
            if distance <= threshold:
                return True
    return False


def fence_line(name, coords, material, spacing_splat=0.22, rails=True, height_m=1.45):
    pts = sample_polyline(coords, spacing_splat)
    kept = []
    for index, (x, z) in enumerate(pts):
        keep = not point_near_registered_road(x, z)
        kept.append(keep)
        if not keep:
            continue
        bx, by, _ = w(x, z)
        cylinder(f'{name}_post_{index:03d}', (bx, by, height_m / 2), 0.10, height_m, material, vertices=8)
    if rails:
        for level in (0.52, 1.05):
            for index, (a, b) in enumerate(zip(pts, pts[1:])):
                midpoint = (Vector(a) + Vector(b)) / 2
                if not (kept[index] and kept[index + 1]) or point_near_registered_road(*midpoint):
                    continue
                ax, ay, _ = w(*a)
                bx, by, _ = w(*b)
                beam(f'{name}_rail_{level}_{index}', (ax, ay, level), (bx, by, level), 0.09, material)


def fence_loop(name, coords, material, spacing_splat=0.22, rails=True):
    fence_line(name, coords + [coords[0]], material, spacing_splat=spacing_splat, rails=rails)


def wire_enclosure(name, coords, material, height_m=2.0, spacing_splat=0.16, roof_frame=False):
    """Thin enclosure used for the poultry/aviary footprints visible in the scan."""
    loop = coords + [coords[0]]
    sampled = sample_polyline(loop, spacing_splat)
    kept = []
    for index, (x, z) in enumerate(sampled):
        keep = not point_near_registered_road(x, z)
        kept.append(keep)
        if not keep:
            continue
        bx, by, _ = w(x, z)
        cylinder(f'{name}_post_{index:03d}', (bx, by, height_m / 2), 0.055, height_m, material, vertices=8)
    for level in (0.42, height_m * 0.58, height_m - 0.12):
        for segment_index, (a, b) in enumerate(zip(sampled, sampled[1:])):
            midpoint = (Vector(a) + Vector(b)) / 2
            if not (kept[segment_index] and kept[segment_index + 1]) or point_near_registered_road(*midpoint):
                continue
            ax, ay, _ = w(*a)
            bx, by, _ = w(*b)
            beam(
                f'{name}_wire_{level:.2f}_{segment_index:03d}',
                (ax, ay, level),
                (bx, by, level),
                0.025,
                material,
            )
    if roof_frame:
        curve_polyline(f'{name}_roof_perimeter', coords, height_m, 0.035, material, cyclic=True)
        for diagonal_index, (a, b) in enumerate(((coords[0], coords[2]), (coords[1], coords[3]))):
            ax, ay, _ = w(*a)
            bx, by, _ = w(*b)
            beam(f'{name}_roof_cross_{diagonal_index}', (ax, ay, height_m), (bx, by, height_m), 0.045, material)


def offset_polyline(coords, offset_splat):
    result = []
    for index, point in enumerate(coords):
        prev = Vector(coords[max(0, index - 1)])
        nxt = Vector(coords[min(len(coords) - 1, index + 1)])
        tangent = (nxt - prev).normalized()
        normal = Vector((-tangent.y, tangent.x))
        result.append(tuple(Vector(point) + normal * offset_splat))
    return result


def tree(name, x, z, scale=1.0, crown_material=None):
    bx, by, _ = w(x, z)
    trunk_h = 4.8 * scale
    cylinder(f'{name}_trunk', (bx, by, trunk_h / 2), 0.32 * scale, trunk_h, trunk, vertices=8)
    # A small crown cluster reads much closer to the irregular deciduous trees
    # in the scan than a single geometric lollipop.  The offsets are fixed so
    # the measured ground position remains deterministic and auditable.
    crown_specs = (
        (0.00, 0.00, 1.38, 2.14, crown_material or leaf_a),
        (0.82, -0.28, 1.02, 1.58, leaf_b),
        (-0.66, -0.18, 0.92, 1.42, crown_material or leaf_a),
        (0.10, 0.70, 1.10, 1.34, leaf_b),
    )
    for crown_index, (ox, oy, oz, radius, material) in enumerate(crown_specs):
        crown = ico(
            f'{name}_crown_{crown_index:02d}',
            (bx + ox * scale, by + oy * scale, trunk_h + oz * scale),
            radius * scale,
            material,
            1,
        )
        crown.scale.z = 0.88 + crown_index * 0.035


def tree_line(name, coords, spacing_splat=0.42, offset=0.0, start_index=0):
    line = offset_polyline(coords, offset) if offset else coords
    for index, (x, z) in enumerate(sample_polyline(line, spacing_splat)):
        variant = 0.82 + ((index + start_index) % 5) * 0.07
        tree(f'{name}_{index:03d}', x, z, variant, leaf_a if index % 2 else leaf_b)


def hedge_line(
    name,
    coords,
    spacing_splat=0.16,
    offset=0.0,
    start_index=0,
    radius_m=1.55,
    center_height_m=1.15,
):
    """Low, dense survey-volume placeholder for the hedgerows visible in the Splat."""
    line = offset_polyline(coords, offset) if offset else coords
    for index, (x, z) in enumerate(sample_polyline(line, spacing_splat)):
        bx, by, _ = w(x, z)
        variant = 0.82 + ((index + start_index) % 6) * 0.055
        ico(
            f'{name}_{index:03d}',
            (bx, by, center_height_m * variant),
            radius_m * variant,
            hedge_a if index % 3 else hedge_b,
            1,
        )


def rotated_rect(cx, cz, length, width, angle_deg):
    angle = math.radians(angle_deg)
    ux = Vector((math.cos(angle), math.sin(angle)))
    uy = Vector((-math.sin(angle), math.cos(angle)))
    center = Vector((cx, cz))
    return [tuple(center + ux * sx * length / 2 + uy * sy * width / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def gable_roof(name, cx, cz, length_s, width_s, angle_deg, eave_z, roof_h, material):
    length = length_s * U
    width = width_s * U
    verts_local = [
        (-length / 2, -width / 2, eave_z),
        (length / 2, -width / 2, eave_z),
        (length / 2, width / 2, eave_z),
        (-length / 2, width / 2, eave_z),
        (-length / 2, 0, eave_z + roof_h),
        (length / 2, 0, eave_z + roof_h),
    ]
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)]
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    mesh.from_pydata(verts_local, [], faces)
    mesh.update()
    bx, by, _ = w(cx, cz)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (bx, by, 0)
    obj.rotation_euler[2] = math.radians(-angle_deg)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def hip_roof(name, cx, cz, length_s, width_s, angle_deg, eave_z, roof_h, material):
    """Four-sided roof with a short ridge, used by the verified square houses."""
    length = length_s * U
    width = width_s * U
    ridge_half = max(0.0, (length - width) / 2)
    verts_local = [
        (-length / 2, -width / 2, eave_z),
        (length / 2, -width / 2, eave_z),
        (length / 2, width / 2, eave_z),
        (-length / 2, width / 2, eave_z),
        (-ridge_half, 0, eave_z + roof_h),
        (ridge_half, 0, eave_z + roof_h),
    ]
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)]
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    mesh.from_pydata(verts_local, [], faces)
    mesh.update()
    bx, by, _ = w(cx, cz)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (bx, by, 0)
    obj.rotation_euler[2] = math.radians(-angle_deg)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def building(name, cx, cz, length_s, width_s, angle_deg, height_m, wall_material, roof_material, roof_h=2.0, roof_overhang_s=0.025):
    bx, by, _ = w(cx, cz)
    cube(
        f'{name}_body',
        (bx, by, height_m / 2 + 0.22),
        (length_s * U, width_s * U, height_m),
        wall_material,
        rotation=math.radians(-angle_deg),
        bevel=0.12,
    )
    gable_roof(
        f'{name}_roof',
        cx,
        cz,
        length_s + roof_overhang_s,
        width_s + roof_overhang_s,
        angle_deg,
        height_m + 0.22,
        roof_h,
        roof_material,
    )


def hip_building(name, cx, cz, length_s, width_s, angle_deg, height_m, wall_material, roof_material, roof_h=1.4, roof_overhang_s=0.025):
    bx, by, _ = w(cx, cz)
    cube(
        f'{name}_body',
        (bx, by, height_m / 2 + 0.22),
        (length_s * U, width_s * U, height_m),
        wall_material,
        rotation=math.radians(-angle_deg),
        bevel=0.12,
    )
    hip_roof(
        f'{name}_roof',
        cx,
        cz,
        length_s + roof_overhang_s,
        width_s + roof_overhang_s,
        angle_deg,
        height_m + 0.22,
        roof_h,
        roof_material,
    )


def flat_building(name, cx, cz, length_s, width_s, angle_deg, height_m, wall_material, roof_material):
    """Flat-roofed industrial block visible in the central aerial cluster."""
    bx, by, _ = w(cx, cz)
    rotation = math.radians(-angle_deg)
    # Direct KSplat measurements describe the visible roof silhouette.  Keep
    # the wall volume inset so adjoining roofs can meet without two buildings
    # occupying the same physical space.
    body_length = max(0.02, length_s - 0.045)
    body_width = max(0.02, width_s - 0.045)
    cube(
        f'{name}_body',
        (bx, by, height_m / 2 + 0.22),
        (body_length * U, body_width * U, height_m),
        wall_material,
        rotation=rotation,
        bevel=0.12,
    )
    cube(
        f'{name}_flat_roof',
        (bx, by, height_m + 0.42),
        (length_s * U, width_s * U, 0.40),
        roof_material,
        rotation=rotation,
        bevel=0.08,
    )


def roof_band(name, cx, cz, length_s, angle_deg, height_m, material):
    bx, by, _ = w(cx, cz)
    cube(
        name,
        (bx, by, height_m),
        (length_s * U, 0.42, 0.28),
        material,
        rotation=math.radians(-angle_deg),
        bevel=0.06,
    )


def end_panel(name, cx, cz, length_s, width_s, angle_deg, height_m, material, end=1):
    rotation = math.radians(-angle_deg)
    axis = Vector((math.cos(rotation), math.sin(rotation)))
    bx, by, _ = w(cx, cz)
    center = Vector((bx, by)) + axis * end * (length_s * U / 2 + 0.14)
    cube(
        name,
        (center.x, center.y, height_m * 0.34 + 0.22),
        (0.30, width_s * U * 0.70, height_m * 0.68),
        material,
        rotation=rotation,
        bevel=0.05,
    )


def facade_panel(name, cx, cz, width_s, angle_deg, along_m, side, width_m, height_m, center_height_m, material):
    """Thin door/window survey panel on one long building facade."""
    rotation = math.radians(-angle_deg)
    axis = Vector((math.cos(rotation), math.sin(rotation)))
    lateral = Vector((-axis.y, axis.x))
    bx, by, _ = w(cx, cz)
    center = Vector((bx, by)) + axis * along_m + lateral * side * (width_s * U / 2 + 0.08)
    return cube(
        name,
        (center.x, center.y, center_height_m + 0.22),
        (width_m, 0.16, height_m),
        material,
        rotation=rotation,
        bevel=0.025,
    )


def prop_block(name, x, z, dimensions, angle_deg, material, height_offset=0.22):
    bx, by, _ = w(x, z)
    return cube(
        name,
        (bx, by, dimensions[2] / 2 + height_offset),
        dimensions,
        material,
        rotation=math.radians(-angle_deg),
        bevel=min(dimensions) * 0.08,
    )


def arena_goal(name, cx, cz, length_s, angle_deg, end, material):
    rotation = math.radians(-angle_deg)
    axis = Vector((math.cos(rotation), math.sin(rotation)))
    lateral = Vector((-axis.y, axis.x))
    bx, by, _ = w(cx, cz)
    center = Vector((bx, by)) + axis * end * (length_s * U / 2 - 1.6)
    left = center + lateral * 1.75
    right = center - lateral * 1.75
    beam(f'{name}_left', (left.x, left.y, 0.24), (left.x, left.y, 2.45), 0.12, material)
    beam(f'{name}_right', (right.x, right.y, 0.24), (right.x, right.y, 2.45), 0.12, material)
    beam(f'{name}_crossbar', (left.x, left.y, 2.45), (right.x, right.y, 2.45), 0.12, material)


def utility_pole(name, x, z, height_m, material):
    bx, by, _ = w(x, z)
    cylinder(f'{name}_mast', (bx, by, height_m / 2), 0.16, height_m, material, vertices=10)
    cube(f'{name}_crossbar', (bx, by, height_m - 0.45), (3.2, 0.18, 0.18), material, bevel=0.03)


def ellipse_fence(name, cx, cz, rx, rz, material, rotation_deg=0, posts=36):
    coords = ellipse_points(cx, cz, rx, rz, posts, rotation_deg)
    curve_polyline(f'{name}_rail_top', coords, 1.15, 0.09, material, cyclic=True)
    curve_polyline(f'{name}_rail_low', coords, 0.58, 0.08, material, cyclic=True)
    for index, (x, z) in enumerate(coords):
        bx, by, _ = w(x, z)
        cylinder(f'{name}_post_{index:03d}', (bx, by, 0.72), 0.10, 1.44, material, vertices=8)


def horse_marker(name, x, z, heading=0, scale=1.0, material=None):
    bx, by, _ = w(x, z)
    rotation = math.radians(-heading)
    body = cube(f'{name}_body', (bx, by, 1.6 * scale), (3.0 * scale, 1.05 * scale, 1.35 * scale), material or animal, rotation=rotation, bevel=0.3)
    forward = Vector((math.cos(rotation), math.sin(rotation), 0))
    head_pos = Vector((bx, by, 2.15 * scale)) + forward * 1.75 * scale
    ico(f'{name}_head', head_pos, 0.72 * scale, material or animal, 1)
    for leg_index, (dx, dy) in enumerate(((-0.9, -0.32), (-0.9, 0.32), (0.9, -0.32), (0.9, 0.32))):
        local = Vector((dx * scale, dy * scale, 0))
        world = local.copy()
        world.rotate(Euler((0, 0, rotation)))
        cylinder(f'{name}_leg_{leg_index}', (bx + world.x, by + world.y, 0.70 * scale), 0.12 * scale, 1.4 * scale, material or animal, vertices=7)
    return body


def nandu_marker(name, x, z, heading=0, scale=1.0, material=None):
    """Simple long-necked Nandu silhouette for the documented west pasture."""
    bx, by, _ = w(x, z)
    rotation = math.radians(-heading)
    forward = Vector((math.cos(rotation), math.sin(rotation), 0.0))
    used_material = material or animal

    body = ico(f'{name}_body', (bx, by, 1.22 * scale), 1.0, used_material, 2)
    body.scale = (1.38 * scale, 0.82 * scale, 1.02 * scale)
    body.rotation_euler[2] = rotation

    neck_base = Vector((bx, by, 1.45 * scale)) + forward * 0.72 * scale
    neck_direction = Vector((forward.x * 0.30, forward.y * 0.30, 1.0)).normalized()
    neck_length = 1.70 * scale
    neck_center = neck_base + neck_direction * neck_length / 2
    axial_cylinder(f'{name}_neck', neck_center, 0.13 * scale, neck_length, used_material, neck_direction, vertices=10)
    head_center = neck_base + neck_direction * neck_length + forward * 0.12 * scale
    ico(f'{name}_head', head_center, 0.30 * scale, used_material, 1)
    beam(
        f'{name}_beak',
        head_center + forward * 0.18 * scale,
        head_center + forward * 0.68 * scale,
        0.10 * scale,
        used_material,
    )

    lateral = Vector((-forward.y, forward.x, 0.0))
    for leg_index, side in enumerate((-1, 1)):
        leg_center = Vector((bx, by, 0.55 * scale)) + lateral * side * 0.20 * scale
        cylinder(f'{name}_leg_{leg_index}', leg_center, 0.09 * scale, 1.10 * scale, used_material, vertices=7)
    return body


def location_marker(collection, number, title, x, z):
    bx, by, _ = w(x, z)
    marker_height = 42.0
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.90, depth=0.22, location=(bx, by, marker_height))
    disc = bpy.context.object
    disc.name = f'Marker_{number}_{title}'
    assign(disc, marker_orange)
    for previous in tuple(disc.users_collection):
        previous.objects.unlink(disc)
    collection.objects.link(disc)
    bpy.ops.object.text_add(location=(bx, by, marker_height + 0.14), rotation=(0, 0, 0))
    text = bpy.context.object
    text.name = f'MarkerText_{number}'
    text.data.body = number
    text.data.align_x = 'CENTER'
    text.data.align_y = 'CENTER'
    text.data.size = 1.55
    text.data.extrude = 0.035
    assign(text, marker_ink)
    for previous in tuple(text.users_collection):
        previous.objects.unlink(text)
    collection.objects.link(text)


clear_scene()

# Validation palette. Final realism deliberately comes later.
base_dark = mat('Base dark', (0.045, 0.09, 0.075))
terrain_fill = mat('Survey grass base', (0.31, 0.45, 0.22))
field_a = mat('Pasture light', (0.42, 0.60, 0.23))
field_b = mat('Pasture middle', (0.26, 0.47, 0.18))
field_c = mat('Pasture muted', (0.35, 0.48, 0.22))
crop = mat('Crop field', (0.18, 0.37, 0.12))
rough_ground = mat('Rough farm ground', (0.41, 0.37, 0.25))
road_mat = mat('Roads', (0.71, 0.66, 0.52))
asphalt = mat('Public asphalt', (0.17, 0.20, 0.19))
yard_mat = mat('Courtyards', (0.57, 0.54, 0.47))
sand = mat('Sand', (0.86, 0.68, 0.33))
water = mat('Pond', (0.075, 0.33, 0.39), roughness=0.68)
brick = mat('Brick', (0.53, 0.17, 0.075))
brick_light = mat('Brick light', (0.72, 0.30, 0.12))
white = mat('White walls', (0.79, 0.81, 0.72))
cream = mat('Cream walls', (0.82, 0.68, 0.42))
roof_blue = mat('Blue grey roofs', (0.16, 0.33, 0.38), metallic=0.22)
roof_flat_gray = mat('Flat grey roofs', (0.34, 0.40, 0.38), metallic=0.14)
roof_dark = mat('Dark roofs', (0.10, 0.12, 0.105), metallic=0.18)
roof_red = mat('Red roofs', (0.52, 0.13, 0.07))
wood = mat('Fence wood', (0.39, 0.20, 0.075))
trunk = mat('Tree trunks', (0.19, 0.095, 0.035))
leaf_a = mat('Tree crowns A', (0.29, 0.54, 0.13))
leaf_b = mat('Tree crowns B', (0.48, 0.65, 0.16))
hedge_a = mat('Hedgerow A', (0.18, 0.34, 0.085))
hedge_b = mat('Hedgerow B', (0.27, 0.43, 0.11))
track = mat('Crop tracks', (0.67, 0.62, 0.35))
corten = mat('Corten sculpture', (0.78, 0.22, 0.045), metallic=0.55)
steel = mat('Survey steel', (0.24, 0.29, 0.27), metallic=0.52)
glass_dark = mat('Survey window glass', (0.08, 0.16, 0.17), roughness=0.24, metallic=0.18)
door_dark = mat('Survey doors', (0.19, 0.16, 0.12), roughness=0.62, metallic=0.05)
equipment_yellow = mat('Equipment yellow', (0.84, 0.49, 0.055), metallic=0.18)
equipment_red = mat('Equipment red', (0.70, 0.10, 0.055), metallic=0.20)
equipment_blue = mat('Equipment blue', (0.10, 0.31, 0.43), metallic=0.28)
equipment_pale = mat('Equipment pale', (0.65, 0.64, 0.55), metallic=0.14)
animal = mat('Animal markers', (0.17, 0.07, 0.035))
marker_orange = mat('Validation orange', (1.0, 0.44, 0.04))
marker_ink = mat('Validation ink', (0.035, 0.055, 0.045))

# --- Entire scan footprint and field hierarchy ---
scan_outline = [
    (-5.28, -3.06), (-3.15, -3.16), (-1.72, -2.98), (-0.10, -3.08),
    (1.72, -2.48), (3.82, -1.28), (3.84, 1.18), (2.32, 3.34),
    (-3.35, 3.94), (-4.18, 3.36), (-5.02, 1.82), (-5.28, -0.42),
]
site_polygon('Measured scan island', scan_outline, -0.30, 1.35, terrain_fill)

# Field boundaries digitised from the aligned ground orthomosaic.  The former
# hand-drawn shapes cut through the front compound and displaced the oval field
# by more than twenty metres.
west_paddock = [
    (-5.250, -0.937), (-4.672, -0.841), (-4.045, -0.745),
    (-3.323, -0.648), (-2.744, -0.504), (-2.359, -0.263),
    (-2.118, 0.219), (-2.214, 0.845), (-2.455, 1.327),
    (-2.744, 1.520), (-3.684, 1.785), (-4.383, 1.761),
    (-5.057, 1.568), (-5.250, 1.086),
]
south_pasture = [
    (-1.781, 1.568), (-1.492, 1.086), (-0.914, 0.701),
    (-0.191, 0.532), (0.773, 0.556), (1.977, 0.701),
    (2.941, 0.894), (3.808, 1.086), (3.375, 3.110),
    (2.941, 3.640), (1.977, 3.544), (0.773, 3.399),
    (-0.432, 3.399), (-1.395, 3.495), (-1.877, 3.254),
    (-1.925, 2.532),
]
crop_field = [
    (-0.287, -0.889), (0.147, -2.045), (0.773, -3.250),
    (3.857, -3.250), (3.808, 0.990), (2.941, 0.845),
    (1.977, 0.677), (1.014, 0.508), (0.050, 0.364),
    (-0.480, 0.219),
]
north_rough = [(-1.60, -2.72), (0.18, -2.92), (1.72, -2.43), (3.40, -1.30), (-0.35, -1.32)]
round_land = [
    (-4.045, -2.672), (-2.552, -2.624), (-2.359, -2.045),
    (-2.648, -1.805), (-3.274, -1.756), (-3.997, -1.901),
]
site_polygon('West horse paddock', west_paddock, 0.02, 0.20, field_b)
site_polygon('Large south east pasture', south_pasture, 0.025, 0.20, field_a)
site_polygon('Crop field', crop_field, 0.035, 0.20, crop)
site_polygon('North rough paddock', north_rough, 0.03, 0.20, field_c)
site_polygon('Round pen meadow', round_land, 0.04, 0.20, field_b)

oval_coords = [
    (-3.684, 1.785), (-3.226, 1.544), (-2.744, 1.472),
    (-2.311, 1.568), (-1.974, 1.857), (-1.781, 2.339),
    (-1.877, 2.917), (-2.118, 3.351), (-2.552, 3.592),
    (-3.082, 3.616), (-3.515, 3.423), (-3.780, 3.014),
    (-3.853, 2.484), (-3.805, 2.050),
]
site_polygon('Large oval exercise field', oval_coords, 0.08, 0.20, field_c)
fence_loop('Large_oval_fence', oval_coords, wood, spacing_splat=0.22, rails=True)

# Pond and round pen redigitised from the COLMAP ground orthomosaic.  The old
# Splat-only read confused the bright water reflection and its tree shadows for
# the shore, making the pond about twice as wide and moving the pen towards the
# halls.  These points follow the visible water line, not the shadow canopy.
pond_coords = [
    (-3.790, -1.911), (-3.612, -1.920), (-3.467, -1.833),
    (-3.371, -1.689), (-3.323, -1.515), (-3.332, -1.313),
    (-3.429, -1.140), (-3.573, -1.058), (-3.732, -1.091),
    (-3.867, -1.197), (-3.939, -1.352), (-3.930, -1.564),
    (-3.886, -1.756),
]
site_polygon('Pond water', pond_coords, 0.13, 0.16, water)
round_center = (-3.077, -2.296)
round_coords = ellipse_points(*round_center, 0.198, 0.205, 40, 3)
site_polygon('Round Pen sand', round_coords, 0.14, 0.20, sand)
ellipse_fence('Round_Pen', *round_center, 0.217, 0.225, wood, rotation_deg=3, posts=30)

# Large rectangular sand arena.  The calibrated top-campus frame and the
# corrected frame-00401 perspective-corner measurement confirms the roughly
# 31.5 x 12.3 m footprint (aspect 2.56).
# The former 37.7 x 20.5 m placeholder swallowed the grass court and physically
# intersected Frauen Haus at its north-east end.
sand_center = (-1.580, -0.860)
sand_rotation = -58.5
sand_coords = rotated_rect(*sand_center, 1.050, 0.410, sand_rotation)
site_polygon('Sandplatz', sand_coords, 0.16, 0.22, sand)
fence_loop('Sandplatz_fence', sand_coords, wood, spacing_splat=0.18, rails=True)

# Main road network. Widths remain modest so fences and trees never overlap it.
# The access lane is digitised over its full visible length in the aligned
# orthomosaic.  A previous frame-00351 crop contained only its western third,
# which caused the model road to stop in the field and to bend south of the
# real lane.  It enters at the eastern scan boundary and follows the hedge line
# all the way to the blue-shelter work yard.
entry_road = [
    (3.784, 1.048),
    (3.471, 0.980),
    (3.086, 0.884),
    (2.652, 0.807),
    (2.170, 0.720),
    (1.688, 0.629),
    (1.207, 0.537),
    (0.725, 0.460),
    (0.243, 0.388),
    (-0.143, 0.335),
    (-0.480, 0.267),
    (-0.769, 0.171),
]
entry_throat = [(-0.769, 0.171), (-0.86, 0.105), (-0.92, 0.015), (-0.96, -0.085)]
public_road = [(-3.58, 3.98), (-2.02, 3.87), (-0.24, 3.72), (1.52, 3.51), (3.18, 3.24)]
# The access is not a suburban-style ring around the northern houses.  Top
# reference 15 shows a working lane along the outside of the Sandplatz: it joins
# the hall access to the central yard and then continues toward the entry.  The
# short southern branch serves the hall/round-pen corner without enclosing the
# detached houses in an invented loop.
campus_spine = [
    (-1.18, 0.10),
    (-1.40, 0.08),
    (-1.50, 0.00),
]
hall_core_lane = [(-2.50, -0.58), (-2.24, -0.43), (-2.02, -0.28)]
south_service_branch = [(-2.50, -0.58), (-2.58, -0.92), (-2.50, -1.32), (-2.34, -1.66), (-2.42, -2.02), (-2.50, -2.38)]
west_loop = [
    (-1.154, 1.086), (-1.443, 1.375), (-1.588, 1.809),
    (-1.588, 2.339), (-1.684, 2.917), (-1.925, 3.495),
    (-2.263, 3.977),
]
hall_access = [(-3.48, -0.77), (-3.06, -0.72), (-2.72, -0.68), (-2.45, -0.58), (-2.27, -0.48)]
pond_path = [(-4.60, -1.18), (-4.25, -0.88), (-3.70, -0.76), (-3.12, -0.76), (-2.62, -0.70)]
road('Entry road', entry_road, 3.55, road_mat)
road('Entry yard throat', entry_throat, 4.35, road_mat)
road('Public boundary road', public_road, 4.2, asphalt, height=0.10)
road('Campus spine', campus_spine, 3.0, road_mat)
road('Hall core lane', hall_core_lane, 3.0, road_mat)
road('South service branch', south_service_branch, 3.0, road_mat)
# Short gate approach ending just outside the pen fence; the old endpoint sat
# directly on a fence post.
road('Round Pen spur', [(-2.74, -2.21), (-2.81, -2.23)], 2.0, road_mat)
road('West paddock road', west_loop, 3.8, road_mat)
road('Hall access', hall_access, 4.4, road_mat)
road('Pond path', pond_path, 3.2, road_mat)

# Open-space hierarchy around the building clusters.  The previous version used
# three oversized slabs which visually glued the houses, Sandplatz and halls
# together.  Birdseye and satellite references instead show grass between the
# clusters, with paving restricted to work strips and small building aprons.
site_polygon('Halls service strip', rotated_rect(-2.18, -1.19, 1.28, 0.39, -58.5), 0.10, 0.18, yard_mat)
site_polygon('Halls south apron', rotated_rect(-2.74, -1.73, 0.52, 0.44, -58.5), 0.10, 0.18, yard_mat)

core_open_ground = [
    (-2.08, -0.18), (-1.76, -0.34), (-0.82, -0.12),
    (-0.72, 0.50), (-1.48, 0.82), (-2.08, 0.51),
]
site_polygon('Core open grass', core_open_ground, 0.085, 0.18, field_c)
site_polygon('Werkstatt work apron', [(-2.01, -0.12), (-1.73, -0.24), (-1.42, -0.06), (-1.48, 0.21), (-1.84, 0.25)], 0.12, 0.12, yard_mat)
site_polygon('Atelier entry apron', rotated_rect(-1.545, 0.500, 0.36, 0.21, 111.4), 0.12, 0.12, road_mat)

north_house_lawn = [(-1.56, -2.18), (-0.55, -2.22), (-0.32, -1.12), (-1.32, -0.92)]
site_polygon('North houses grass court', north_house_lawn, 0.085, 0.18, field_c)
for apron_name, apron_coords in (
    ('Unterkunft apron', rotated_rect(-0.995, -1.900, 0.50, 0.25, 88)),
    ('Frauen Haus apron', rotated_rect(-1.150, -1.490, 0.50, 0.27, 64)),
    ('Trafo Haus apron', rotated_rect(-0.790, -1.180, 0.32, 0.25, 49)),
    ('North west house apron', rotated_rect(-1.550, -1.690, 0.51, 0.24, 82)),
    ('North utility apron', rotated_rect(-1.380, -2.230, 0.54, 0.24, 157)),
):
    site_polygon(apron_name, apron_coords, 0.11, 0.12, rough_ground)

# Irregular demolition/storage ground visible behind the northern houses.
site_polygon(
    'North storage rough yard',
    [(-0.24, -2.72), (1.72, -2.44), (1.56, -1.72), (0.20, -1.90)],
    0.075,
    0.12,
    rough_ground,
)

# --- Buildings, all centred in KSplat coordinates ---
industrial_angle = -58.5
# Local ground-to-roof spans are measured from the transformed KSplat.  The
# earlier industrial blocks were almost twice as tall as their scan volumes.
building('Halle A', -2.276, -1.311, 1.044, 0.322, industrial_angle, 3.45, brick, roof_blue, 1.25, 0.0)
building('Halle B', -2.533, -1.474, 1.018, 0.255, industrial_angle, 3.55, brick, roof_blue, 1.25, 0.0)
# The 4K drone orbit resolves the hall mass unambiguously: two long gabled
# bays, not three.  The former "Halle west annex" was a threshold band that
# combined roof/shadow samples and doubled the real width of the complex.
# The same frames show the Teich-/Pumpenhaus at the north-west hall end.  It is
# a compact, near-square brick volume with a red hipped roof.  The earlier
# reassignment to (-2.49, -2.22) put a long gable building beside the round pen
# where no building exists.
hip_building('Pumpenhaus', -2.997, -1.286, 0.190, 0.165, 27.8, 3.45, brick, roof_red, 1.75, 0.022)

# Dark covered link clearly visible between Pumpenhaus and the nearest hall
# bay in frames 00101/00141.  It is a canopy, not another building volume.
canopy_cx, canopy_cz = -2.925, -1.242
canopy_bx, canopy_by, _ = w(canopy_cx, canopy_cz)
cube(
    'Pumpenhaus covered link roof',
    (canopy_bx, canopy_by, 2.82),
    (0.200 * U, 0.078 * U, 0.26),
    roof_dark,
    rotation=math.radians(-31.6),
    bevel=0.06,
)
for canopy_post_index, canopy_offset in enumerate((-0.073, 0.073)):
    post_x = canopy_cx + math.cos(math.radians(31.6)) * canopy_offset
    post_z = canopy_cz + math.sin(math.radians(31.6)) * canopy_offset
    post_bx, post_by, _ = w(post_x, post_z)
    cube(f'Pumpenhaus link post {canopy_post_index:02d}', (post_bx, post_by, 1.38), (0.18, 0.18, 2.76), wood)

# Roof seams and large end doors are persistent silhouettes in views 15/24.
roof_band('Halle A ridge band', -2.276, -1.311, 1.00, industrial_angle, 4.94, steel)
roof_band('Halle B ridge band', -2.533, -1.474, 0.98, industrial_angle, 5.04, steel)
end_panel('Halle A south door', -2.276, -1.311, 1.044, 0.322, industrial_angle, 3.45, steel, end=-1)
end_panel('Halle B south door', -2.533, -1.474, 1.018, 0.255, industrial_angle, 3.55, steel, end=-1)

# Repeated tall openings are persistent facade silhouettes in the close hall
# views.  They materially improve the 3D read without committing to final
# glass, brick or frame shaders.
for facade_side in (-1, 1):
    for panel_index, along in enumerate((-11.8, -7.9, -4.0, 0.0, 4.0, 7.9, 11.8)):
        facade_panel(
            f'Halle A window {facade_side:+d} {panel_index:02d}',
            -2.276,
            -1.311,
            0.322,
            industrial_angle,
            along,
            facade_side,
            1.35,
            2.25,
            2.20,
            glass_dark,
        )
for panel_index, along in enumerate((-11.0, -6.6, -2.2, 2.2, 6.6, 11.0)):
    facade_panel(
        f'Halle B window {panel_index:02d}',
        -2.533,
        -1.474,
        0.255,
        industrial_angle,
        along,
        -1,
        1.25,
        2.10,
        2.10,
        glass_dark,
    )
# The working strip between the halls and Sandplatz contains many low objects.
# These measured massing blocks stand for containers, carts, pallets and tools;
# detailed assets remain a post-geometry task.
hall_yard_props = [
    (-1.82, -1.68, (4.6, 2.1, 1.9), equipment_blue),
    (-1.91, -1.52, (2.6, 1.5, 1.0), equipment_pale),
    (-2.00, -1.37, (3.4, 1.6, 1.25), equipment_red),
    (-2.09, -1.21, (2.1, 1.3, 0.75), equipment_yellow),
    (-2.18, -1.05, (3.8, 1.7, 1.45), equipment_blue),
    (-2.27, -0.90, (2.3, 1.2, 0.70), equipment_pale),
    (-2.36, -0.75, (3.2, 1.45, 1.05), equipment_red),
]
for prop_index, (px, pz, dimensions, material) in enumerate(hall_yard_props):
    prop_block(f'Hall_yard_equipment_{prop_index:02d}', px, pz, dimensions, industrial_angle, material)

# Low timber and pallet groups make the long hall-side working strip read in
# 3D without turning blurred Splat clutter into invented buildings.
for stack_index, (sx, sz, level_count) in enumerate((
    (-1.95, -1.61, 3),
    (-2.12, -1.31, 4),
    (-2.29, -1.01, 3),
)):
    for level in range(level_count):
        prop_block(
            f'Hall_material_stack_{stack_index:02d}_{level:02d}',
            sx + level * 0.004,
            sz - level * 0.003,
            (3.8, 0.62, 0.34),
            industrial_angle,
            wood if stack_index != 1 else steel,
            height_offset=0.22 + level * 0.31,
        )

for tank_index, (tx, tz, radius, depth) in enumerate(((-2.78, -0.95, 1.15, 1.8), (-2.70, -0.84, 0.92, 1.5), (-2.61, -0.76, 0.78, 1.25))):
    tbx, tby, _ = w(tx, tz)
    cylinder(f'Hall_service_tank_{tank_index:02d}', (tbx, tby, depth / 2 + 0.22), radius, depth, equipment_pale, vertices=16)

core_angle = 58
# Rear-house ground footprints are resolved from the 4K orbit in frames 00061,
# 00121, 00141, 00381 and 00421.  In the ground-plane orthomosaic the roofs are
# parallax shifted, so their centres alone are not safe measurements.  The
# multi-view orbit nevertheless fixes the undirected ridge axes: the west brick
# house and the pale south house both slope down-right on the calibrated top
# view.  The previous 116-degree axes mirrored both buildings and destroyed the
# open courtyard even though their centres were close.
building('Unterkunft', -0.995, -1.900, 0.440, 0.190, 88, 5.45, white, roof_red, 1.45)
building('Frauen Haus', -1.150, -1.490, 0.440, 0.205, 64, 5.9, cream, roof_dark, 1.60)
# The drone close-up shows a two-storey brick cube with a shallow hipped roof
# at the measured Trafo component, not the former white gable placeholder.
hip_building('Trafo Haus', -0.790, -1.180, 0.255, 0.195, 49, 5.45, brick, roof_blue, 1.05)
# The dark west house is a full two-storey brick gable, not a short pale hut.
# The former "North small shed" was only a roof/shadow fragment between the
# houses and has no independent volume in any of the opposing drone views.
building('North west house', -1.550, -1.690, 0.455, 0.180, 82, 5.8, brick, roof_dark, 1.50)
# Rear row in frames 00101/00141: two pale rendered houses with red tile
# roofs.  The former brick/dark-roof assignment made this verified fifth house
# look like a duplicate of the front-row masonry gable.
building('North utility shed', -1.380, -2.230, 0.480, 0.180, 157, 5.15, white, roof_red, 1.35)

# Chimney masses visible above the gables in the oblique Splat views.
for chimney_name, chimney_x, chimney_z, chimney_height in (
    ('Unterkunft chimney', -1.00, -1.90, 6.85),
    ('Frauen Haus chimney', -1.15, -1.49, 7.25),
    ('North west chimney', -1.55, -1.69, 7.15),
    ('North utility chimney', -1.40, -2.23, 6.45),
    ('Pumpenhaus chimney', -3.01, -1.29, 5.60),
):
    chimney_bx, chimney_by, _ = w(chimney_x, chimney_z)
    cube(
        chimney_name,
        (chimney_bx, chimney_by, chimney_height),
        (0.58, 0.58, 1.35),
        roof_dark,
        bevel=0.05,
    )

# Coarse facade rhythm for the 3D massing check.  These panels reproduce the
# visible window/door cadence without claiming photographic facade accuracy.
for panel_index, along in enumerate((-2.35, 2.35)):
    facade_panel(f'Unterkunft window {panel_index:02d}', -0.995, -1.900, 0.190, 88, along, 1, 1.25, 1.25, 2.65, glass_dark)
facade_panel('Unterkunft door', -0.995, -1.900, 0.190, 88, 0.0, 1, 1.10, 2.20, 1.10, door_dark)

for panel_index, along in enumerate((-1.75, 1.75)):
    facade_panel(f'Frauen Haus window {panel_index:02d}', -1.150, -1.490, 0.205, 64, along, 1, 1.15, 1.30, 2.80, glass_dark)
facade_panel('Frauen Haus door', -1.150, -1.490, 0.205, 64, 0.0, 1, 1.05, 2.20, 1.10, door_dark)

for panel_index, along in enumerate((-1.70, 1.70)):
    facade_panel(f'North west house window {panel_index:02d}', -1.550, -1.690, 0.180, 82, along, 1, 1.10, 1.20, 2.45, glass_dark)
facade_panel('North west house door', -1.550, -1.690, 0.180, 82, 0.0, 1, 1.05, 2.18, 1.08, door_dark)

# Secondary buildings need their characteristic dark openings to read as
# architecture in the oblique Blender views, not as anonymous survey blocks.
facade_panel('Trafo Haus door', -0.790, -1.180, 0.195, 49, 0.0, 1, 1.15, 2.35, 1.18, door_dark)
facade_panel('Trafo Haus window', -0.790, -1.180, 0.195, 49, -1.65, 1, 0.95, 1.15, 2.65, glass_dark)
facade_panel('North utility door', -1.380, -2.230, 0.180, 157, 1.45, -1, 1.10, 2.20, 1.10, door_dark)
facade_panel('North utility window', -1.380, -2.230, 0.180, 157, -1.55, -1, 1.05, 1.15, 2.45, glass_dark)
facade_panel('Pumpenhaus door', -2.997, -1.286, 0.165, 27.8, 0.95, 1, 1.25, 2.25, 1.12, door_dark)
facade_panel('Pumpenhaus window 00', -2.997, -1.286, 0.165, 27.8, -1.45, 1, 0.90, 1.05, 2.25, glass_dark)
facade_panel('Pumpenhaus window 01', -2.997, -1.286, 0.165, 27.8, 0.0, -1, 0.95, 1.10, 2.30, glass_dark)

# Small parked/service volumes visible between the northern houses.
prop_block('North yard service van', -0.62, -1.70, (4.4, 1.8, 1.75), core_angle, equipment_pale)
prop_block('North yard trailer', -0.55, -2.35, (3.6, 1.55, 1.25), core_angle, equipment_blue)

# The rough ground behind the northern houses is occupied by visible storage
# and demolition-yard masses in views 07, 14, 21 and 25.  These are deliberately
# coarse survey blocks, but they prevent the complete north sector reading as an
# empty field.  Their centres sit north of the crop boundary and away from roads.
north_rough_storage = [
    (0.12, -2.45, (5.8, 2.2, 1.15), 18, wood),
    (0.48, -2.31, (4.1, 2.0, 1.45), -11, equipment_pale),
    (0.82, -2.18, (5.2, 2.4, 1.05), 24, wood),
    (1.18, -2.03, (3.8, 2.1, 1.35), -18, steel),
    (1.50, -1.89, (4.6, 2.0, 0.92), 14, equipment_pale),
]
for storage_index, (px, pz, dimensions, angle, material) in enumerate(north_rough_storage):
    prop_block(f'North_rough_storage_{storage_index:02d}', px, pz, dimensions, angle, material)

# Parallel timber bundles are persistent long silhouettes in the northern yard.
for bundle_index, (cx, cz, angle_deg, length_m) in enumerate((
    (0.30, -2.18, 18, 5.8),
    (0.66, -2.02, 12, 6.4),
    (1.08, -1.88, 20, 5.2),
)):
    angle = math.radians(-angle_deg)
    direction = Vector((math.cos(angle), math.sin(angle)))
    bx, by, _ = w(cx, cz)
    for log_index in range(3):
        lateral = Vector((-direction.y, direction.x)) * ((log_index - 1) * 0.42)
        center = Vector((bx, by)) + lateral
        half = direction * (length_m / 2)
        beam(
            f'North_timber_bundle_{bundle_index:02d}_{log_index:02d}',
            (center.x - half.x, center.y - half.y, 0.46),
            (center.x + half.x, center.y + half.y, 0.46),
            0.26,
            wood,
        )

# The Pferde-Stall and Atelier markers lie inside one continuous 35 x 12 m
# flat-roof volume.  Modelling the marker positions as two little buildings was
# the source of the conspicuous roof overlap and left most of the real building
# missing.  The measured rectangle follows the four visible roof corners.
flat_building('Pferde Stall Atelier main block', -1.762, 0.508, 1.160, 0.414, 6.7, 7.4, brick, roof_flat_gray)
# Large attached south-east wing visible in every top-down source.  It was
# absent from the earlier blockout, making the whole front compound too small.
# The tan south-east wing is roughly half the length of the main flat block.
# The earlier 21.6 x 9.6 m mass continued far into the open gravel forecourt;
# the opposing 4K views resolve a compact attached wing of about 15.6 x 8.1 m.
flat_building('Main east wing', -0.943, 0.918, 0.520, 0.270, 55.0, 3.8, cream, roof_flat_gray)
# The two measured rectangles meet at different angles.  Their real roof has a
# small triangular transition rather than an implausible point contact or two
# boxes penetrating each other.  This prism closes exactly the wedge bounded by
# the main east wall and the wing's short north-west edge.
main_wing_connector = [(-1.203, 0.782), (-0.981, 0.628), (-1.172, 0.515)]
site_polygon('Main east wing connector body', main_wing_connector, 4.02, 3.80, cream)
site_polygon('Main east wing connector cap', main_wing_connector, 4.22, 0.40, roof_flat_gray)
# Werkstatt is a programme marker inside the continuous main block, not a
# second building placed on its roof.
flat_building('Huehner Stall', -1.720, -0.103, 0.140, 0.100, 35, 3.2, cream, roof_dark)
building('Pfauen Stall', -0.940, 0.110, 0.200, 0.170, 8.0, 4.8, white, roof_blue, 1.25)

# The 4K drone orbit resolves the bright-blue silhouette beside the tower as
# five parallel canopy bays.  The former 2 x 1.5 m hut represented only one
# isolated high-confidence splat fragment and missed the actual 9 x 8 m roof.
blue_shelter_cx, blue_shelter_cz = -0.428, 0.045
blue_shelter_angle = 87.3
blue_angle_radians = math.radians(blue_shelter_angle)
blue_across = Vector((-math.sin(blue_angle_radians), math.cos(blue_angle_radians)))
blue_body_bx, blue_body_by, _ = w(blue_shelter_cx, blue_shelter_cz)
cube(
    'Blue shelter dark body',
    (blue_body_bx, blue_body_by, 1.24),
    (0.275 * U, 0.286 * U, 2.48),
    door_dark,
    rotation=math.radians(-blue_shelter_angle),
    bevel=0.08,
)
for blue_bay_index, blue_offset in enumerate((-0.118, -0.059, 0.0, 0.059, 0.118)):
    blue_center = Vector((blue_shelter_cx, blue_shelter_cz)) + blue_across * blue_offset
    gable_roof(
        f'Blue shelter roof bay {blue_bay_index:02d}',
        blue_center.x,
        blue_center.y,
        0.285,
        0.058,
        blue_shelter_angle,
        2.58,
        0.34,
        roof_blue,
    )
    for blue_end in (-1, 1):
        axis = Vector((math.cos(blue_angle_radians), math.sin(blue_angle_radians)))
        post_center = blue_center + axis * blue_end * 0.128
        post_bx, post_by, _ = w(post_center.x, post_center.y)
        cube(
            f'Blue shelter post {blue_bay_index:02d} {blue_end:+d}',
            (post_bx, post_by, 1.30),
            (0.18, 0.18, 2.60),
            steel,
        )
# Dark rear wall and open front edge seen in frames 00351/00401.
blue_wall_center = Vector((blue_shelter_cx, blue_shelter_cz)) + blue_across * 0.145
blue_wall_bx, blue_wall_by, _ = w(blue_wall_center.x, blue_wall_center.y)
cube(
    'Blue shelter rear wall',
    (blue_wall_bx, blue_wall_by, 1.25),
    (0.285 * U, 0.24, 2.50),
    door_dark,
    rotation=math.radians(-blue_shelter_angle),
)
flat_building('South core shed', -1.948, -0.285, 0.220, 0.080, 39, 3.35, brick, roof_dark)
facade_panel('Pfauen Stall door', -0.940, 0.110, 0.170, 8.0, 0.0, 1, 1.05, 2.15, 1.08, door_dark)

for building_name, cx, cz, width_s, angle_deg, panels, levels in (
    ('Pferde Stall Atelier main block', -1.762, 0.508, 0.414, 6.7, (-12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0), (2.45, 5.15)),
    ('Main east wing', -0.943, 0.918, 0.270, 55.0, (-4.0, 0.0, 4.0), (2.30,)),
):
    for level_index, level_height in enumerate(levels):
        for panel_index, along in enumerate(panels):
            facade_panel(
                f'{building_name} window {level_index:02d} {panel_index:02d}',
                cx,
                cz,
                width_s,
                angle_deg,
                along,
                1,
                1.25,
                1.30,
                level_height,
                glass_dark,
            )

# Oval planted island next to the central flat-roof group.  It is a persistent
# dark silhouette in the top Splat and in the satellite sanity reference.
central_island = ellipse_points(-2.18, 0.86, 0.18, 0.10, 32, 31)
site_polygon('Central planted island soil', central_island, 0.155, 0.12, rough_ground)
hedge_line(
    'Central_planted_island_hedge',
    central_island + [central_island[0]],
    spacing_splat=0.055,
    start_index=2,
)

# Animal enclosures keyed to the Hühnerstall, Pfauenstall and Pferdestall
# locations. The thin frames keep the open-yard proportions readable.
chicken_run = rotated_rect(-1.720, -0.103, 0.245, 0.180, 35)
wire_enclosure('Huehnerstall_run', chicken_run, steel, height_m=1.85, spacing_splat=0.14)
prop_block('Huehnerstall_nesting_box', -1.61, -0.02, (1.8, 0.75, 0.78), 35, equipment_pale)
for perch_index, (px, pz) in enumerate(((-1.77, -0.12), (-1.70, -0.04), (-1.65, -0.14))):
    pbx, pby, _ = w(px, pz)
    cylinder(f'Huehnerstall_perch_{perch_index:02d}', (pbx, pby, 0.48), 0.07, 0.96, wood, vertices=8)

peacock_run = rotated_rect(-1.127, 0.319, 0.34, 0.27, 3)
wire_enclosure('Pfauenstall_aviary', peacock_run, steel, height_m=2.75, spacing_splat=0.14, roof_frame=True)
perch_a = w(-1.22, 0.25, 1.35)
perch_b = w(-1.05, 0.38, 1.35)
beam('Pfauenstall_high_perch', perch_a, perch_b, 0.09, wood)

horse_turnout = rotated_rect(-2.52, 0.68, 0.50, 0.28, 12)
fence_line('Pferdestall_turnout', horse_turnout, wood, spacing_splat=0.18, rails=True, height_m=1.45)
prop_block('Pferdestall_water_trough', -2.60, 0.71, (2.8, 1.0, 0.68), 12, steel)

# Flat-roof rooftop vents on the central multi-storey brick block.
for vent_index, (vx, vz) in enumerate(((-1.91, 0.53), (-1.545, 0.500), (-1.72, 0.59))):
    vbx, vby, _ = w(vx, vz)
    cylinder(f'Central_roof_vent_{vent_index}', (vbx, vby, 8.35), 0.34, 1.3, roof_dark, vertices=12)

# The former circular "Lounge" group was an over-interpretation of two hidden,
# empty CMS markers.  The actual KSplat top view shows an open working yard with
# several low machines, carts and pallets instead.  Their centres are projected
# directly from reference 16 (same top-camera calibration as this Blender view).
piazza_detail_coords = [(-1.70, 0.02), (-1.28, 0.02), (-1.20, 0.32), (-1.66, 0.36)]
site_polygon('Central Piazza detail pad', piazza_detail_coords, 0.175, 0.10, yard_mat)
piazza_yard_props = [
    (-1.58, 0.16, (2.4, 1.0, 0.78), 10, equipment_pale),
    (-1.44, 0.18, (2.4, 1.0, 0.68), 58, wood),
    (-1.53, 0.25, (2.2, 0.92, 0.72), 102, steel),
]
for prop_index, (px, pz, dimensions, angle, material) in enumerate(piazza_yard_props):
    prop_block(f'Piazza_yard_detail_{prop_index:02d}', px, pz, dimensions, angle, material)

# The landscape photo set documents a low Q-shaped Corten silhouette on the
# grass beside the central yard.  It is kept clear of the access spine and the
# Pfauenstall footprint so its outline remains independently verifiable.
q_sculpture('Piazza Q sculpture', -0.63, 0.55, 58, corten)

# The public image set explicitly ties the oversized flywheel sculpture to the
# Werkstatt.  It stands beside a low wood stack rather than in the field.
flywheel_sculpture('Werkstatt_flywheel', -2.50, 0.25, 2.65, 58, corten, spokes=6)
for stack_index in range(4):
    prop_block(
        f'Werkstatt_wood_stack_{stack_index:02d}',
        -2.47 + stack_index * 0.018,
        0.05,
        (3.8, 0.54, 0.52 + stack_index * 0.12),
        58,
        wood,
    )
column_sculpture_group('Werkstatt column ensemble', -2.58, 0.38, 30, corten)

# Freestanding rectangular tower at location 07.  The drone close-up resolves
# a weathered brick shaft, a pale rendered ground storey, regular openings and
# a shallow hipped cap beside the blue canopy block.
tower_x, tower_z = -0.649, -0.408
tbx, tby, _ = w(tower_x, tower_z)
tower_rotation = math.radians(-105.4)
cube('Tower masonry body', (tbx, tby, 4.15), (5.30, 5.10, 8.30), brick, rotation=tower_rotation, bevel=0.18)
cube('Tower rendered ground storey', (tbx, tby, 1.18), (5.38, 5.18, 2.36), white, rotation=tower_rotation, bevel=0.12)
cube('Tower upper band', (tbx, tby, 8.05), (5.46, 5.26, 0.84), brick_light, rotation=tower_rotation, bevel=0.14)
hip_roof('Tower shallow hipped cap', tower_x, tower_z, 0.190, 0.184, 105.4, 8.47, 0.64, roof_blue)
for slit_index, (along, center_height) in enumerate(((-2.15, 2.15), (0.0, 4.20), (2.15, 6.15))):
    facade_panel(
        f'Tower slit window {slit_index:02d}',
        tower_x,
        tower_z,
        0.168,
        105.4,
        along,
        1,
        0.72,
        1.10,
        center_height,
        glass_dark,
    )
for slit_index, (along, center_height) in enumerate(((-2.00, 2.15), (0.10, 4.20), (2.10, 6.15))):
    facade_panel(
        f'Tower opposite window {slit_index:02d}',
        tower_x,
        tower_z,
        0.168,
        105.4,
        along,
        -1,
        0.78,
        1.08,
        center_height,
        glass_dark,
    )

# Stork nest and recognisable Corten markers.
sx, sy, _ = w(-1.1147, -0.0425)
cylinder('Stork pole', (sx, sy, 4.65), 0.34, 9.30, corten, vertices=12)
# The source photographs show a broad, tangled Reisig-Krone, not a clean torus.
for nest_ring_index, (radius, height, tilt_x, tilt_y) in enumerate((
    (1.45, 9.30, 0.04, -0.05),
    (1.78, 9.43, -0.06, 0.03),
    (2.05, 9.56, 0.08, 0.07),
    (2.25, 9.70, -0.04, -0.08),
)):
    torus(
        f'Stork nest ring {nest_ring_index:02d}',
        (sx, sy, height),
        radius,
        0.075,
        corten,
        rotation=(tilt_x, tilt_y, nest_ring_index * 0.28),
    )
for branch_index in range(18):
    angle = math.tau * branch_index / 18
    inner_radius = 0.32 + (branch_index % 3) * 0.18
    outer_radius = 1.75 + (branch_index % 5) * 0.19
    a = (
        sx + math.cos(angle + 0.18) * inner_radius,
        sy + math.sin(angle + 0.18) * inner_radius,
        9.30 + (branch_index % 4) * 0.10,
    )
    b = (
        sx + math.cos(angle) * outer_radius,
        sy + math.sin(angle) * outer_radius,
        9.52 + ((branch_index * 3) % 5) * 0.12,
    )
    beam(f'Stork nest branch {branch_index:02d}', a, b, 0.065, corten)
bx, by, _ = w(-0.90, 0.34)
cube('Corten book left', (bx - 1.2, by, 1.45), (2.2, 0.24, 2.8), corten, rotation=math.radians(-24))
cube('Corten book right', (bx + 1.2, by, 1.45), (2.2, 0.24, 2.8), corten, rotation=math.radians(24))
ex, ey, _ = w(2.6308, 1.2558)
torus('Entrance sculpture ring', (ex, ey, 4.2), 3.0, 0.32, corten, rotation=(math.pi / 2, 0, 0))

# Timber deck at the pond-facing Teichhaus edge.  The previous coordinates
# belonged to the disproven round-pen Pumpenhaus placement.
deck_coords = rotated_rect(-3.105, -1.355, 0.185, 0.120, 27.8)
site_polygon('Pond timber deck', deck_coords, 0.28, 0.18, wood)

# Fences use field boundaries, never road centrelines.
fence_loop('West_paddock_fence', west_paddock, wood, spacing_splat=0.28, rails=True)
fence_loop('South_pasture_fence', south_pasture, wood, spacing_splat=0.34, rails=False)
fence_loop('Crop_field_fence', crop_field, wood, spacing_splat=0.36, rails=False)
fence_loop('Round_meadow_fence', round_land, wood, spacing_splat=0.32, rails=False)

# Crop tractor tracks are paired wheel lines with broad headland turns in
# reference view 20.  Single evenly spaced ribbons made the field look like a
# diagram and omitted the most recognisable geometry of this sector.
for track_index in range(4):
    x = 0.10 + track_index * 0.76
    centreline = [
        (x + 0.43, -1.21),
        (x + 0.30, -0.78),
        (x + 0.13, -0.28),
        (x, 0.19),
        (x + 0.03, 0.39),
        (x + 0.15, 0.51),
    ]
    for wheel_index, wheel_offset in enumerate((-0.032, 0.032)):
        road(
            f'Crop_track_{track_index:02d}_wheel_{wheel_index:02d}',
            offset_polyline(centreline, wheel_offset),
            0.13,
            track,
            height=0.18,
        )

# Ground variation that is present as geometry/color mass in the top Splat.
# These are deliberately flat survey patches, not final terrain materials.
site_polygon(
    'South pasture worn entrance',
    [
        (-2.61, 0.82),
        (-2.18, 0.73),
        (-1.76, 0.79),
        (-1.46, 0.98),
        (-1.57, 1.24),
        (-2.04, 1.39),
        (-2.48, 1.23),
    ],
    0.18,
    0.10,
    rough_ground,
)
site_polygon(
    'South pasture pale worn patch',
    ellipse_points(1.25, 2.39, 0.22, 0.14, 30, 18),
    0.18,
    0.10,
    yard_mat,
)

# Faint paired pasture tracks visible below the transverse hedgerow in view 19.
for pasture_track_index, centre_x in enumerate((-0.72, 0.03, 0.78)):
    pasture_centreline = [
        (centre_x - 0.15, 2.74),
        (centre_x - 0.05, 2.28),
        (centre_x + 0.04, 1.82),
        (centre_x + 0.10, 1.39),
    ]
    for wheel_index, wheel_offset in enumerate((-0.026, 0.026)):
        road(
            f'South_pasture_track_{pasture_track_index:02d}_wheel_{wheel_index:02d}',
            offset_polyline(pasture_centreline, wheel_offset),
            0.09,
            field_b,
            height=0.17,
        )

# Thin utility line crossing the crop field in reference view 20.
utility_line = [(0.92, -0.94), (1.70, -0.38), (2.48, 0.16), (3.06, 0.58)]
for pole_index, (px, pz) in enumerate(utility_line):
    utility_pole(f'Crop_utility_pole_{pole_index:02d}', px, pz, 7.4, steel)
curve_polyline('Crop utility wire A', utility_line, 7.15, 0.035, steel)
curve_polyline('Crop utility wire B', offset_polyline(utility_line, 0.035), 7.15, 0.035, steel)

# Tree belts: outer edges and two offset rows along the entry road.  The western
# scan edge and the pond are visibly multi-row woodland bands, not single rows;
# the added inner lines stay outside every road and keep all trunks off the water.
tree_line('West_boundary_trees', [(-5.04, -2.42), (-5.00, -1.25), (-4.90, 0.20), (-4.42, 1.72)], spacing_splat=0.42)
tree_line('West_boundary_inner_trees', [(-4.82, -2.36), (-4.76, -1.28), (-4.62, -0.12), (-4.27, 1.48)], spacing_splat=0.46, start_index=3)
tree_line('Pond_tree_belt', [(-4.38, -2.02), (-4.40, -1.68), (-4.34, -1.34), (-4.22, -1.08)], spacing_splat=0.34, start_index=2)
tree_line('Pond_west_bank_inner', [(-4.28, -1.98), (-4.30, -1.66), (-4.25, -1.36), (-4.15, -1.12)], spacing_splat=0.28, start_index=4)
tree_line('Pond_north_bank', [(-4.02, -2.18), (-3.72, -2.22), (-3.40, -2.15), (-3.14, -2.03)], spacing_splat=0.26, start_index=1)
tree_line('Pond_south_bank', [(-3.62, -1.02), (-3.44, -0.91)], spacing_splat=0.24, start_index=2)
# The east bank directly abuts the halls and Pumpenhaus.  Tall placeholder
# crowns here read as trees growing through roofs in 3D, while the Splat only
# supports low bank scrub at this edge; Pond_shore_scrub supplies that mass.
tree_line('South_boundary_trees', [(-2.80, 3.50), (-1.20, 3.62), (0.70, 3.48), (2.28, 3.17)], spacing_splat=0.48)
tree_line('East_boundary_trees_north', [(3.48, -1.15), (3.55, 0.05), (3.50, 0.66)], spacing_splat=0.44)
tree_line('East_boundary_trees_south', [(3.43, 1.40), (3.12, 1.92), (2.76, 2.42)], spacing_splat=0.44, start_index=3)
# Frame 00351 shows hedgerow/scrub rather than a formal tree avenue.  The few
# mature crowns around the work-yard entrance are handled by nearby yard/tree
# groups, not repeated along the lane.
tree_line('Public_road_trees', public_road[2:-1], spacing_splat=0.50, offset=-0.18, start_index=4)
tree_line('West_loop_trees', west_loop[1:-1], spacing_splat=0.52, offset=0.14)

# Irregular, sparse north-yard grove from the aerial silhouettes.  Explicit
# coordinates avoid the artificial straight-row look and stay behind storage.
for grove_index, (tx, tz, scale) in enumerate((
    (-0.06, -2.69, 0.90),
    (0.42, -2.64, 1.03),
    (0.88, -2.50, 0.84),
    (1.28, -2.38, 1.08),
    (1.72, -2.20, 0.93),
    (2.08, -2.02, 0.86),
)):
    tree(f'North_rough_grove_{grove_index:02d}', tx, tz, scale, leaf_a if grove_index % 2 else leaf_b)

# Survey-visible hedgerows are structural boundaries, not final vegetation.
# They keep the paddocks readable and reproduce the dense belts in views 19/20/27.
hedge_line(
    'Entry_hedge_north',
    entry_road,
    spacing_splat=0.075,
    offset=0.105,
    radius_m=1.02,
    center_height_m=0.68,
)
hedge_line(
    'Entry_hedge_south',
    entry_road,
    spacing_splat=0.075,
    offset=-0.105,
    start_index=2,
    radius_m=1.02,
    center_height_m=0.68,
)
hedge_line(
    'South_cross_hedge',
    [(-1.877, 3.254), (-0.432, 3.399), (0.773, 3.399), (1.977, 3.544), (2.941, 3.640)],
    spacing_splat=0.19,
)
hedge_line('West_paddock_outer_hedge', west_paddock[4:] + [west_paddock[0]], spacing_splat=0.19, offset=-0.05, start_index=1)
hedge_line('Pond_bank_hedge', [(-4.08, -1.96), (-4.10, -1.65), (-4.07, -1.34), (-4.00, -1.08)], spacing_splat=0.18, start_index=3)
hedge_line('Pond_shore_scrub', pond_coords + [pond_coords[0]], spacing_splat=0.13, start_index=5)
hedge_line('Public_road_hedge', public_road[1:-1], spacing_splat=0.19, offset=0.12, start_index=4)

# Field sculptures documented in the Pferde-Wiese image set and visible as
# dark silhouettes in top-west.  Their simple rings are still validation
# geometry; surface treatment remains part of the later realism pass.
horse_arch_x, horse_arch_z = -3.40, 0.62
habx, haby, _ = w(horse_arch_x, horse_arch_z)
upright_ring('Horse paddock Corten arch', (habx, haby, 2.55), 2.35, 0.22, corten, yaw_deg=28)
stacked_ring_sculpture('West paddock stacked circles', -2.86, 0.28, 14, steel)
triangle_sculpture('West paddock pointed triangle', -2.58, 0.72, 18, corten)

# A few animals placed inside paddocks, never on access roads.
horse_marker('Horse_west_1', -3.65, 0.25, 28, 0.85)
horse_marker('Horse_west_2', -3.40, 0.62, -18, 0.78, brick_light)
horse_marker('Horse_round_pen', -2.82, -2.18, 70, 0.68, brick_light)
horse_marker('Horse_south_1', 0.35, 1.95, -25, 0.82)
nandu_marker('Nandu_west_1', -3.92, 0.40, 18, 0.82, steel)
nandu_marker('Nandu_west_2', -3.78, 0.78, -12, 0.76, steel)
nandu_marker('Nandu_west_3', -3.52, 1.04, 32, 0.72, steel)

# Validation markers from the project snapshot. Hidden for clean renders.
marker_collection = bpy.data.collections.new('VALIDATION_MARKERS')
bpy.context.scene.collection.children.link(marker_collection)
location_data = json.loads((ROOT / 'src' / 'data' / 'locations-snapshot.json').read_text())
for index, location in enumerate(location_data):
    if location.get('visible', True) is False:
        continue
    number = location.get('displayNumber') or str(index + 1).zfill(2)
    location_marker(marker_collection, number, location['title'], location['position']['x'], location['position']['z'])

# Cameras.
def point_camera(name, position, target, lens=48, ortho_scale=None):
    camera_data = bpy.data.cameras.new(name)
    camera_obj = bpy.data.objects.new(name, camera_data)
    bpy.context.collection.objects.link(camera_obj)
    camera_obj.location = position
    direction = Vector(target) - Vector(position)
    camera_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    if ortho_scale is not None:
        camera_data.type = 'ORTHO'
        camera_data.ortho_scale = ortho_scale
    else:
        camera_data.lens = lens
    return camera_obj


def splat_perspective_camera(name, position, target, vertical_fov_deg):
    """Map a Three.js survey-viewer camera into the measured Blender scene.

    The Splat viewer uses x/z as the ground plane and y as elevation.  Blender
    uses x/y as the ground plane and z as elevation.  Heights are measured
    relative to each preset's ground-level target so the same 30 m/unit scale
    used by the blockout is preserved without importing the scan's y offset.
    """
    px, py, pz = position
    tx, ty, tz = target
    camera = point_camera(
        name,
        (px * U, -pz * U, (py - ty) * U),
        (tx * U, -tz * U, 0.0),
        lens=50,
    )
    camera.data.sensor_fit = 'VERTICAL'
    camera.data.lens = camera.data.sensor_height / (2.0 * math.tan(math.radians(vertical_fov_deg) / 2.0))
    return camera


render_aspect = 16 / 9
site_center_x = -2.474 * U
site_center_y = -0.575 * U
top_camera = point_camera('Camera_measured_top', (site_center_x, site_center_y, 500), (site_center_x, site_center_y, 0), ortho_scale=13.45 * U / render_aspect)
campus_x, campus_y, _ = w(-1.78, -1.02)
campus_camera = point_camera('Camera_measured_campus', (campus_x, campus_y, 340), (campus_x, campus_y, 0), ortho_scale=4.65 * U / render_aspect)

# Cameras mirror the reference viewer's survey presets one-to-one. This keeps
# every validation crop directly comparable without estimating framing by eye.
detail_top_specs = {
    'site': (-0.45, -0.42, 7.35),
    'west': (-3.72, 0.42, 4.45),
    'core-west': (-2.05, -0.77, 4.15),
    'core-east': (-0.98, 0.18, 3.65),
    'south': (-1.62, -1.62, 4.30),
    'halls': (-2.12, -1.03, 2.85),
    'piazza': (-1.22, 0.05, 2.55),
    'round-pen': (-2.82, -2.08, 2.25),
    'pond': (-4.02, -1.48, 2.65),
    'large-fields': (-0.30, 2.02, 6.75),
    'crop-field': (1.72, 0.15, 4.85),
    'entry': (1.55, 0.62, 4.55),
    'north': (-1.70, 1.55, 4.50),
}
detail_top_cameras = {}
for detail_name, (detail_x, detail_z, detail_width) in detail_top_specs.items():
    dx, dy, _ = w(detail_x, detail_z)
    detail_top_cameras[detail_name] = point_camera(
        f'Camera_measured_{detail_name}',
        (dx, dy, 340),
        (dx, dy, 0),
        ortho_scale=detail_width * U / render_aspect,
    )
overview_camera = point_camera('Camera_measured_overview', w(4.6, 4.7, 165), w(-1.0, 0.35, 0), lens=52)
reverse_camera = point_camera('Camera_measured_reverse', w(-5.8, -4.4, 150), w(-1.1, 0.1, 0), lens=53)

# Exact perspective presets copied from the KSplat reference viewer.  These are
# validation cameras only; they do not alter the landscape or its presentation.
oblique_specs = {
    'oblique-se': ((4.15, 3.05, 4.35), (-1.02, -0.62, 0.13), 39),
    'oblique-sw': ((-5.65, 3.12, -4.25), (-1.20, -0.55, 0.08), 42),
    'oblique-nw': ((-5.75, 3.38, 4.20), (-1.15, -0.58, 0.18), 41),
    'oblique-ne': ((3.65, 3.25, 4.20), (-1.15, -0.58, 0.18), 41),
    'oblique-core-east': ((0.82, 1.18, 1.18), (-1.32, -0.66, 0.02), 48),
    'oblique-core-west': ((-3.48, 1.28, 0.92), (-1.42, -0.67, -0.18), 48),
    'oblique-halls': ((-3.72, 1.42, -2.78), (-2.05, -0.70, -1.08), 49),
    'oblique-north-houses': ((0.62, 1.22, -2.74), (-0.92, -0.68, -1.55), 48),
    'oblique-pond': ((-5.34, 1.18, -2.56), (-3.72, -0.72, -1.58), 49),
    'oblique-entry': ((3.58, 1.04, 2.12), (0.62, -0.72, 0.58), 47),
}
oblique_cameras = {
    name: splat_perspective_camera(f'Camera_measured_{name}', position, target, fov)
    for name, (position, target, fov) in oblique_specs.items()
}

# Clear blockout lighting. Final Bruno-Simon lighting is a post-approval step.
world = bpy.data.worlds.new('Measured blockout world') if not bpy.data.worlds else bpy.data.worlds[0]
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.075, 0.065, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.68
bpy.ops.object.light_add(type='SUN', location=(0, 0, 300))
sun = bpy.context.object
sun.name = 'Top validation sun'
sun.data.energy = 2.8
sun.data.angle = math.radians(12)
sun.rotation_euler = (0, 0, 0)
bpy.ops.object.light_add(type='AREA', location=(40, -60, 250), rotation=(0, 0, 0))
area = bpy.context.object
area.name = 'Broad validation fill'
area.data.energy = 2200
area.data.shape = 'DISK'
area.data.size = 280
area.data.color = (1.0, 0.78, 0.55)

# Render configuration.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.compression = 25
scene.render.film_transparent = False
scene.render.image_settings.color_depth = '8'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.35
scene.render.filepath = str(OUT / 'paasleben-measured-top.png')

master_path = OUT / 'paasleben-measured-blockout.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))

if os.environ.get('PAASLEBEN_GENERATE_ONLY') == '1':
    marker_collection.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(master_path))
    print('PAASLEBEN_MEASURED_BLOCKOUT_GENERATED')
    raise SystemExit(0)

# Fast survey loop for proportion work. The final run still renders every
# camera and refreshes the GLB, while this mode updates only authoritative
# Birdseye crops and the Blender master between measurement iterations.
if os.environ.get('PAASLEBEN_QUICK') == '1':
    marker_collection.hide_render = True
    scene.camera = campus_camera
    scene.render.filepath = str(OUT / 'paasleben-measured-campus.png')
    bpy.ops.render.render(write_still=True)
    for detail_name in (
        'site',
        'halls',
        'core-west',
        'core-east',
        'south',
        'pond',
        'large-fields',
        'crop-field',
        'north',
    ):
        scene.camera = detail_top_cameras[detail_name]
        scene.render.filepath = str(OUT / f'paasleben-measured-{detail_name}.png')
        bpy.ops.render.render(write_still=True)
    scene.camera = top_camera
    bpy.ops.wm.save_as_mainfile(filepath=str(master_path))
    print('PAASLEBEN_MEASURED_BLOCKOUT_QUICK_DONE')
    raise SystemExit(0)

# Render clean top, labelled top, campus detail and two oblique verification views.
marker_collection.hide_render = True
scene.camera = top_camera
scene.render.filepath = str(OUT / 'paasleben-measured-top.png')
bpy.ops.render.render(write_still=True)

marker_collection.hide_render = False
scene.camera = top_camera
scene.render.filepath = str(OUT / 'paasleben-measured-top-labeled.png')
bpy.ops.render.render(write_still=True)

marker_collection.hide_render = True
scene.camera = campus_camera
scene.render.filepath = str(OUT / 'paasleben-measured-campus.png')
bpy.ops.render.render(write_still=True)

for detail_name, detail_camera in detail_top_cameras.items():
    scene.camera = detail_camera
    scene.render.filepath = str(OUT / f'paasleben-measured-{detail_name}.png')
    bpy.ops.render.render(write_still=True)

scene.camera = overview_camera
scene.render.filepath = str(OUT / 'paasleben-measured-overview.png')
bpy.ops.render.render(write_still=True)

scene.camera = reverse_camera
scene.render.filepath = str(OUT / 'paasleben-measured-reverse.png')
bpy.ops.render.render(write_still=True)

for oblique_name, oblique_camera in oblique_cameras.items():
    scene.camera = oblique_camera
    scene.render.filepath = str(OUT / f'paasleben-measured-{oblique_name}.png')
    bpy.ops.render.render(write_still=True)

scene.camera = top_camera
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'paasleben-measured-blockout.glb'),
    export_format='GLB',
    export_apply=True,
    export_cameras=True,
    export_lights=True,
)

print('PAASLEBEN_MEASURED_BLOCKOUT_DONE')
