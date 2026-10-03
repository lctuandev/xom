"""Gộp thân + đầu nhân vật Kenney mini thành một mesh có xương (docs/PLAN.md §1 — mỗi người 1 draw call thay vì 2).

Chạy: blender -b -P art/blender/gop_nhan_vat.py
Đọc: art/vendor/kenney/kenney_mini-characters/Models/GLB format/<tên>.glb
Xuất: art/export/characters/<tên>.glb (giữ nguyên xương + mọi animation) — bundles.json "singles.characters" đọc từ đây.
"""

from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art/vendor/kenney/kenney_mini-characters/Models/GLB format"
OUT = ROOT / "art/export/characters"
NAMES = ["character-male-a", "character-male-c", "character-female-a", "character-female-d"]


def gop(name: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC / f"{name}.glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        # Giữ nguyên keyframe gốc của Kenney (không lấy mẫu lại từng frame) cho file nhẹ như bản gốc.
        export_force_sampling=False,
        export_optimize_animation_size=True,
        export_yup=True,
    )
    print(f"✔ {name}: {len(meshes)} mesh → 1")


if __name__ == "__main__":
    for n in NAMES:
        gop(n)
