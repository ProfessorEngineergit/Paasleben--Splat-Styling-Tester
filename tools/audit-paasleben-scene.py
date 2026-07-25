"""Repeatable geometry audit for the measured Paasleben Blender scene.

Run with Blender's background mode after opening the generated .blend file.
The checks operate on convex 2D projections of the actual evaluated meshes, so
rotated roads and narrow sculptural parts are not reduced to loose axis-aligned
bounding boxes.
"""

import json

import bpy


REQUIRED_OBJECTS = (
    "Halle A_body",
    "Halle B_body",
    "Sandplatz",
    "Round Pen sand",
    "Pond water",
    "Tower masonry body",
    "Huehner Stall_body",
    "Pfauen Stall_body",
    "Pferde Stall Atelier main block_body",
    "Entrance sculpture ring",
    "Werkstatt_flywheel_rim",
    "Stork nest ring 00",
    "Horse paddock Corten arch",
    "West paddock stacked circles_ring_00",
    "Piazza Q sculpture_ring",
    "Werkstatt column ensemble_00_shaft",
    "West paddock pointed triangle_left",
    "Nandu_west_1_body",
)

ROAD_PREFIXES = (
    "Entry road_",
    "Public boundary road_",
    "Campus spine_",
    "Round Pen spur_",
    "West paddock road_",
    "Hall access_",
    "Pond path_",
)

NEW_DETAIL_PREFIXES = (
    "Werkstatt_flywheel",
    "Werkstatt_wood_stack",
    "Stork nest ring",
    "Stork nest branch",
    "Stork pole",
    "Corten book",
    "Horse paddock Corten arch",
    "West paddock stacked circles",
    "Piazza Q sculpture",
    "Werkstatt column ensemble",
    "West paddock pointed triangle",
    "Nandu_west",
)


def cross(origin, a, b):
    return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])


def convex_hull(points):
    points = sorted(set(points))
    if len(points) <= 2:
        return points
    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def projected_geometry(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        world_points = [matrix @ vertex.co for vertex in mesh.vertices]
        hull = convex_hull([(round(point.x, 6), round(point.y, 6)) for point in world_points])
        z_range = (min(point.z for point in world_points), max(point.z for point in world_points))
        return hull, z_range
    finally:
        evaluated.to_mesh_clear()


def axes(polygon):
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        edge_x = b[0] - a[0]
        edge_y = b[1] - a[1]
        yield (-edge_y, edge_x)


def projected_interval(polygon, axis):
    values = [point[0] * axis[0] + point[1] * axis[1] for point in polygon]
    return min(values), max(values)


def overlaps(first, second, first_z, second_z, tolerance=1e-4):
    """3D overlap using height intervals plus convex horizontal projections."""
    if len(first) < 3 or len(second) < 3:
        return False
    if first_z[1] <= second_z[0] + tolerance or second_z[1] <= first_z[0] + tolerance:
        return False
    for axis in list(axes(first)) + list(axes(second)):
        first_min, first_max = projected_interval(first, axis)
        second_min, second_max = projected_interval(second, axis)
        if first_max <= second_min + tolerance or second_max <= first_min + tolerance:
            return False
    return True


def overlaps_2d(first, second, tolerance=1e-4):
    if len(first) < 3 or len(second) < 3:
        return False
    for axis in list(axes(first)) + list(axes(second)):
        first_min, first_max = projected_interval(first, axis)
        second_min, second_max = projected_interval(second, axis)
        if first_max <= second_min + tolerance or second_max <= first_min + tolerance:
            return False
    return True


depsgraph = bpy.context.evaluated_depsgraph_get()
scene_objects = list(bpy.context.scene.objects)
meshes = [obj for obj in scene_objects if obj.type in {"MESH", "CURVE"}]
geometry = {obj.name: projected_geometry(obj, depsgraph) for obj in meshes}
hulls = {name: values[0] for name, values in geometry.items()}
z_ranges = {name: values[1] for name, values in geometry.items()}

roads = [obj for obj in meshes if obj.name.startswith(ROAD_PREFIXES)]
tree_trunks = [obj for obj in meshes if obj.name.endswith("_trunk")]
tree_crowns = [obj for obj in meshes if "_crown_" in obj.name]
fence_posts = [
    obj
    for obj in meshes
    if "_post_" in obj.name and not obj.name.startswith("Crop_utility_pole_")
]
bodies = [
    obj
    for obj in meshes
    if (
        obj.name.endswith("_body")
        and not obj.name.startswith(("Horse_", "Nandu_"))
    )
    or obj.name == "Tower masonry body"
]
building_roofs = [
    obj
    for obj in meshes
    if obj.name.endswith(("_roof", "_flat_roof"))
]
new_details = [obj for obj in meshes if obj.name.startswith(NEW_DETAIL_PREFIXES)]
survey_props = [
    obj
    for obj in meshes
    if obj.name.startswith((
        "Hall_yard_equipment_",
        "Hall_material_stack_",
        "North yard service van",
        "North yard trailer",
        "North_rough_storage_",
        "Huehnerstall_nesting_box",
        "Pferdestall_water_trough",
        "Piazza_yard_detail_",
        "Werkstatt_wood_stack_",
    ))
]


def collision_pairs(first_group, second_group):
    return sorted(
        [first.name, second.name]
        for first in first_group
        for second in second_group
        if first != second
        and overlaps(
            hulls[first.name],
            hulls[second.name],
            z_ranges[first.name],
            z_ranges[second.name],
        )
    )


def collision_pairs_unique(group):
    return sorted(
        [first.name, second.name]
        for index, first in enumerate(group)
        for second in group[index + 1:]
        if overlaps(
            hulls[first.name],
            hulls[second.name],
            z_ranges[first.name],
            z_ranges[second.name],
        )
    )


def plan_overlap_pairs_unique(group):
    return sorted(
        [first.name, second.name]
        for index, first in enumerate(group)
        for second in group[index + 1:]
        if overlaps_2d(hulls[first.name], hulls[second.name])
    )


round_pen = bpy.data.objects.get("Round Pen sand")
arena = bpy.data.objects.get("Sandplatz")
round_pen_hits = []
if round_pen is not None:
    round_pen_hits = sorted(
        road.name
        for road in roads
        if overlaps(
            hulls[round_pen.name],
            hulls[road.name],
            z_ranges[round_pen.name],
            z_ranges[road.name],
        )
    )

arena_building_hits = []
arena_prop_hits = []
arena_road_hits = []
if arena is not None:
    arena_building_hits = sorted(
        obj.name
        for obj in bodies + building_roofs
        if overlaps_2d(hulls[arena.name], hulls[obj.name])
    )
    arena_prop_hits = sorted(
        obj.name
        for obj in survey_props
        if overlaps_2d(hulls[arena.name], hulls[obj.name])
    )
    arena_road_hits = sorted(
        obj.name
        for obj in roads
        if overlaps_2d(hulls[arena.name], hulls[obj.name])
    )

result = {
    "objects": len(scene_objects),
    "cameras": sum(obj.type == "CAMERA" for obj in scene_objects),
    "missing": [name for name in REQUIRED_OBJECTS if bpy.data.objects.get(name) is None],
    "round_pen_road_hits": round_pen_hits,
    "arena_building_hits": arena_building_hits,
    "arena_prop_hits": arena_prop_hits,
    "arena_road_hits": arena_road_hits,
    "tree_road_hits": collision_pairs(tree_trunks, roads),
    "tree_body_hits": collision_pairs(tree_trunks, bodies),
    "tree_roof_hits": collision_pairs(tree_crowns, building_roofs),
    "fence_post_road_hits": collision_pairs(fence_posts, roads),
    "building_road_hits": collision_pairs(bodies, roads),
    "body_body_hits": collision_pairs_unique(bodies),
    "roof_plan_hits": plan_overlap_pairs_unique(building_roofs),
    "new_body_hits": collision_pairs(new_details, bodies),
    "new_road_hits": collision_pairs(new_details, roads),
    "prop_body_hits": collision_pairs(survey_props, bodies),
    "service_block": any("service block" in obj.name.lower() for obj in scene_objects),
}

print("PAASLEBEN_AUDIT " + json.dumps(result, sort_keys=True))
