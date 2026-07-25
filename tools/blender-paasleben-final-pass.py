"""Turn the measured Paasleben blockout into the final lit presentation scene.

Run this script after opening ``artifacts/paasleben-measured-blockout.blend``.
It keeps every measured footprint and validation camera, then adds procedural
materials, render-efficient grass/reeds, organic crown breakup, final lighting
and presentation cameras.  The generated scene remains fully editable.
"""

from __future__ import annotations

import bisect
import math
import os
import random
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


ROOT = Path("/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester")
OUT = ROOT / "artifacts"
RENDER_OUT = OUT / "final-renders"
RENDER_OUT.mkdir(parents=True, exist_ok=True)
SEED = 240722


def remove_previous_final_pass():
    collection = bpy.data.collections.get("FINAL_REALISM")
    if collection is not None:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)
    for obj in list(bpy.data.objects):
        if obj.name.startswith("FINAL_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for light in list(bpy.data.objects):
        if light.type == "LIGHT":
            bpy.data.objects.remove(light, do_unlink=True)


def final_collection():
    collection = bpy.data.collections.new("FINAL_REALISM")
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for previous in tuple(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def material(name):
    used = bpy.data.materials.get(name)
    if used is None:
        used = bpy.data.materials.new(name)
    used.use_nodes = True
    return used


def reset_principled(mat, base_color, roughness=0.72, metallic=0.0):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (250, 0)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    mat.diffuse_color = (*base_color, 1.0)
    return nodes, links, bsdf


def noise_surface(
    mat_name,
    dark,
    light,
    scale,
    detail,
    roughness,
    bump_strength=0.16,
    bump_distance=0.12,
    metallic=0.0,
):
    mat = material(mat_name)
    nodes, links, bsdf = reset_principled(mat, dark, roughness, metallic)
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-720, 0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-510, 30)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = 0.66
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-250, 60)
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    bump = nodes.new("ShaderNodeBump")
    bump.location = (15, -115)
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    links.new(texcoord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def foliage_lift(mat, color, strength=0.42):
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return mat
    emission = bsdf.inputs.get("Emission Color")
    emission_strength = bsdf.inputs.get("Emission Strength")
    if emission is not None:
        emission.default_value = (*color, 1.0)
    if emission_strength is not None:
        emission_strength.default_value = strength
    mat.use_backface_culling = False
    return mat


def water_surface(mat_name):
    mat = material(mat_name)
    nodes, links, bsdf = reset_principled(mat, (0.025, 0.17, 0.18), 0.10, 0.04)
    bsdf.inputs["IOR"].default_value = 1.333
    transmission = bsdf.inputs.get("Transmission Weight")
    if transmission is not None:
        transmission.default_value = 0.18
    coat = bsdf.inputs.get("Coat Weight")
    if coat is not None:
        coat.default_value = 0.32
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-690, 0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-460, 10)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 1.7
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-230, 65)
    ramp.color_ramp.elements[0].color = (0.008, 0.075, 0.080, 1.0)
    ramp.color_ramp.elements[1].color = (0.075, 0.32, 0.31, 1.0)
    bump = nodes.new("ShaderNodeBump")
    bump.location = (0, -120)
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.055
    links.new(texcoord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def glass_surface(mat_name):
    mat = material(mat_name)
    _, _, bsdf = reset_principled(mat, (0.035, 0.12, 0.14), 0.12, 0.14)
    transmission = bsdf.inputs.get("Transmission Weight")
    if transmission is not None:
        transmission.default_value = 0.42
    coat = bsdf.inputs.get("Coat Weight")
    if coat is not None:
        coat.default_value = 0.50
    emission = bsdf.inputs.get("Emission Color")
    emission_strength = bsdf.inputs.get("Emission Strength")
    if emission is not None:
        emission.default_value = (0.018, 0.070, 0.085, 1.0)
    if emission_strength is not None:
        emission_strength.default_value = 0.10
    bsdf.inputs["IOR"].default_value = 1.45
    return mat


def roof_surface(mat_name, dark, light, roughness, metallic=0.12):
    """Layer subtle sheet-metal seams and weathering without changing massing."""
    mat = material(mat_name)
    nodes, links, bsdf = reset_principled(mat, dark, roughness, metallic)
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-850, 20)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-650, 120)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 3.2
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-650, -120)
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 18.0
    wave.inputs["Distortion"].default_value = 1.0
    wave.inputs["Detail"].default_value = 3.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-400, 120)
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    multiply = nodes.new("ShaderNodeMath")
    multiply.operation = "MULTIPLY"
    multiply.location = (-390, -90)
    multiply.inputs[1].default_value = 0.34
    bump = nodes.new("ShaderNodeBump")
    bump.location = (-80, -105)
    bump.inputs["Strength"].default_value = 0.20
    bump.inputs["Distance"].default_value = 0.055
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    links.new(texcoord.outputs["Generated"], wave.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(wave.outputs["Fac"], multiply.inputs[0])
    links.new(multiply.outputs[0], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    coat = bsdf.inputs.get("Coat Weight")
    if coat is not None:
        coat.default_value = 0.16
    return mat


def tune_materials():
    # Terrain hierarchy follows the muted spring colours visible in the Splat.
    noise_surface("Survey grass base", (0.032, 0.075, 0.020), (0.125, 0.205, 0.052), 0.23, 5.5, 0.93, 0.13, 0.14)
    noise_surface("Pasture light", (0.052, 0.100, 0.027), (0.205, 0.285, 0.070), 0.31, 5.0, 0.94, 0.13, 0.12)
    noise_surface("Pasture middle", (0.035, 0.082, 0.022), (0.145, 0.235, 0.055), 0.35, 5.0, 0.94, 0.13, 0.12)
    noise_surface("Pasture muted", (0.052, 0.090, 0.028), (0.185, 0.245, 0.070), 0.32, 4.5, 0.95, 0.12, 0.11)
    noise_surface("Crop field", (0.020, 0.080, 0.016), (0.090, 0.225, 0.040), 0.52, 5.0, 0.93, 0.13, 0.10)
    noise_surface("Rough farm ground", (0.105, 0.075, 0.048), (0.30, 0.245, 0.155), 0.48, 6.0, 0.96, 0.20, 0.13)
    noise_surface("Roads", (0.255, 0.235, 0.195), (0.58, 0.53, 0.43), 3.4, 7.0, 0.97, 0.22, 0.055)
    noise_surface("Public asphalt", (0.040, 0.050, 0.047), (0.145, 0.16, 0.145), 4.8, 6.0, 0.92, 0.22, 0.040)
    noise_surface("Courtyards", (0.235, 0.215, 0.175), (0.53, 0.48, 0.39), 2.6, 6.5, 0.97, 0.23, 0.060)
    noise_surface("Sand", (0.38, 0.275, 0.145), (0.78, 0.62, 0.36), 5.8, 7.0, 0.98, 0.20, 0.045)
    noise_surface("Crop tracks", (0.31, 0.27, 0.14), (0.61, 0.54, 0.29), 4.2, 5.0, 0.95, 0.16, 0.040)
    water_surface("Pond")

    # Architecture and fixtures.
    noise_surface("Brick", (0.23, 0.050, 0.022), (0.58, 0.18, 0.062), 5.2, 5.0, 0.90, 0.22, 0.040)
    noise_surface("Brick light", (0.34, 0.075, 0.028), (0.73, 0.27, 0.085), 5.0, 4.5, 0.88, 0.20, 0.038)
    noise_surface("White walls", (0.56, 0.57, 0.53), (0.93, 0.92, 0.83), 2.2, 4.0, 0.90, 0.085, 0.022)
    noise_surface("Cream walls", (0.50, 0.41, 0.27), (0.88, 0.77, 0.54), 2.1, 4.0, 0.89, 0.09, 0.023)
    roof_surface("Blue grey roofs", (0.055, 0.14, 0.16), (0.20, 0.34, 0.37), 0.46, 0.24)
    roof_surface("Dark roofs", (0.025, 0.034, 0.032), (0.13, 0.15, 0.14), 0.52, 0.18)
    roof_surface("Red roofs", (0.27, 0.045, 0.018), (0.62, 0.17, 0.060), 0.60, 0.08)
    noise_surface("Fence wood", (0.16, 0.055, 0.012), (0.48, 0.20, 0.045), 2.3, 5.0, 0.84, 0.18, 0.03)
    noise_surface("Tree trunks", (0.075, 0.030, 0.012), (0.28, 0.12, 0.040), 1.8, 6.0, 0.92, 0.24, 0.05)
    foliage_lift(noise_surface("Tree crowns A", (0.028, 0.090, 0.014), (0.17, 0.30, 0.052), 1.1, 6.0, 0.94, 0.18, 0.10), (0.035, 0.11, 0.016), 0.08)
    foliage_lift(noise_surface("Tree crowns B", (0.052, 0.125, 0.022), (0.25, 0.39, 0.080), 1.1, 6.0, 0.94, 0.18, 0.10), (0.055, 0.13, 0.022), 0.08)
    noise_surface("Hedgerow A", (0.018, 0.070, 0.007), (0.115, 0.24, 0.025), 1.3, 6.0, 0.96, 0.22, 0.10)
    noise_surface("Hedgerow B", (0.030, 0.095, 0.010), (0.18, 0.31, 0.038), 1.3, 6.0, 0.96, 0.22, 0.10)
    noise_surface("Corten sculpture", (0.22, 0.035, 0.008), (0.77, 0.20, 0.025), 2.3, 6.0, 0.58, 0.22, 0.035, 0.40)
    noise_surface("Survey steel", (0.045, 0.055, 0.052), (0.22, 0.27, 0.25), 2.2, 5.0, 0.48, 0.16, 0.025, 0.55)
    glass_surface("Survey window glass")
    noise_surface("Survey doors", (0.055, 0.035, 0.018), (0.25, 0.16, 0.07), 2.2, 4.0, 0.75, 0.16, 0.03)
    noise_surface("Equipment yellow", (0.30, 0.18, 0.035), (0.69, 0.45, 0.10), 3.0, 4.0, 0.52, 0.14, 0.025, 0.18)
    noise_surface("Equipment red", (0.27, 0.045, 0.025), (0.61, 0.13, 0.065), 3.2, 4.0, 0.55, 0.15, 0.025, 0.20)
    noise_surface("Equipment blue", (0.045, 0.13, 0.17), (0.14, 0.31, 0.38), 3.0, 4.0, 0.50, 0.14, 0.025, 0.28)
    noise_surface("Equipment pale", (0.28, 0.29, 0.26), (0.66, 0.66, 0.58), 3.2, 4.0, 0.62, 0.13, 0.025, 0.14)
    noise_surface("Animal markers", (0.070, 0.025, 0.012), (0.25, 0.10, 0.040), 2.4, 4.0, 0.82, 0.12, 0.025)


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def top_face_points(obj):
    if obj is None or obj.type != "MESH":
        return None
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    if not points:
        return None
    max_z = max(point.z for point in points)
    candidates = []
    for polygon in obj.data.polygons:
        polygon_points = [points[index] for index in polygon.vertices]
        if len(polygon_points) < 3:
            continue
        if min(point.z for point in polygon_points) < max_z - 0.025:
            continue
        area = 0.0
        anchor = polygon_points[0]
        for index in range(1, len(polygon_points) - 1):
            area += ((polygon_points[index] - anchor).cross(polygon_points[index + 1] - anchor)).length / 2
        candidates.append((area, polygon_points))
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])[1]


def triangulated_sampler(points):
    # The measured ground surfaces are simple convex top polygons.  A fan keeps
    # the sampler independent of Blender's tessellate return format, which has
    # differed between supported Blender builds.
    clean_points = [Vector((point.x, point.y, point.z)) for point in points]
    triangles = [
        (clean_points[0], clean_points[index], clean_points[index + 1])
        for index in range(1, len(clean_points) - 1)
    ]
    weighted = []
    cumulative = []
    total = 0.0
    for triangle in triangles:
        a, b, c = triangle
        area = ((b - a).cross(c - a)).length / 2
        if area <= 1e-8:
            continue
        weighted.append((a, b, c))
        total += area
        cumulative.append(total)
    if not weighted:
        return None, 0.0

    def sample(rng):
        chosen = weighted[bisect.bisect_left(cumulative, rng.random() * total)]
        a, b, c = chosen
        root = math.sqrt(rng.random())
        secondary = rng.random()
        return a * (1.0 - root) + b * (root * (1.0 - secondary)) + c * (root * secondary)

    return sample, total


def append_crossed_blade(verts, faces, point, height, width, yaw, lean_x=0.0, lean_y=0.0):
    for crossing in (0.0, math.pi / 2):
        angle = yaw + crossing
        axis = Vector((math.cos(angle), math.sin(angle), 0.0))
        base_left = point - axis * width / 2
        base_right = point + axis * width / 2
        tip_center = point + Vector((lean_x, lean_y, height))
        top_width = width * 0.14
        top_left = tip_center - axis * top_width / 2
        top_right = tip_center + axis * top_width / 2
        start = len(verts)
        verts.extend((tuple(base_left), tuple(base_right), tuple(top_right), tuple(top_left)))
        faces.append((start, start + 1, start + 2, start + 3))


def grass_obstacle_bounds(excluded_names, margin=0.12):
    """Conservative XY masks for surfaces where generated grass is illogical."""
    blocking_materials = {
        "Roads",
        "Public asphalt",
        "Courtyards",
        "Sand",
        "Pond",
        "Rough farm ground",
        "Crop tracks",
    }
    bounds = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.name in excluded_names or obj.name.startswith("FINAL_"):
            continue
        material_names = {slot.material.name for slot in obj.material_slots if slot.material is not None}
        is_structure = obj.name.endswith("_body") or obj.name.startswith("Tower masonry body")
        if not is_structure and not material_names.intersection(blocking_materials):
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        bounds.append((
            min(corner.x for corner in corners) - margin,
            max(corner.x for corner in corners) + margin,
            min(corner.y for corner in corners) - margin,
            max(corner.y for corner in corners) + margin,
        ))
    return bounds


def point_in_obstacle(point, bounds):
    return any(x0 <= point.x <= x1 and y0 <= point.y <= y1 for x0, x1, y0, y1 in bounds)


def scatter_blades(collection, name, surface_names, density, height_range, width_range, mat, seed, cap=30000):
    rng = random.Random(seed)
    excluded_names = set(surface_names)
    obstacle_bounds = grass_obstacle_bounds(excluded_names)
    samplers = []
    total_area = 0.0
    for surface_name in surface_names:
        obj = bpy.data.objects.get(surface_name)
        points = top_face_points(obj)
        if not points:
            continue
        sampler, area = triangulated_sampler(points)
        if sampler is None:
            continue
        samplers.append((sampler, area))
        total_area += area
    if not samplers:
        return None
    count = min(cap, max(1, int(total_area * density)))
    cumulative = []
    running = 0.0
    for _, area in samplers:
        running += area
        cumulative.append(running)
    verts = []
    faces = []
    accepted = 0
    attempts = 0
    while accepted < count and attempts < count * 8:
        attempts += 1
        sampler_index = bisect.bisect_left(cumulative, rng.random() * running)
        point = samplers[sampler_index][0](rng)
        if point_in_obstacle(point, obstacle_bounds):
            continue
        point.z += 0.035
        height = rng.uniform(*height_range)
        width = rng.uniform(*width_range)
        lean = height * rng.uniform(0.02, 0.12)
        lean_angle = rng.random() * math.tau
        append_crossed_blade(
            verts,
            faces,
            point,
            height,
            width,
            rng.random() * math.tau,
            math.cos(lean_angle) * lean,
            math.sin(lean_angle) * lean,
        )
        accepted += 1
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, mat)
    return obj


def reed_belt(collection, pond_name, mat):
    pond = bpy.data.objects.get(pond_name)
    points = top_face_points(pond)
    if not points:
        return None
    rng = random.Random(SEED + 91)
    center = sum(points, Vector()) / len(points)
    verts = []
    faces = []
    for a, b in zip(points, points[1:] + points[:1]):
        length = (b - a).length
        count = max(2, int(length * 1.15))
        for index in range(count):
            t = (index + rng.random()) / count
            shore = a.lerp(b, t)
            outward = Vector((shore.x - center.x, shore.y - center.y, 0.0)).normalized()
            point = shore + outward * rng.uniform(0.12, 0.70)
            point.z += 0.045
            height = rng.uniform(0.55, 1.45)
            append_crossed_blade(
                verts,
                faces,
                point,
                height,
                rng.uniform(0.035, 0.065),
                rng.random() * math.tau,
                outward.x * rng.uniform(0.0, 0.10),
                outward.y * rng.uniform(0.0, 0.10),
            )
    mesh = bpy.data.meshes.new("FINAL_REEDS_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("FINAL_REEDS", mesh)
    collection.objects.link(obj)
    assign_material(obj, mat)
    return obj


def organic_vegetation():
    texture = bpy.data.textures.get("FINAL crown breakup") or bpy.data.textures.new("FINAL crown breakup", type="CLOUDS")
    texture.noise_scale = 0.48
    texture.noise_depth = 2
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if "_crown_" in obj.name:
            # Break the repeated spherical silhouette while keeping every
            # surveyed trunk location untouched.
            variation = random.Random(f"{SEED}:{obj.name}")
            obj.rotation_euler.z += variation.uniform(-0.34, 0.34)
            obj.scale.x *= variation.uniform(0.88, 1.12)
            obj.scale.y *= variation.uniform(0.86, 1.14)
            obj.scale.z *= variation.uniform(0.92, 1.10)
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
            if obj.modifiers.get("FINAL crown subdivision") is None:
                subdivision = obj.modifiers.new("FINAL crown subdivision", "SUBSURF")
                subdivision.levels = 1
                subdivision.render_levels = 1
                subdivision.subdivision_type = "CATMULL_CLARK"
            if obj.modifiers.get("FINAL crown breakup") is None:
                displacement = obj.modifiers.new("FINAL crown breakup", "DISPLACE")
                displacement.texture = texture
                displacement.strength = 0.36
                displacement.mid_level = 0.50
                displacement.texture_coords = "GLOBAL"
        elif obj.name.endswith("_trunk"):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        elif obj.name.startswith(("Hedgerow", "Pond_shore_scrub", "Central_planted_island_hedge")):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True


def cube(collection, name, location, dimensions, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, mat)
    if bevel:
        modifier = obj.modifiers.new("FINAL softened edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    move_to_collection(obj, collection)
    return obj


def add_backdrop(collection):
    backdrop = noise_surface("FINAL dark green backdrop", (0.006, 0.014, 0.013), (0.018, 0.038, 0.033), 0.10, 3.0, 0.98, 0.08, 0.08)
    return cube(collection, "FINAL_BACKDROP", (-18.0, 2.0, -2.52), (390.0, 315.0, 0.84), backdrop, 2.2)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_lighting(collection):
    target = (-28.0, 12.0, 1.0)

    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(38), math.radians(-24), math.radians(-43)))
    sun = bpy.context.object
    sun.name = "FINAL late afternoon sun"
    sun.data.energy = 2.15
    sun.data.angle = math.radians(13.0)
    sun.data.color = (1.0, 0.93, 0.82)
    sun.data.use_shadow = True
    move_to_collection(sun, collection)

    bpy.ops.object.light_add(type="AREA", location=(-165.0, -185.0, 235.0))
    key = bpy.context.object
    key.name = "FINAL neutral broad key"
    key.data.energy = 1300
    key.data.shape = "DISK"
    key.data.size = 76.0
    key.data.color = (1.0, 0.90, 0.80)
    look_at(key, target)
    move_to_collection(key, collection)

    bpy.ops.object.light_add(type="AREA", location=(155.0, 130.0, 185.0))
    fill = bpy.context.object
    fill.name = "FINAL cool sky fill"
    fill.data.energy = 1450
    fill.data.shape = "DISK"
    fill.data.size = 105.0
    fill.data.color = (0.66, 0.78, 1.0)
    look_at(fill, target)
    move_to_collection(fill, collection)

    bpy.ops.object.light_add(type="AREA", location=(-155.0, 120.0, 105.0))
    rim = bpy.context.object
    rim.name = "FINAL soft rim"
    rim.data.energy = 620
    rim.data.shape = "DISK"
    rim.data.size = 68.0
    rim.data.color = (0.72, 0.84, 1.0)
    look_at(rim, (-45.0, 10.0, 2.0))
    move_to_collection(rim, collection)


def clone_camera(source_name, final_name, collection, focus, fstop):
    source = bpy.data.objects.get(source_name)
    if source is None or source.type != "CAMERA":
        raise RuntimeError(f"Missing calibrated camera: {source_name}")
    data = source.data.copy()
    camera = source.copy()
    camera.data = data
    camera.name = final_name
    collection.objects.link(camera)
    if data.type == "PERSP":
        data.dof.use_dof = True
        data.dof.focus_object = focus
        data.dof.aperture_fstop = fstop
    return camera


def presentation_camera(final_name, collection, location, target, lens, focus, fstop):
    data = bpy.data.cameras.new(f"{final_name}_DATA")
    data.lens = lens
    data.sensor_width = 36.0
    data.dof.use_dof = True
    data.dof.focus_object = focus
    data.dof.aperture_fstop = fstop
    camera = bpy.data.objects.new(final_name, data)
    camera.location = location
    look_at(camera, target)
    collection.objects.link(camera)
    return camera


def configure_world_and_render(collection):
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("FINAL Paasleben world")
        bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    output.location = (560, 0)
    camera_background = nodes.new("ShaderNodeBackground")
    camera_background.location = (100, -120)
    camera_background.inputs["Color"].default_value = (0.016, 0.047, 0.043, 1.0)
    camera_background.inputs["Strength"].default_value = 0.72
    sky = nodes.new("ShaderNodeTexSky")
    sky.location = (-420, 120)
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(29.0)
    sky.sun_rotation = math.radians(132.0)
    sky.altitude = 0.15
    sky.air_density = 1.05
    sky.dust_density = 0.38
    sky.ozone_density = 0.32
    daylight = nodes.new("ShaderNodeBackground")
    daylight.location = (100, 120)
    daylight.inputs["Strength"].default_value = 0.16
    light_path = nodes.new("ShaderNodeLightPath")
    light_path.location = (100, -330)
    mix = nodes.new("ShaderNodeMixShader")
    mix.location = (355, 0)
    links.new(sky.outputs["Color"], daylight.inputs["Color"])
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs[0])
    links.new(daylight.outputs["Background"], mix.inputs[1])
    links.new(camera_background.outputs["Background"], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 28
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.16
    scene.render.use_file_extension = True

    marker_collection = bpy.data.collections.get("VALIDATION_MARKERS")
    if marker_collection is not None:
        marker_collection.hide_render = True
        marker_collection.hide_viewport = True

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(-34.0, 16.0, 1.8))
    focus = bpy.context.object
    focus.name = "FINAL_FOCUS"
    focus.hide_render = True
    move_to_collection(focus, collection)

    cameras = {
        "hero": clone_camera("Camera_measured_overview", "FINAL_CAMERA_HERO", collection, focus, 16.0),
        "reverse": clone_camera("Camera_measured_reverse", "FINAL_CAMERA_REVERSE", collection, focus, 16.0),
        "core": clone_camera("Camera_measured_oblique-core-east", "FINAL_CAMERA_CORE", collection, focus, 9.0),
        "halls": clone_camera("Camera_measured_oblique-halls", "FINAL_CAMERA_HALLS", collection, focus, 10.0),
        "pond": clone_camera("Camera_measured_oblique-pond", "FINAL_CAMERA_POND", collection, focus, 10.0),
        "birdseye": clone_camera("Camera_measured_site", "FINAL_CAMERA_BIRDSEYE", collection, focus, 18.0),
        "ground": presentation_camera(
            "FINAL_CAMERA_GROUND_CORE",
            collection,
            (4.0, -40.0, 13.0),
            (-43.0, 4.5, 2.8),
            55.0,
            focus,
            13.0,
        ),
        "workyard": presentation_camera(
            "FINAL_CAMERA_WORKYARD",
            collection,
            (-88.0, -66.0, 27.0),
            (-40.0, 5.0, 2.5),
            50.0,
            focus,
            12.0,
        ),
    }
    return cameras


def build_final_scene():
    remove_previous_final_pass()
    collection = final_collection()
    tune_materials()

    grass_mat = foliage_lift(
        noise_surface("FINAL meadow blades", (0.022, 0.072, 0.012), (0.14, 0.25, 0.045), 1.3, 4.0, 0.92, 0.06, 0.018),
        (0.040, 0.12, 0.018),
        0.16,
    )
    crop_mat = foliage_lift(
        noise_surface("FINAL crop blades", (0.020, 0.095, 0.008), (0.15, 0.31, 0.035), 1.6, 4.0, 0.89, 0.08, 0.02),
        (0.050, 0.16, 0.020),
        0.18,
    )
    dry_tuft_mat = foliage_lift(
        noise_surface("FINAL dry meadow tufts", (0.11, 0.095, 0.025), (0.30, 0.25, 0.070), 1.7, 4.0, 0.94, 0.05, 0.015),
        (0.060, 0.050, 0.012),
        0.08,
    )
    reed_mat = foliage_lift(
        noise_surface("FINAL reeds", (0.085, 0.090, 0.018), (0.31, 0.26, 0.055), 2.0, 4.0, 0.92, 0.09, 0.02),
        (0.10, 0.09, 0.02),
        0.10,
    )

    scatter_blades(
        collection,
        "FINAL_MEADOW_GRASS",
        (
            "West horse paddock",
            "Large south east pasture",
            "North rough paddock",
            "Round pen meadow",
        ),
        0.88,
        (0.09, 0.22),
        (0.040, 0.078),
        grass_mat,
        SEED,
        cap=50000,
    )
    scatter_blades(
        collection,
        "FINAL_CORE_GRASS",
        ("Core open grass", "North houses grass court"),
        2.60,
        (0.08, 0.19),
        (0.042, 0.082),
        grass_mat,
        SEED + 17,
        cap=26000,
    )
    scatter_blades(
        collection,
        "FINAL_CROP_GROWTH",
        ("Crop field",),
        0.95,
        (0.15, 0.34),
        (0.035, 0.066),
        crop_mat,
        SEED + 37,
        cap=40000,
    )
    scatter_blades(
        collection,
        "FINAL_DRY_TUFTS",
        (
            "West horse paddock",
            "Large south east pasture",
            "North rough paddock",
            "Round pen meadow",
            "Core open grass",
            "North houses grass court",
        ),
        0.16,
        (0.10, 0.22),
        (0.025, 0.052),
        dry_tuft_mat,
        SEED + 63,
        cap=15000,
    )
    reed_belt(collection, "Pond water", reed_mat)
    organic_vegetation()
    add_backdrop(collection)
    add_lighting(collection)
    cameras = configure_world_and_render(collection)
    return cameras


cameras = build_final_scene()
scene = bpy.context.scene
quick = os.environ.get("PAASLEBEN_FINAL_QUICK") == "1"
if quick:
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    jobs = (
        ("hero", "paasleben-final-hero-quick.png"),
        ("core", "paasleben-final-core-quick.png"),
        ("halls", "paasleben-final-halls-quick.png"),
        ("ground", "paasleben-final-ground-quick.png"),
        ("workyard", "paasleben-final-workyard-quick.png"),
    )
else:
    jobs = (
        ("hero", "paasleben-final-hero.png"),
        ("reverse", "paasleben-final-reverse.png"),
        ("core", "paasleben-final-core.png"),
        ("halls", "paasleben-final-halls.png"),
        ("pond", "paasleben-final-pond.png"),
        ("birdseye", "paasleben-final-birdseye.png"),
        ("ground", "paasleben-final-ground.png"),
        ("workyard", "paasleben-final-workyard.png"),
    )

scene.camera = cameras["hero"]
master_path = OUT / "paasleben-final.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))

for camera_name, filename in jobs:
    scene.camera = cameras[camera_name]
    scene.render.filepath = str(RENDER_OUT / filename)
    bpy.ops.render.render(write_still=True)
    print(f"PAASLEBEN_FINAL_RENDER {camera_name} {scene.render.filepath}")

scene.camera = cameras["hero"]
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))
print(f"PAASLEBEN_FINAL_DONE {master_path}")
