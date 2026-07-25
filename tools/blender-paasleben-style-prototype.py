import bpy
import math
from mathutils import Vector
from pathlib import Path


ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.82, metallic=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 0.3
    return mat


def apply_mat(obj, mat):
    obj.data.materials.append(mat)
    return obj


def box(name, loc, scale, mat, bevel=0.12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft toy edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    apply_mat(obj, mat)
    return obj


def cylinder(name, loc, radius, depth, mat, vertices=12, rotation=(0, 0, 0), bevel=0.04):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if bevel:
        mod = obj.modifiers.new('Soft rim', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    apply_mat(obj, mat)
    return obj


def ico(name, loc, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_mat(obj, mat)
    return obj


def curve_tube(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
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
    apply_mat(obj, mat)
    return obj


def gable_roof(name, x, y, z, length, width, rise, mat):
    # Ridge runs along X. Slightly oversized eaves create the toy-like silhouette.
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
    obj.location = (x, y, z)
    solid = obj.modifiers.new('Roof thickness', 'SOLIDIFY')
    solid.thickness = 0.16
    bevel = obj.modifiers.new('Rounded roof edge', 'BEVEL')
    bevel.width = 0.07
    bevel.segments = 2
    apply_mat(obj, mat)
    return obj


def tree(name, x, y, height, trunk_mat, crown_mats):
    cylinder(f'{name}_trunk', (x, y, height * 0.31), 0.23, height * 0.62, trunk_mat, vertices=8)
    ico(f'{name}_crown_a', (x, y, height * 0.75), (1.0, 0.92, 0.9), crown_mats[0], 1)
    ico(f'{name}_crown_b', (x + 0.45, y - 0.12, height * 0.82), (0.78, 0.72, 0.72), crown_mats[1], 1)
    ico(f'{name}_crown_c', (x - 0.38, y + 0.1, height * 0.84), (0.72, 0.68, 0.66), crown_mats[0], 1)


def text_object(body, name, loc, size, mat, extrude=0.04, align='CENTER', rotation=(math.radians(68), 0, 0)):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.align_x = align
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.012
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rotation
    apply_mat(obj, mat)
    return obj


reset_scene()

# Palette: Paasleben greens, black steel, warm wood, rust art, Bruno-like cream accents.
grass = material('Meadow green', (0.34, 0.48, 0.16))
grass_light = material('Sunlit grass', (0.49, 0.62, 0.22))
yard = material('Warm courtyard', (0.72, 0.68, 0.56))
cream = material('Warm white walls', (0.88, 0.85, 0.72))
ink = material('Soft black steel', (0.045, 0.055, 0.052), roughness=0.67)
roof_mat = material('Charcoal roof', (0.07, 0.09, 0.085), roughness=0.58)
wood = material('Stable wood', (0.40, 0.20, 0.075), roughness=0.75)
wood_light = material('Sunlit timber', (0.62, 0.35, 0.12), roughness=0.74)
rust = material('Corten sculpture', (0.52, 0.16, 0.045), roughness=0.63, metallic=0.22)
glass = material('Skylight blue', (0.29, 0.62, 0.72), roughness=0.3, metallic=0.05)
lime = material('Paasleben lime', (0.56, 0.78, 0.09), roughness=0.78)
white = material('Cushion white', (0.92, 0.9, 0.78), roughness=0.96)
leaf_a = material('Leaf olive', (0.29, 0.42, 0.08), roughness=0.9)
leaf_b = material('Leaf sun', (0.52, 0.64, 0.13), roughness=0.9)
shadow_mat = material('Graphic shadow', (0.08, 0.105, 0.075), roughness=1.0)

# Rounded floating island and courtyard.
box('PAASLEBEN_ISLAND', (0, 0, -0.38), (20.0, 14.0, 0.76), grass, bevel=0.55)
box('COURTYARD', (1.2, -0.25, 0.06), (12.6, 7.8, 0.18), yard, bevel=0.45)

# Irregular stepping stones guide movement like Bruno Simon's tile paths.
for i in range(9):
    x = -8.1 + i * 1.05
    y = 3.8 - i * 0.43 + math.sin(i * 1.7) * 0.18
    box(f'Path_tile_{i:02d}', (x, y, 0.16), (0.78, 0.62, 0.14), cream, bevel=0.14,
        rotation=(0, 0, math.radians((-5 + (i % 3) * 6))))

# Stable hall: creamy walls, black structure, wood bays, skylight strip.
box('Stable_body', (-2.2, 1.95, 1.45), (8.4, 3.1, 2.75), cream, bevel=0.18)
gable_roof('Stable_roof', -2.2, 1.95, 2.82, 8.9, 3.65, 1.18, roof_mat)
box('Skylight', (-2.2, 1.91, 3.62), (7.4, 0.52, 0.14), glass, bevel=0.08,
    rotation=(math.radians(5), 0, 0))

# Black posts and four exterior stall bays.
for x in (-5.65, -3.9, -2.15, -0.4, 1.05):
    box(f'Steel_post_{x}', (x, 0.36, 1.38), (0.12, 0.13, 2.5), ink, bevel=0.025)
for i, x in enumerate((-4.78, -3.03, -1.28, 0.35)):
    box(f'Wood_bay_{i}', (x, 0.28, 0.9), (1.52, 0.13, 1.36), wood, bevel=0.05)
    box(f'Rail_top_{i}', (x, 0.2, 1.72), (1.55, 0.1, 0.10), ink, bevel=0.025)
    for j in range(7):
        bx = x - 0.62 + j * 0.205
        box(f'Bar_{i}_{j}', (bx, 0.19, 2.06), (0.035, 0.045, 0.65), ink, bevel=0.012)

# Open end / signature door frame.
box('Door_dark', (1.53, 0.25, 1.2), (1.05, 0.12, 2.15), ink, bevel=0.06)
box('Door_glow', (1.53, 0.17, 1.21), (0.71, 0.06, 1.82), wood_light, bevel=0.04)

# Paasleben courtyard lounge simplified into playful primitives.
box('Low_sofa_base', (4.3, -1.72, 0.55), (3.0, 1.25, 0.62), wood, bevel=0.22)
box('Sofa_white', (4.3, -1.72, 0.88), (2.82, 1.10, 0.34), white, bevel=0.20)
for i, x in enumerate((3.55, 4.3, 5.05)):
    box(f'Cushion_{i}', (x, -1.52, 1.12), (0.62, 0.34, 0.48), white, bevel=0.16,
        rotation=(math.radians(-12), 0, math.radians((i - 1) * 5)))
for i, x in enumerate((2.4, 3.38, 4.36)):
    box(f'Lime_seat_{i}', (x, -3.05, 0.55), (0.7, 0.7, 0.78), lime, bevel=0.16,
        rotation=(0, 0, math.radians(8 * i - 7)))

# Corten spiral/nest sculpture from the photographed courtyard.
cylinder('Sculpture_base', (0.25, -1.42, 0.7), 0.48, 1.4, rust, vertices=10, bevel=0.08)
spiral = []
for i in range(22):
    t = i / 21
    angle = t * math.pi * 2.1
    radius = 1.0 - 0.48 * t
    spiral.append((0.25 + math.cos(angle) * radius, -1.42 + math.sin(angle) * radius * 0.43, 1.28 + t * 3.1))
curve_tube('Corten_spiral', spiral, 0.11, rust)
curve_tube('Nest_ring', [
    (0.25 + math.cos(a) * 0.75, -1.42 + math.sin(a) * 0.42, 4.48 + math.sin(a * 2) * 0.06)
    for a in [i * math.pi / 8 for i in range(16)]
], 0.085, rust, cyclic=True)
ico('Nest', (0.25, -1.42, 4.54), (0.62, 0.38, 0.16), shadow_mat, 2)

# Low-poly landscape framing.
tree('Tree_left', -7.4, -3.8, 4.0, wood, (leaf_a, leaf_b))
tree('Tree_back', 4.7, 4.5, 3.5, wood, (leaf_b, leaf_a))
tree('Tree_right', 8.0, 2.6, 4.25, wood, (leaf_a, leaf_b))
for i, (x, y, s) in enumerate([(-6.3, 4.9, 0.85), (6.1, 4.7, 1.15), (7.6, -4.0, 0.9), (-7.6, -0.5, 1.05)]):
    ico(f'Shrub_{i}', (x, y, 0.55 * s), (0.82 * s, 0.7 * s, 0.64 * s), leaf_a if i % 2 == 0 else leaf_b, 1)

# Graphic world-space label, integrated as scenery.
text_object('PAASLEBEN', 'Paasleben_title', (-5.8, -4.42, 0.18), 0.72, cream, extrude=0.055,
            align='LEFT', rotation=(0, 0, 0))
text_object('STALL  /  HOF', 'Paasleben_subtitle', (-5.75, -4.40, 0.82), 0.22, ink, extrude=0.022,
            align='LEFT', rotation=(0, 0, 0))

# Lighting: warm sun + broad cool fill. Strong readable shadows mimic baked lighting.
bpy.ops.object.light_add(type='AREA', location=(-6.5, -7.0, 11.5))
key = bpy.context.object
key.name = 'Warm soft sun'
key.data.energy = 1450
key.data.shape = 'DISK'
key.data.size = 7.0
key.data.color = (1.0, 0.68, 0.40)
key.rotation_euler = (math.radians(24), 0, math.radians(-32))

bpy.ops.object.light_add(type='AREA', location=(6.0, 4.0, 8.0))
fill = bpy.context.object
fill.name = 'Sky fill'
fill.data.energy = 800
fill.data.size = 9.0
fill.data.color = (0.50, 0.68, 1.0)
fill.rotation_euler = (math.radians(12), 0, math.radians(145))

# Camera: elevated, slightly wide, fixed diagonal like the portfolio.
bpy.ops.object.camera_add(location=(17.2, -19.5, 16.2))
camera = bpy.context.object
camera.name = 'Bruno-style follow camera'
camera.data.lens = 52
camera.data.sensor_width = 36
target = Vector((0.2, 0.0, 1.0))
direction = target - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera

# World and render settings.
world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.055, 0.052, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.42

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1200
scene.render.resolution_y = 780
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.render.filepath = str(OUT / 'paasleben-bruno-style-prototype.png')
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 25
scene.render.resolution_percentage = 100
scene.render.use_file_extension = True

# Filmic/AgX contrast gives the soft highlight rolloff visible in Bruno's work.
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.25

# Slight depth of field; enough to make the scene miniature-like but keep it readable.
camera.data.dof.use_dof = True
camera.data.dof.focus_object = bpy.data.objects['Corten_spiral']
camera.data.dof.aperture_fstop = 7.0

# Grounded contact shadow ellipses are deliberate graphic elements.
for i, (x, y, sx, sy, rot) in enumerate([
    (4.45, -2.0, 2.2, 0.72, -0.12),
    (-7.1, -3.5, 1.45, 0.72, -0.36),
    (7.6, 2.9, 1.55, 0.76, -0.30),
]):
    bpy.ops.mesh.primitive_circle_add(vertices=32, radius=1, fill_type='NGON', location=(x, y, 0.17))
    sh = bpy.context.object
    sh.name = f'Graphic_contact_shadow_{i}'
    sh.scale = (sx, sy, 1)
    sh.rotation_euler.z = rot
    apply_mat(sh, shadow_mat)

# Save source, render, and export the static prototype for web inspection.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'paasleben-bruno-style-prototype.blend'))
bpy.ops.render.render(write_still=True)

# Export only visible scene objects; lights/camera remain useful for GLB previews.
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'paasleben-bruno-style-prototype.glb'),
    export_format='GLB',
    export_apply=True,
    export_cameras=True,
    export_lights=True,
)

print('PAASLEBEN_STYLE_PROTOTYPE_DONE')
