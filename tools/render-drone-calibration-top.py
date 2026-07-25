"""Render the same KSplat world bounds as orthorectify-drone-reference.py."""

import bpy
from pathlib import Path


ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
WORLD_X = (-3.45, -0.20)
WORLD_Z = (-2.55, 0.50)
U = 30.0

scene = bpy.context.scene
camera_data = bpy.data.cameras.new('Drone calibration top camera data')
camera = bpy.data.objects.new('Drone calibration top camera', camera_data)
scene.collection.objects.link(camera)
center_x = sum(WORLD_X) / 2 * U
center_y = -sum(WORLD_Z) / 2 * U
camera.location = (center_x, center_y, 120.0)
camera.rotation_euler = (0.0, 0.0, 0.0)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = (WORLD_Z[1] - WORLD_Z[0]) * U
camera_data.lens = 50
scene.camera = camera

scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.studio_light = 'paint.sl'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.display.shading.curvature_ridge_factor = 1.25
scene.display.shading.curvature_valley_factor = 0.85
scene.display.shading.show_specular_highlight = False
scene.render.resolution_x = 1600
scene.render.resolution_y = round(1600 * (WORLD_Z[1] - WORLD_Z[0]) / (WORLD_X[1] - WORLD_X[0]))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'artifacts' / 'drone-measurements' / 'blender-drone-calibration-top.png')
bpy.ops.render.render(write_still=True)
print('PAASLEBEN_DRONE_CALIBRATION_TOP_DONE')
