"""Render the Blender blockout over the full COLMAP comparison bounds."""

from pathlib import Path

import bpy


ROOT = Path('/Users/bahriannovotny/Desktop/DEV./Paasleben--Splat-Styling-Tester')
WORLD_X = (-5.25, 3.90)
WORLD_Z = (-3.25, 4.30)
U = 30.0
WIDTH = 2200

scene = bpy.context.scene
camera_data = bpy.data.cameras.new('Photogrammetry calibration camera data')
camera = bpy.data.objects.new('Photogrammetry calibration camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (
    sum(WORLD_X) / 2 * U,
    -sum(WORLD_Z) / 2 * U,
    220.0,
)
camera.rotation_euler = (0.0, 0.0, 0.0)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = (WORLD_Z[1] - WORLD_Z[0]) * U
scene.camera = camera

scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.studio_light = 'paint.sl'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = False
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.display.shading.curvature_ridge_factor = 1.25
scene.display.shading.curvature_valley_factor = 0.85
scene.display.shading.show_specular_highlight = False
scene.render.resolution_x = WIDTH
scene.render.resolution_y = round(WIDTH * (WORLD_Z[1] - WORLD_Z[0]) / (WORLD_X[1] - WORLD_X[0]))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'artifacts/photogrammetry/aligned/blender-full-top.png')
bpy.ops.render.render(write_still=True)
print('PAASLEBEN_PHOTOGRAMMETRY_TOP_DONE')
