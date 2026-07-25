import bpy
import math
import random
from mathutils import Vector
from pathlib import Path


ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
random.seed(1973)

S = 7.0


def W(x, z, h=0.0):
    """Map website x/z coordinates to Blender's x/y ground plane."""
    return (x * S, -z * S, h)


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.materials, bpy.data.curves, bpy.data.meshes,
        bpy.data.cameras, bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.82, metallic=0.0, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Alpha'].default_value = alpha
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 0.26
    if alpha < 1.0:
        mat.surface_render_method = 'DITHERED'
    return mat


def apply_mat(obj, mat):
    obj.data.materials.append(mat)
    return obj


def add_bevel(obj, width=0.1, segments=2):
    if width > 0:
        mod = obj.modifiers.new('Soft toy edges', 'BEVEL')
        mod.width = width
        mod.segments = segments
    return obj


def box(name, loc, dims, mat, bevel=0.12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_bevel(obj, bevel)
    return apply_mat(obj, mat)


def cylinder(name, loc, radius, depth, mat, vertices=12, rotation=(0, 0, 0), bevel=0.04, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_bevel(obj, bevel)
    return apply_mat(obj, mat)


def ico(name, loc, scale, mat, subdivisions=1, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return apply_mat(obj, mat)


def torus(name, loc, major, minor, mat, rotation=(0, 0, 0), major_segments=24, minor_segments=6):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        major_segments=major_segments, minor_segments=minor_segments,
        location=loc, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return apply_mat(obj, mat)


def beam_between(name, a, b, width, mat, bevel=0.025):
    a = Vector(a)
    b = Vector(b)
    delta = b - a
    mid = (a + b) * 0.5
    obj = box(name, mid, (width, width, delta.length), mat, bevel=bevel)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    return obj


def curve_tube(name, points, radius, mat, cyclic=False, resolution=2):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    return apply_mat(obj, mat)


def polygon_surface(name, points, z, mat, thickness=0.14, bevel=0.12):
    verts = [(x, y, z) for x, y in points]
    faces = [tuple(range(len(points)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if thickness:
        solid = obj.modifiers.new('Ground thickness', 'SOLIDIFY')
        solid.thickness = thickness
    add_bevel(obj, bevel)
    return apply_mat(obj, mat)


def ribbon(name, points, width, z, mat):
    pts = [Vector((x, y, z)) for x, y in points]
    left = []
    right = []
    for i, p in enumerate(pts):
        before = pts[max(0, i - 1)]
        after = pts[min(len(pts) - 1, i + 1)]
        tangent = after - before
        tangent.z = 0
        tangent.normalize()
        normal = Vector((-tangent.y, tangent.x, 0)) * width * 0.5
        left.append(tuple(p + normal))
        right.append(tuple(p - normal))
    verts = left + list(reversed(right))
    obj = polygon_surface(name, [(v[0], v[1]) for v in verts], z, mat, 0.1, width * 0.12)
    return obj


def local_xy(cx, cy, dx, dy, rotation):
    c = math.cos(rotation)
    s = math.sin(rotation)
    return (cx + dx * c - dy * s, cy + dx * s + dy * c)


def gable_roof(name, loc, length, width, rise, mat, rotation=0.0, eave=0.25):
    length += eave * 2
    width += eave * 2
    verts = [
        (-length / 2, -width / 2, 0), (length / 2, -width / 2, 0),
        (-length / 2, 0, rise), (length / 2, 0, rise),
        (-length / 2, width / 2, 0), (length / 2, width / 2, 0),
    ]
    faces = [(0, 1, 3, 2), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler.z = rotation
    solid = obj.modifiers.new('Roof thickness', 'SOLIDIFY')
    solid.thickness = 0.16
    add_bevel(obj, 0.07)
    return apply_mat(obj, mat)


def flat_roof(name, loc, dims, mat, rotation=0.0):
    return box(name, loc, dims, mat, bevel=0.12, rotation=(0, 0, rotation))


def building(name, x, y, length, width, height, wall_mat, roof, roof_mat, rotation=0.0,
             window_mat=None, door_mat=None, roof_rise=1.2, windows=3, side='front'):
    box(f'{name}_body', (x, y, height / 2 + 0.24), (length, width, height), wall_mat, 0.16,
        rotation=(0, 0, rotation))
    if roof == 'gable':
        gable_roof(f'{name}_roof', (x, y, height + 0.22), length, width, roof_rise, roof_mat, rotation)
    elif roof == 'flat':
        flat_roof(f'{name}_roof', (x, y, height + 0.32), (length + 0.35, width + 0.35, 0.32), roof_mat, rotation)
    elif roof == 'shed':
        flat_roof(f'{name}_roof', (x, y, height + 0.36), (length + 0.42, width + 0.42, 0.28), roof_mat, rotation)
    front_sign = -1 if side == 'front' else 1
    if window_mat:
        for i in range(windows):
            dx = -length * 0.34 + (i + 0.5) * (length * 0.68 / max(1, windows))
            fx, fy = local_xy(x, y, dx, front_sign * (width / 2 + 0.055), rotation)
            box(f'{name}_window_{i}', (fx, fy, height * 0.58),
                (max(0.48, length * 0.48 / max(1, windows)), 0.08, max(0.72, height * 0.34)),
                window_mat, 0.045, rotation=(0, 0, rotation))
    if door_mat:
        fx, fy = local_xy(x, y, length * 0.35, front_sign * (width / 2 + 0.07), rotation)
        box(f'{name}_door', (fx, fy, height * 0.38), (1.05, 0.10, height * 0.7), door_mat, 0.06,
            rotation=(0, 0, rotation))


def tree(name, x, y, height, trunk_mat, leaf_mats, broad=True):
    cylinder(f'{name}_trunk', (x, y, height * 0.3), max(0.13, height * 0.055), height * 0.6,
             trunk_mat, vertices=8, bevel=0.03)
    if broad:
        sizes = [(0, 0, 0.75, 0.28), (0.32, -0.12, 0.82, 0.22), (-0.28, 0.10, 0.83, 0.20)]
        for i, (ox, oy, hz, sz) in enumerate(sizes):
            ico(f'{name}_crown_{i}', (x + ox * height, y + oy * height, hz * height),
                (sz * height * 1.08, sz * height, sz * height * 0.92), leaf_mats[i % len(leaf_mats)], 1)
    else:
        for i, zf in enumerate((0.54, 0.70, 0.85)):
            bpy.ops.mesh.primitive_cone_add(
                vertices=9, radius1=height * (0.25 - i * 0.035), radius2=0,
                depth=height * 0.42, location=(x, y, height * zf),
            )
            apply_mat(bpy.context.object, leaf_mats[i % len(leaf_mats)])


def hedge(name, a, b, height, mat):
    a = Vector((*a, height / 2 + 0.18))
    b = Vector((*b, height / 2 + 0.18))
    d = b - a
    mid = (a + b) * 0.5
    obj = box(name, mid, (d.length, 0.58, height), mat, 0.24)
    obj.rotation_euler.z = math.atan2(d.y, d.x)
    return obj


def fence_polyline(name, points, post_mat, rail_mat, spacing=2.7, height=1.05):
    idx = 0
    for a2, b2 in zip(points[:-1], points[1:]):
        a = Vector((a2[0], a2[1], 0.28))
        b = Vector((b2[0], b2[1], 0.28))
        d = b - a
        count = max(1, math.ceil(d.length / spacing))
        last = None
        for i in range(count + 1):
            p = a.lerp(b, i / count)
            cylinder(f'{name}_post_{idx}', (p.x, p.y, height * 0.5 + 0.2), 0.075, height, post_mat,
                     vertices=8, bevel=0.018)
            if last is not None:
                for rail_h in (0.48, 0.9):
                    beam_between(f'{name}_rail_{idx}_{rail_h}',
                                 (last.x, last.y, rail_h), (p.x, p.y, rail_h), 0.075, rail_mat, 0.02)
            last = p
            idx += 1


def oval_pad(name, loc, radius, scale, mat, z=0.25, vertices=48):
    return cylinder(name, (loc[0], loc[1], z), radius, 0.18, mat, vertices=vertices,
                    bevel=0.12, scale=(scale[0], scale[1], 1))


def oval_fence(name, center, rx, ry, post_mat, rail_mat, posts=24):
    pts = []
    for i in range(posts + 1):
        a = i / posts * math.tau
        pts.append((center[0] + math.cos(a) * rx, center[1] + math.sin(a) * ry))
    fence_polyline(name, pts, post_mat, rail_mat, spacing=99)


def horse(name, x, y, scale, body_mat, facing=0.0):
    z = 0.38 + scale * 0.72
    body = ico(f'{name}_body', (x, y, z), (1.0 * scale, 0.43 * scale, 0.55 * scale), body_mat, 2)
    body.rotation_euler.z = facing
    c, s = math.cos(facing), math.sin(facing)
    neck_base = Vector((x + c * 0.72 * scale, y + s * 0.72 * scale, z + 0.13 * scale))
    neck_top = Vector((x + c * 1.0 * scale, y + s * 1.0 * scale, z + 0.82 * scale))
    beam_between(f'{name}_neck', neck_base, neck_top, 0.38 * scale, body_mat, 0.04)
    ico(f'{name}_head', (neck_top.x + c * 0.2 * scale, neck_top.y + s * 0.2 * scale, neck_top.z),
        (0.42 * scale, 0.24 * scale, 0.25 * scale), body_mat, 1, rotation=(0, 0, facing))
    for i, (dx, dy) in enumerate(((-0.55, -0.25), (-0.55, 0.25), (0.55, -0.25), (0.55, 0.25))):
        lx = x + (dx * c - dy * s) * scale
        ly = y + (dx * s + dy * c) * scale
        beam_between(f'{name}_leg_{i}', (lx, ly, z - 0.25 * scale),
                     (lx + (0.05 if i % 2 else -0.05) * scale, ly, 0.28), 0.115 * scale, body_mat, 0.02)
    tail_start = Vector((x - c * 0.9 * scale, y - s * 0.9 * scale, z + 0.12 * scale))
    tail_end = Vector((x - c * 1.18 * scale, y - s * 1.18 * scale, z - 0.4 * scale))
    beam_between(f'{name}_tail', tail_start, tail_end, 0.09 * scale, body_mat, 0.02)


def nandu(name, x, y, scale, mat):
    ico(f'{name}_body', (x, y, 0.9 * scale), (0.58 * scale, 0.38 * scale, 0.48 * scale), mat, 1)
    beam_between(f'{name}_neck', (x + 0.28 * scale, y, 1.03 * scale),
                 (x + 0.48 * scale, y, 1.8 * scale), 0.13 * scale, mat, 0.02)
    ico(f'{name}_head', (x + 0.52 * scale, y, 1.84 * scale),
        (0.18 * scale, 0.13 * scale, 0.14 * scale), mat, 1)
    for i, oy in enumerate((-0.16, 0.16)):
        beam_between(f'{name}_leg_{i}', (x - 0.05 * scale, y + oy * scale, 0.68 * scale),
                     (x + (0.08 if i else -0.08) * scale, y + oy * scale, 0.22), 0.07 * scale, mat, 0.01)


def sculpture_wheel(name, x, y, scale, rust_mat, steel_mat):
    torus(f'{name}_rim', (x, y, 1.55 * scale), 1.15 * scale, 0.14 * scale, rust_mat,
          rotation=(math.radians(90), 0, 0), major_segments=32)
    cylinder(f'{name}_hub', (x, y, 1.55 * scale), 0.25 * scale, 0.35 * scale, rust_mat,
             vertices=12, rotation=(math.radians(90), 0, 0))
    for i in range(6):
        a = i / 6 * math.tau
        beam_between(f'{name}_spoke_{i}', (x, y, 1.55 * scale),
                     (x + math.cos(a) * 1.0 * scale, y, 1.55 * scale + math.sin(a) * 1.0 * scale),
                     0.10 * scale, steel_mat, 0.025)


def sculpture_eye(name, x, y, scale, rust_mat):
    pts_top = []
    pts_bottom = []
    for i in range(13):
        t = i / 12 * math.pi
        px = x + math.cos(t) * 1.25 * scale
        pts_top.append((px, y, 0.45 + math.sin(t) * 0.72 * scale))
        pts_bottom.append((px, y, 0.45 - math.sin(t) * 0.45 * scale))
    curve_tube(f'{name}_top', pts_top, 0.105 * scale, rust_mat)
    curve_tube(f'{name}_bottom', list(reversed(pts_bottom)), 0.105 * scale, rust_mat)


def sculpture_book(name, x, y, scale, rust_mat):
    for i in range(8):
        z = 0.36 + i * 0.10 * scale
        rot = math.radians((-4 + i) * 1.6)
        box(f'{name}_page_{i}', (x, y, z), (2.6 * scale, 1.45 * scale, 0.075 * scale), rust_mat,
            0.04, rotation=(0, 0, rot))
    box(f'{name}_cover', (x, y, 1.22 * scale), (2.85 * scale, 1.62 * scale, 0.10 * scale), rust_mat,
        0.05, rotation=(math.radians(-7), 0, math.radians(6)))


def text_object(body, name, loc, size, mat, extrude=0.035, align='CENTER', rotation=(0, 0, 0)):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.align_x = align
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.01
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rotation
    return apply_mat(obj, mat)


reset_scene()

# Palette: the place's real materials, simplified into Bruno-Simon-like color blocks.
grass = material('Meadow green', (0.28, 0.43, 0.105))
grass_light = material('Sun meadow', (0.47, 0.61, 0.17))
grass_dark = material('Deep pasture', (0.18, 0.31, 0.07))
yard = material('Warm courtyard', (0.67, 0.62, 0.50))
sand = material('Arena sand', (0.77, 0.62, 0.36))
road = material('Pale gravel', (0.64, 0.61, 0.52))
cream = material('Warm white plaster', (0.87, 0.84, 0.70))
brick = material('Paasleben red brick', (0.49, 0.16, 0.075), roughness=0.88)
brick_light = material('Sunlit brick', (0.68, 0.25, 0.10), roughness=0.86)
ink = material('Soft black steel', (0.038, 0.05, 0.047), roughness=0.66)
roof_dark = material('Charcoal roofs', (0.06, 0.082, 0.075), roughness=0.58)
roof_blue = material('Blue steel roofs', (0.12, 0.31, 0.38), roughness=0.6, metallic=0.12)
wood = material('Stable wood', (0.34, 0.16, 0.055), roughness=0.82)
wood_light = material('Sun timber', (0.58, 0.30, 0.09), roughness=0.78)
rust = material('Corten sculptures', (0.57, 0.19, 0.045), roughness=0.64, metallic=0.2)
glass = material('Cool windows', (0.22, 0.53, 0.61), roughness=0.22, metallic=0.08)
water = material('Teich water', (0.08, 0.31, 0.34), roughness=0.2, metallic=0.08)
lime = material('Paasleben lime', (0.58, 0.76, 0.07), roughness=0.82)
white = material('Text and cushions', (0.94, 0.91, 0.75), roughness=0.94)
leaf_a = material('Leaf olive', (0.24, 0.38, 0.055), roughness=0.92)
leaf_b = material('Leaf sun', (0.50, 0.62, 0.10), roughness=0.92)
leaf_c = material('Leaf blue green', (0.13, 0.34, 0.18), roughness=0.92)
shadow = material('Graphic contact shadow', (0.055, 0.075, 0.05), roughness=1.0)
horse_brown = material('Horse chestnut', (0.34, 0.10, 0.035), roughness=0.9)
horse_black = material('Horse black', (0.028, 0.035, 0.03), roughness=0.88)
horse_tan = material('Horse tan', (0.55, 0.29, 0.08), roughness=0.9)
horse_cream = material('Horse cream', (0.72, 0.58, 0.30), roughness=0.9)

# Floating landscape base and large sub-fields follow the splat footprint.
box('PAASLEBEN_COMPLETE_ISLAND', (-5.0, 0.0, -0.48), (66.0, 45.0, 0.96), grass, 0.72)
polygon_surface('WEST_HORSE_PASTURE', [(-32, -13), (-17, -15), (-12, -5), (-18, 2), (-32, 3)], 0.08, grass_light, 0.16, 0.32)
polygon_surface('NORTH_PASTURE', [(-31, 4), (-18, 3), (-12, 11), (-17, 20), (-31, 20)], 0.09, grass_dark, 0.16, 0.32)
polygon_surface('EAST_FIELD', [(-2, -17), (24, -15), (28, -4), (16, 2), (1, -4)], 0.08, grass_light, 0.16, 0.32)
polygon_surface('SOUTH_GARDENS', [(-11, -13), (1, -14), (11, -7), (4, 1), (-8, 2)], 0.10, grass, 0.16, 0.28)

# Road network: the long southeast approach, core loop and western paths.
ribbon('MAIN_APPROACH', [(26, -12), (20, -9.2), (13, -6.8), (6, -4.1), (-1, -1.8), (-7.5, 0.4)], 2.0, 0.22, road)
ribbon('CORE_YARD_ROAD', [(-20, 10), (-15, 7), (-10, 4.5), (-7.5, 0.4), (-11, -4.5), (-16, -7)], 1.55, 0.23, road)
ribbon('POND_PATH', [(-20, 10), (-24, 9), (-28, 6), (-30, 2)], 1.15, 0.21, road)
ribbon('ROUND_PEN_PATH', [(-20, 10), (-21, 13), (-19.5, 16.2)], 1.05, 0.21, road)
ribbon('PIAZZA_SPUR', [(-7.5, 0.4), (-8.4, -2.2), (-12, -4.8)], 1.45, 0.24, yard)

# Pond and pump-house shore.
polygon_surface('TEICH', [(-31.2, 5.7), (-29.8, 2.0), (-27.0, 0.4), (-23.9, 1.4), (-22.6, 4.4), (-24.5, 7.4), (-28.2, 8.0)],
                0.17, water, 0.14, 0.42)
for i in range(19):
    a = i / 18 * math.pi * 1.25 + math.radians(105)
    x = -27.1 + math.cos(a) * 4.25
    y = 4.2 + math.sin(a) * 3.45
    beam_between(f'Reed_{i}', (x, y, 0.22),
                 (x + random.uniform(-0.12, 0.12), y, random.uniform(0.85, 1.35)),
                 0.035, wood_light, 0.008)

# Sand arena and round pen.
box('SANDPLATZ', (-10.3, 6.7, 0.28), (10.2, 7.1, 0.26), sand, 0.42, rotation=(0, 0, math.radians(-8)))
oval_pad('ROUND_PEN_SAND', (-19.5, 15.2), 4.8, (1.42, 0.80), sand, 0.24)
oval_fence('RoundPen', (-19.5, 15.2), 6.8, 3.82, wood, wood_light, 26)

# Main historic halls and accommodation group.
building('Hallen_A', -16.1, 9.1, 11.8, 4.6, 4.0, brick, 'gable', roof_blue, math.radians(-10), glass, ink, 1.35, 5)
building('Hallen_B', -14.8, 4.7, 10.2, 4.0, 3.7, cream, 'gable', roof_dark, math.radians(-10), glass, wood, 1.2, 4)
building('Frauenhaus', -8.9, 11.0, 6.2, 4.2, 5.0, cream, 'flat', roof_dark, math.radians(-4), glass, wood, 4)
building('Trafohaus', -5.8, 7.6, 4.5, 4.1, 5.3, brick, 'flat', roof_dark, math.radians(-3), glass, ink, 2)
building('Unterkunft', -7.1, 14.9, 5.8, 3.8, 4.2, cream, 'gable', roof_dark, math.radians(-4), glass, wood, 1.15, 3)
building('Pumpenhaus', -21.0, 8.4, 5.6, 3.8, 3.4, cream, 'gable', roof_dark, math.radians(18), glass, wood, 1.1, 2)

# Tower/chimney: visually dominant historic marker.
box('Tower_base', (-4.1, 3.0, 2.85), (3.3, 3.3, 5.7), brick, 0.16)
box('Tower_top', (-4.1, 3.0, 6.5), (2.55, 2.55, 1.7), brick_light, 0.12)
cylinder('Tower_chimney', (-4.1, 3.0, 10.15), 0.48, 5.6, ink, vertices=16, bevel=0.05)
cylinder('Tower_cap', (-4.1, 3.0, 13.0), 0.72, 0.14, ink, vertices=16, bevel=0.04)

# Animal/studio cluster east of the central yard.
building('Pferdestall', -13.2, -5.1, 12.0, 4.2, 3.35, brick, 'gable', roof_dark, math.radians(4), glass, wood, 1.05, 6)
building('Atelier', -10.3, -6.4, 5.0, 3.7, 3.8, cream, 'shed', roof_blue, math.radians(6), glass, ink, 3)
building('Werkstatt', -12.5, -1.25, 6.8, 3.8, 3.5, brick, 'gable', roof_dark, math.radians(2), glass, wood, 1.0, 3)
building('Huehnerstall', -10.2, 0.15, 4.2, 2.9, 2.35, wood_light, 'gable', roof_dark, math.radians(-4), None, cream, 0.85, 0)
building('Pfauenstall', -7.9, -2.5, 4.5, 3.2, 2.7, cream, 'flat', roof_dark, math.radians(3), glass, rust, 2)

# Courtyards and lounge blocks.
box('PIAZZA', (-7.7, -2.0, 0.25), (8.8, 6.0, 0.20), yard, 0.42, rotation=(0, 0, math.radians(3)))
box('LOUNGE_SOFA_BASE', (-8.0, -3.0, 0.62), (3.4, 1.3, 0.62), wood, 0.22, rotation=(0, 0, math.radians(8)))
box('LOUNGE_SOFA_WHITE', (-8.0, -3.0, 0.96), (3.18, 1.12, 0.36), white, 0.19, rotation=(0, 0, math.radians(8)))
for i, (x, y) in enumerate(((-10.0, -3.7), (-9.0, -4.1), (-7.9, -4.25))):
    box(f'Lounge_lime_cube_{i}', (x, y, 0.62), (0.76, 0.76, 0.82), lime, 0.18,
        rotation=(0, 0, math.radians(i * 8 - 6)))

# Stable front wood bays make the Pferdestall recognizable.
for i in range(6):
    bx = -17.2 + i * 1.65
    box(f'Pferdestall_wood_bay_{i}', (bx, -7.28, 1.18), (1.45, 0.12, 1.55), wood, 0.05,
        rotation=(0, 0, math.radians(4)))
    for j in range(5):
        box(f'Pferdestall_bar_{i}_{j}', (bx - 0.48 + j * 0.24, -7.35, 2.18),
            (0.035, 0.045, 0.75), ink, 0.01, rotation=(0, 0, math.radians(4)))

# Sculpture landmarks.
sculpture_eye('Piazza_eye', -12.0, -1.0, 1.25, rust)
sculpture_wheel('Great_wheel', -1.2, 3.9, 1.55, rust, ink)
sculpture_book('Peacock_book', -5.9, -2.0, 0.86, rust)

# Stork nest on a deliberately tall column.
cylinder('Stork_column', (-7.2, 0.15, 2.85), 0.24, 5.7, rust, vertices=10, bevel=0.04)
torus('Stork_nest_ring', (-7.2, 0.15, 5.75), 1.02, 0.12, rust, rotation=(0, 0, 0), major_segments=24)
ico('Stork_nest_twigs', (-7.2, 0.15, 5.82), (0.94, 0.86, 0.20), shadow, 2)

# Abstract orange horse/person silhouette in front of the long brick hall.
ico('Horse_sculpture_body', (-11.0, 2.55, 1.55), (0.70, 0.28, 0.92), rust, 2)
cylinder('Horse_sculpture_head', (-10.95, 2.55, 2.72), 0.35, 0.54, rust, vertices=10, bevel=0.05)
for i, ox in enumerate((-0.42, 0.42)):
    beam_between(f'Horse_sculpture_leg_{i}', (-11.0 + ox, 2.55, 1.0),
                 (-11.0 + ox * 1.1, 2.55, 0.28), 0.13, rust, 0.025)

# Column sculpture row beside the halls.
for i in range(7):
    x = -19.0 + i * 0.72
    h = 1.5 + (i % 3) * 0.45
    box(f'Sculpture_column_{i}', (x, 2.0, h / 2 + 0.28), (0.22, 0.22, h), rust, 0.04,
        rotation=(0, 0, math.radians(i * 7)))

# Trees: perimeter, entrance allée, pond, and central gardens.
tree_specs = []
for i in range(12):
    tree_specs.append((-29.5 + i * 2.25, -14.2 + math.sin(i * 0.8) * 0.4, random.uniform(2.6, 3.8), i % 3))
for i in range(10):
    tree_specs.append((-31.0, -10.0 + i * 3.1, random.uniform(2.8, 4.2), (i + 1) % 3))
for i in range(8):
    tree_specs.append((8.0 + i * 2.2, -6.3 - i * 0.52, random.uniform(2.5, 3.5), i % 3))
for i in range(7):
    tree_specs.append((8.8 + i * 2.3, -2.7 - i * 0.55, random.uniform(2.5, 3.5), (i + 1) % 3))
tree_specs += [
    (-28, 7.8, 4.0, 2), (-25, 8.3, 3.4, 0), (-22.5, 12.0, 3.8, 1),
    (-3.0, -1.8, 3.2, 0), (-1.5, -4.2, 3.6, 1), (1.2, -3.0, 4.1, 2),
    (-5.8, -7.4, 3.0, 0), (-3.2, -8.0, 3.5, 1), (-0.2, -8.4, 3.4, 2),
    (-18.5, -8.2, 3.0, 0), (-22.0, -5.0, 3.8, 2), (-25.0, -2.0, 3.4, 1),
]
for i, (x, y, h, tone) in enumerate(tree_specs):
    tree(f'Tree_{i:02d}', x, y, h, wood, (leaf_a, leaf_b, leaf_c), broad=tone != 2)

# Hedges and compact garden rooms.
hedge('Hedge_piazza_north', (-2.0, -0.2), (-2.0, -7.6), 1.1, leaf_a)
hedge('Hedge_piazza_east', (-2.0, -7.6), (2.4, -8.1), 1.1, leaf_c)
hedge('Hedge_pump', (-23.0, 10.7), (-18.0, 12.1), 0.95, leaf_a)
hedge('Hedge_stable', (-18.8, -8.4), (-7.6, -9.1), 0.85, leaf_b)

# Field boundary fences reconstructed from the splat's strong dark lines.
fence_polyline('WestBoundary', [(-31, -13), (-31, 4), (-28, 8), (-22, 9), (-17, 5), (-14, -2), (-17, -13)], wood, wood_light, 3.2)
fence_polyline('NorthBoundary', [(-31, 19), (-18, 20), (-9, 17), (0, 11), (8, 8)], wood, wood_light, 3.2)
fence_polyline('EastBoundary', [(7, 8), (15, 3), (27, -3), (27, -14)], wood, wood_light, 3.2)
fence_polyline('PastureDivider', [(-29, -4), (-22, -3), (-16, -2), (-13, 2)], wood, wood_light, 3.0)
fence_polyline('HorseStablePaddock', [(-19, -8), (-18, -13), (-8, -13), (-7, -8)], wood, wood_light, 2.7)

# Animals give scale and make the whole landscape read as Paasleben.
horse('Horse_meadow_1', -26.5, -7.5, 0.78, horse_black, math.radians(18))
horse('Horse_meadow_2', -23.0, -9.2, 0.76, horse_brown, math.radians(-12))
horse('Horse_meadow_3', -20.0, -6.2, 0.70, horse_tan, math.radians(155))
horse('Horse_pond_1', -25.5, 0.2, 0.64, horse_cream, math.radians(12))
horse('Horse_paddock', -13.5, -10.8, 0.68, horse_brown, math.radians(172))
nandu('Nandu_1', -18.0, -4.0, 0.72, horse_black)
nandu('Nandu_2', -16.7, -3.4, 0.65, horse_tan)

# Simple chickens and peacocks close to their stalls.
for i in range(5):
    x = -10.9 + i * 0.48
    y = -1.5 + (i % 2) * 0.36
    ico(f'Chicken_{i}', (x, y, 0.42), (0.22, 0.16, 0.20), horse_brown if i % 2 else ink, 1)
    ico(f'Chicken_head_{i}', (x + 0.18, y, 0.56), (0.10, 0.09, 0.10), brick_light, 1)
for i in range(3):
    x = -6.6 + i * 0.65
    y = -3.5 - (i % 2) * 0.35
    ico(f'Peacock_body_{i}', (x, y, 0.55), (0.30, 0.20, 0.28), leaf_c, 2)
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=0.45, radius2=0.04, depth=0.65,
                                   location=(x - 0.34, y, 0.58), rotation=(0, math.radians(78), 0))
    apply_mat(bpy.context.object, glass)

# Graphic shadows beneath the largest movable/organic silhouettes.
for i, (x, y, sx, sy, rot) in enumerate([
    (-8, -3.2, 2.2, 0.72, -0.12), (-26, -8, 1.8, 0.62, 0.2),
    (-23, -9, 1.6, 0.58, -0.1), (-4.1, 3.0, 1.9, 1.1, 0.1),
    (-7.2, 0.2, 1.3, 0.72, -0.25),
]):
    oval_pad(f'Graphic_shadow_{i}', (x, y), 1.0, (sx, sy), shadow, z=0.18, vertices=32)

# Bruno-like world labels integrated into the ground.
text_object('PAASLEBEN', 'World_title', (13.0, -12.0, 0.34), 1.75, white, 0.06, 'CENTER', (0, 0, math.radians(14)))
text_object('PFERDE', 'Pasture_label', (-24.0, -12.0, 0.30), 0.72, cream, 0.035, 'CENTER', (0, 0, math.radians(-4)))
text_object('HALLEN', 'Halls_label', (-16.5, 1.2, 0.30), 0.56, white, 0.03, 'CENTER', (0, 0, math.radians(80)))
text_object('TEICH', 'Pond_label', (-28.0, 8.6, 0.30), 0.52, white, 0.03, 'CENTER', (0, 0, math.radians(-8)))

# Lighting and world: warm sun, cool fill, dark-green backdrop like the accepted prototype.
bpy.ops.object.light_add(type='AREA', location=(-25, -32, 48))
key = bpy.context.object
key.name = 'Warm broad sun'
key.data.energy = 2050
key.data.shape = 'DISK'
key.data.size = 18.0
key.data.color = (1.0, 0.66, 0.37)
key.rotation_euler = (Vector((-6, 0, 0.5)) - key.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.light_add(type='AREA', location=(30, 24, 38))
fill = bpy.context.object
fill.name = 'Cool sky fill'
fill.data.energy = 1400
fill.data.size = 22.0
fill.data.color = (0.48, 0.66, 1.0)
fill.rotation_euler = (Vector((-6, 1, 1.5)) - fill.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.light_add(
    type='SUN',
    rotation=(math.radians(28), math.radians(-24), math.radians(-38)),
)
sun = bpy.context.object
sun.name = 'Bruno soft sun'
sun.data.energy = 3.2
sun.data.angle = math.radians(18)
sun.data.color = (1.0, 0.72, 0.48)

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.028, 0.048, 0.043, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.62


def camera(name, location, target, lens=55, dof_target=None, fstop=8.0):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    cam.name = name
    cam.data.lens = lens
    cam.data.sensor_width = 36
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    if dof_target:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_object = dof_target
        cam.data.dof.aperture_fstop = fstop
    return cam


overview_cam = camera('Camera_overview', (62, -78, 62), (-5, 1, 1.2), 56, bpy.data.objects['Tower_base'], 9.0)
reverse_cam = camera('Camera_reverse', (-64, -58, 49), (-7, 2, 1.0), 58, bpy.data.objects['Hallen_A_body'], 10.0)
core_cam = camera('Camera_core', (30, -43, 28), (-8.5, 1.5, 2.0), 60, bpy.data.objects['Tower_base'], 7.0)
top_cam = camera('Camera_top', (-5, 0, 82), (-5, 0, 0), 58)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1600
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 28
scene.render.film_transparent = False
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.7

# Save the editable master before rendering.
master_path = OUT / 'paasleben-full-landscape.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))

render_jobs = [
    (overview_cam, 'paasleben-full-overview.png'),
    (reverse_cam, 'paasleben-full-reverse.png'),
    (core_cam, 'paasleben-full-core.png'),
    (top_cam, 'paasleben-full-top.png'),
]
for cam, filename in render_jobs:
    scene.camera = cam
    scene.render.filepath = str(OUT / filename)
    bpy.ops.render.render(write_still=True)

scene.camera = overview_cam
bpy.ops.wm.save_as_mainfile(filepath=str(master_path))

bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'paasleben-full-landscape.glb'),
    export_format='GLB',
    export_apply=True,
    export_cameras=True,
    export_lights=True,
)

print('PAASLEBEN_FULL_LANDSCAPE_DONE')
