"""Render Blender Workbench inspection views from the calibrated Splat cameras.

This intentionally uses the same cameras as the measured scene but replaces
the presentation render with Blender's viewport-style studio lighting, cavity
and outlines.  The result is a geometry diagnostic, not a final look.
"""

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "workbench-inspection"
OUT.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False

shading = scene.display.shading
shading.light = "STUDIO"
shading.studio_light = "paint.sl"
shading.color_type = "MATERIAL"
shading.show_shadows = True
shading.show_cavity = True
shading.cavity_type = "BOTH"
shading.curvature_ridge_factor = 1.6
shading.curvature_valley_factor = 1.25
shading.show_specular_highlight = False
shading.show_object_outline = True
shading.background_type = "VIEWPORT"
shading.background_color = (0.055, 0.075, 0.070)

marker_collection = bpy.data.collections.get("VALIDATION_MARKERS")
if marker_collection is not None:
    marker_collection.hide_render = True

views = (
    "site",
    "oblique-se",
    "oblique-sw",
    "oblique-nw",
    "oblique-ne",
    "oblique-core-east",
    "oblique-core-west",
    "oblique-halls",
    "oblique-north-houses",
    "oblique-pond",
    "oblique-entry",
    "overview",
    "reverse",
)

for view in views:
    camera = bpy.data.objects.get(f"Camera_measured_{view}")
    if camera is None:
        raise RuntimeError(f"Missing inspection camera: {view}")
    scene.camera = camera
    scene.render.filepath = str(OUT / f"workbench-{view}.png")
    bpy.ops.render.render(write_still=True)
    print(f"WORKBENCH_VIEW {view} {scene.render.filepath}")

print("PAASLEBEN_WORKBENCH_INSPECTION_DONE")
