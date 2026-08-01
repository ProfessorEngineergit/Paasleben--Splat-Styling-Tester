"""Build the lightweight animated Paasleben stork as a GLB.

The bird is deliberately assembled from separate feather/body meshes instead
of using a skinned character.  The two wing roots are real 3D pivots with a
looping transform animation, which keeps the asset cheap enough to clone a few
times over the Gaussian-splat scene.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools/build-stork-flight.py
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "public" / "models"
PREVIEW_DIR = ROOT / "artifacts" / "stork"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.materials,
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def smooth(obj):
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def apply_material(obj, mat):
    obj.data.materials.append(mat)
    return obj


def ellipsoid(name, location, scale, mat, parent=None, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1,
        location=(0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    obj.location = location
    apply_material(smooth(obj), mat)
    return obj


def tapered_between(name, start, end, radius_a, radius_b, mat, parent=None, vertices=16):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_a,
        radius2=radius_b,
        depth=direction.length,
        location=(0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.rotation_mode = "XYZ"
    obj.parent = parent
    obj.location = (start + end) * 0.5
    apply_material(smooth(obj), mat)
    return obj


def feather(name, root, tip, root_width, tip_width, thickness, mat, parent):
    """Create a lightly bevelled tapered feather in the parent's XY plane."""
    root = Vector((*root, 0.0))
    tip = Vector((*tip, 0.0))
    direction = (tip - root).normalized()
    normal = Vector((-direction.y, direction.x, 0.0))
    shoulder = root + direction * min(0.12, (tip - root).length * 0.22)
    verts = [
        root + normal * root_width,
        shoulder + normal * root_width * 1.08,
        tip + normal * tip_width,
        tip + direction * tip_width * 1.5,
        tip - normal * tip_width,
        shoulder - normal * root_width * 1.08,
        root - normal * root_width,
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    solid = obj.modifiers.new("Feather thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0
    bevel = obj.modifiers.new("Soft feather edge", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    apply_material(obj, mat)
    return obj


def make_wing(side, white, black):
    sign = -1 if side == "L" else 1
    pivot = bpy.data.objects.new(f"Wing_{side}_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.empty_display_type = "PLAIN_AXES"
    pivot.empty_display_size = 0.12
    pivot.location = (0.16 * sign, 0.11, 0.025)

    # White secondaries: broad overlap near the body makes one continuous wing
    # surface while retaining visible feather edges from above.
    for i in range(7):
        root = (0.015 * sign, 0.13 - i * 0.035)
        tip = ((0.40 + i * 0.075) * sign, 0.34 - i * 0.075)
        feather(
            f"Wing_{side}_White_{i:02d}",
            root,
            tip,
            0.105,
            0.035,
            0.025,
            white,
            pivot,
        )

    # Black primaries form the unmistakable white-stork fan.
    for i in range(8):
        root = ((0.38 + i * 0.035) * sign, 0.03 - i * 0.025)
        tip = ((0.92 + i * 0.055) * sign, 0.13 - i * 0.085)
        feather(
            f"Wing_{side}_Black_{i:02d}",
            root,
            tip,
            0.078,
            0.018,
            0.022,
            black,
            pivot,
        )

    # Coverts soften the hard white/black join.
    for i in range(5):
        ellipsoid(
            f"Wing_{side}_Covert_{i:02d}",
            ((0.20 + i * 0.10) * sign, 0.13 - i * 0.025, 0.026),
            (0.23, 0.075, 0.022),
            white,
            parent=pivot,
            segments=16,
            rings=8,
        )
    return pivot


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


reset_scene()

white = material("Warm white feathers", (0.92, 0.905, 0.84), 0.94)
white_hi = material("Sunlit feather edges", (1.0, 0.985, 0.93), 0.88)
black = material("Black flight feathers", (0.008, 0.010, 0.011), 0.84)
red = material("Stork red", (0.72, 0.09, 0.035), 0.62)
eye = material("Eye black", (0.004, 0.006, 0.006), 0.45)

root = bpy.data.objects.new("Stork_Flight_Root", None)
bpy.context.collection.objects.link(root)
root.empty_display_type = "PLAIN_AXES"
root["asset"] = "Paasleben animated white stork"
root["flight_direction"] = "+Y"

# Body, tail and the long straight flight silhouette.
body = ellipsoid("Body", (0, -0.02, 0.045), (0.205, 0.47, 0.145), white, root, 24, 14)
chest = ellipsoid("Chest", (0, 0.29, 0.06), (0.19, 0.27, 0.15), white_hi, root, 22, 12)
tail = feather("Tail_Centre", (0, -0.27), (0, -0.72), 0.105, 0.028, 0.032, white, root)
feather("Tail_Left", (-0.055, -0.24), (-0.14, -0.68), 0.07, 0.022, 0.027, white, root)
feather("Tail_Right", (0.055, -0.24), (0.14, -0.68), 0.07, 0.022, 0.027, white, root)

# A subtly articulated neck reads as organic without becoming heavy geometry.
tapered_between("Neck_Lower", (0, 0.27, 0.06), (0, 0.63, 0.07), 0.11, 0.075, white, root)
tapered_between("Neck_Upper", (0, 0.61, 0.07), (0, 0.91, 0.075), 0.078, 0.055, white_hi, root)
head = ellipsoid("Head", (0, 0.96, 0.078), (0.075, 0.105, 0.075), white_hi, root, 20, 12)
tapered_between("Beak", (0, 1.02, 0.074), (0, 1.39, 0.068), 0.055, 0.009, red, root, 14)
ellipsoid("Eye_L", (-0.066, 1.005, 0.10), (0.012, 0.016, 0.012), eye, root, 12, 6)
ellipsoid("Eye_R", (0.066, 1.005, 0.10), (0.012, 0.016, 0.012), eye, root, 12, 6)

# Legs trail behind the tail in flight; small separation keeps both visible.
for side, x in (("L", -0.045), ("R", 0.045)):
    tapered_between(f"Leg_{side}_Upper", (x, -0.28, 0.02), (x * 1.05, -0.73, 0.015), 0.018, 0.014, red, root, 12)
    tapered_between(f"Leg_{side}_Lower", (x * 1.05, -0.72, 0.015), (x * 1.12, -1.08, 0.008), 0.014, 0.008, red, root, 12)

left_wing = make_wing("L", white, black)
right_wing = make_wing("R", white, black)
left_wing.parent = root
right_wing.parent = root

# Looping flap: long glide, one measured downstroke, then recover.  The two
# roots rotate in opposite directions around the flight axis (+Y).
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 49
bpy.context.scene.render.fps = 24
wing_keys = [
    (1, 7.0),
    (13, 15.0),
    (22, -38.0),
    (31, 42.0),
    (41, 12.0),
    (49, 7.0),
]
for frame, degrees in wing_keys:
    left_wing.rotation_euler = (0, math.radians(degrees), 0)
    right_wing.rotation_euler = (0, math.radians(-degrees), 0)
    left_wing.keyframe_insert(data_path="rotation_euler", frame=frame)
    right_wing.keyframe_insert(data_path="rotation_euler", frame=frame)

# Very small body rise/fall makes the cycle breathe without bobbing like a toy.
for frame, z in ((1, 0.0), (22, -0.018), (31, 0.025), (49, 0.0)):
    root.location.z = z
    root.keyframe_insert(data_path="location", frame=frame)

for animated in (root, left_wing, right_wing):
    action = animated.animation_data.action if animated.animation_data else None
    if not action:
        continue
    action.name = "WhiteStork_Flight"
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
        curve.modifiers.new(type="CYCLES")

# Export only the stork hierarchy; the preview camera/lights below stay local.
bpy.ops.object.select_all(action="DESELECT")
for obj in [root, *root.children_recursive]:
    obj.select_set(True)
root.select_set(True)
bpy.context.view_layer.objects.active = root

out_path = MODEL_DIR / "stork-flight-v1.glb"
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_frame_range=True,
    export_force_sampling=True,
    export_apply=False,
    export_yup=True,
)

# Diagnostic top-down preview at the middle of the downstroke.
bpy.ops.object.camera_add(location=(0, 0.12, 5.2))
camera = bpy.context.object
camera.name = "Preview_Camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 3.55
look_at(camera, (0, 0.12, 0))
bpy.context.scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(-2.5, -2.0, 4.5))
key = bpy.context.object
key.data.energy = 520
key.data.shape = "DISK"
key.data.size = 4.0
look_at(key, (0, 0, 0))
bpy.ops.object.light_add(type="AREA", location=(2.2, 1.6, 2.8))
fill = bpy.context.object
fill.data.energy = 260
fill.data.size = 3.0
look_at(fill, (0, 0.2, 0))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = True
scene.view_settings.look = "AgX - Medium High Contrast"

for frame, name in ((1, "glide"), (22, "downstroke"), (31, "upstroke")):
    scene.frame_set(frame)
    scene.render.filepath = str(PREVIEW_DIR / f"stork-{name}.png")
    bpy.ops.render.render(write_still=True)

print(f"Exported animated stork: {out_path}")
