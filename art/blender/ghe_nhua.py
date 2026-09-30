"""Ghế nhựa đỏ lùn vỉa hè — asset "chất Việt" đầu tiên (docs/PLAN.md §5).

Chạy: blender -b -P art/blender/ghe_nhua.py
Xuất: art/export/ghe-nhua-do.glb (+ file nguồn art/source/ghe-nhua.blend)

Quy ước style bible: đơn vị mét, pivot ở đáy, màu phẳng lấy từ palette, low-poly.
"""

import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / "art/export/ghe-nhua-do.glb"
SOURCE = ROOT / "art/source/ghe-nhua.blend"

# Palette XÓM (docs/art/STYLE.md)
RED = (0.776, 0.058, 0.026, 1.0)  # #e4432d ở không gian linear

HEIGHT = 0.30  # ghế lùn vỉa hè
SEAT = 0.28  # cạnh mặt ghế
SEAT_T = 0.03
LEG_W = 0.035
SPLAY = math.radians(8)  # chân choãi ra ngoài


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material():
    mat = bpy.data.materials.new("xom-red")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = RED
    bsdf.inputs["Roughness"].default_value = 0.6
    return mat


def box(name, size, location, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return obj


def build():
    mat = material()
    seat = box("seat", (SEAT, SEAT, SEAT_T), (0, 0, HEIGHT - SEAT_T / 2))
    bevel = seat.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.02
    bevel.segments = 2
    bevel.limit_method = "ANGLE"

    parts = [seat]
    leg_h = (HEIGHT - SEAT_T) / math.cos(SPLAY)
    inset = SEAT / 2 - LEG_W
    for sx in (-1, 1):
        for sy in (-1, 1):
            # Chân nghiêng ra ngoài theo đường chéo; đỉnh chân nằm dưới góc mặt ghế.
            top = (sx * inset, sy * inset, HEIGHT - SEAT_T)
            offset = math.sin(SPLAY) * leg_h / 2
            center = (
                top[0] + sx * offset / math.sqrt(2),
                top[1] + sy * offset / math.sqrt(2),
                (HEIGHT - SEAT_T) / 2,
            )
            leg = box(
                f"leg_{sx}_{sy}",
                (LEG_W, LEG_W, leg_h),
                center,
                rotation=(-sy * SPLAY / math.sqrt(2), sx * SPLAY / math.sqrt(2), 0),
            )
            parts.append(leg)

    # Thanh giằng nối các chân, đặc trưng của ghế nhựa đúc.
    brace_z = 0.09
    brace_span = SEAT + 0.02
    for axis in ("x", "y"):
        for s in (-1, 1):
            loc = (s * (inset + 0.02), 0, brace_z) if axis == "y" else (0, s * (inset + 0.02), brace_z)
            size = (0.02, brace_span, 0.02) if axis == "y" else (brace_span, 0.02, 0.02)
            parts.append(box(f"brace_{axis}_{s}", size, loc))

    for obj in parts:
        obj.data.materials.append(mat)
        bpy.context.view_layer.objects.active = obj
        for mod in obj.modifiers:
            bpy.ops.object.modifier_apply(modifier=mod.name)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = seat
    bpy.ops.object.join()
    stool = bpy.context.active_object
    stool.name = "ghe-nhua-do"
    # Pivot ở đáy (z = 0).
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.shade_flat()
    return stool


def main():
    reset_scene()
    stool = build()
    tris = sum(len(p.vertices) - 2 for p in stool.data.polygons)
    EXPORT.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.export_scene.gltf(
        filepath=str(EXPORT),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
    )
    print(f"XOM_EXPORT ok {EXPORT.name} tris={tris}")


main()
