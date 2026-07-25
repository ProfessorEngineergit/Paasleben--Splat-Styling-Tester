"""Render only architectural masses over the calibrated full-site bounds.

The normal validation render contains fields, fences, trees, roads and props,
which makes footprint comparisons unnecessarily ambiguous.  This diagnostic
keeps building bodies and roofs only and renders them as a flat white mask.
"""

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
WORLD_X = (-5.25, 3.90)
WORLD_Z = (-3.25, 4.30)
U = 30.0
WIDTH = 2200

scene = bpy.context.scene

keep_tokens = (
    "_body",
    "_roof",
    "ridge band",
    "chimney",
)

for obj in scene.objects:
    if obj.type != "MESH":
        obj.hide_render = True
        continue
    obj.hide_render = not any(token.lower() in obj.name.lower() for token in keep_tokens)

mask_material = bpy.data.materials.get("Building diagnostic white")
if mask_material is None:
    mask_material = bpy.data.materials.new("Building diagnostic white")
    mask_material.diffuse_color = (1.0, 1.0, 1.0, 1.0)

for obj in scene.objects:
    if obj.type == "MESH" and not obj.hide_render:
        obj.data.materials.clear()
        obj.data.materials.append(mask_material)

camera_data = bpy.data.cameras.new("Building diagnostic camera data")
camera = bpy.data.objects.new("Building diagnostic camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (
    sum(WORLD_X) / 2 * U,
    -sum(WORLD_Z) / 2 * U,
    220.0,
)
camera.rotation_euler = (0.0, 0.0, 0.0)
camera_data.type = "ORTHO"
camera_data.ortho_scale = (WORLD_Z[1] - WORLD_Z[0]) * U
scene.camera = camera

scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = False
scene.display.shading.show_cavity = False
scene.display.shading.show_specular_highlight = False
scene.display.shading.background_type = "VIEWPORT"
scene.display.shading.background_color = (0.0, 0.0, 0.0)
scene.render.film_transparent = False
scene.render.resolution_x = WIDTH
scene.render.resolution_y = round(WIDTH * (WORLD_Z[1] - WORLD_Z[0]) / (WORLD_X[1] - WORLD_X[0]))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(
    ROOT / "artifacts" / "photogrammetry" / "aligned" / "blender-buildings-top.png"
)
bpy.ops.render.render(write_still=True)
print("PAASLEBEN_BUILDING_DIAGNOSTIC_DONE")
