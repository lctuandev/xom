"""Quầy hàng của 3 nghề MVP: xe bánh mì kính, xe trà sữa, sạp phụ kiện (docs/art/STYLE.md).

Chạy: blender -b -P art/blender/xe_hang.py
Xuất: art/export/{xe-banh-mi,xe-tra-sua,sap-phu-kien}.glb (+ nguồn art/source/xe-hang.blend)

Quy ước: mét, pivot đáy giữa, MẶT TRƯỚC quay về -Y của Blender (= +Z trong glTF/three.js),
tức phía khách đứng mua.
"""

import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
EXPORT_DIR = ROOT / "art/export"
SOURCE = ROOT / "art/source/xe-hang.blend"

PALETTE = {
    "red": "#e4432d",
    "sun": "#f6b93b",
    "leaf": "#2f7d4f",
    "cream": "#fff6e5",
    "ink": "#2b2118",
    "glass": "#bfe3f2",
    "wood": "#b07a4a",
    "steel": "#9aa3ad",
    "pink": "#f29bb8",
}


def srgb_to_linear(hex_color: str):
    def ch(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    h = hex_color.lstrip("#")
    return (ch(int(h[0:2], 16)), ch(int(h[2:4], 16)), ch(int(h[4:6], 16)), 1.0)


_materials: dict[str, bpy.types.Material] = {}


def mat(name: str) -> bpy.types.Material:
    if name not in _materials:
        m = bpy.data.materials.new(f"xom-{name}")
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = srgb_to_linear(PALETTE[name])
        bsdf.inputs["Roughness"].default_value = 0.7
        _materials[name] = m
    return _materials[name]


def box(size, loc, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat(color))
    return o


def cyl(radius, depth, loc, color, verts=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.materials.append(mat(color))
    return o


def cone(r1, r2, depth, loc, color, verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object
    o.data.materials.append(mat(color))
    return o


def wheel(x, y, r=0.2):
    return cyl(r, 0.06, (x, y, r), "ink", verts=12, rot=(0, math.pi / 2, 0))


def finish(name: str, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.shade_flat()
    return obj


def xe_banh_mi():
    """Xe đẩy thân kem, tủ kính trên cùng viền đỏ, hai bánh bên hông."""
    p = []
    p.append(box((1.3, 0.62, 0.62), (0, 0, 0.62), "cream"))  # thân
    p.append(box((1.34, 0.66, 0.05), (0, 0, 0.955), "steel"))  # mặt bàn inox
    p.append(box((1.1, 0.5, 0.5), (0, 0.02, 1.23), "glass"))  # tủ kính
    for x in (-0.56, 0.56):  # khung đỏ
        p.append(box((0.04, 0.54, 0.54), (x, 0.02, 1.23), "red"))
    p.append(box((1.16, 0.56, 0.05), (0, 0.02, 1.5), "red"))  # nóc tủ
    p.append(box((1.2, 0.02, 0.16), (0, -0.325, 0.78), "red"))  # dải chữ phía trước
    p.append(box((0.9, 0.3, 0.12), (0, 0.05, 1.04), "sun"))  # ổ bánh mì trong tủ
    p.append(wheel(-0.69, 0.1, 0.26))
    p.append(wheel(0.69, 0.1, 0.26))
    for x in (-0.55, 0.55):  # chân chống phía sau
        p.append(box((0.04, 0.04, 0.32), (x, 0.26, 0.16), "steel"))
    p.append(cyl(0.02, 0.9, (0, 0.42, 0.95), "steel", verts=6, rot=(0, math.pi / 2, 0)))  # tay đẩy
    return finish("xe-banh-mi", p)


def xe_tra_sua():
    """Xe thân vàng, quầy có ly, cột dù và dù xanh."""
    p = []
    p.append(box((1.2, 0.6, 0.75), (0, 0, 0.62), "sun"))
    p.append(box((1.26, 0.66, 0.05), (0, 0, 1.02), "cream"))
    p.append(box((1.14, 0.02, 0.22), (0, -0.305, 0.72), "leaf"))  # bảng hiệu nhỏ phía trước
    for i, x in enumerate((-0.4, -0.2, 0.0, 0.2)):
        color = "cream" if i % 2 else "pink"
        p.append(cyl(0.06, 0.16, (x, -0.12, 1.13), color, verts=8))  # ly trà sữa
    p.append(cyl(0.18, 0.3, (0.38, 0.12, 1.2), "steel", verts=10))  # thùng trà
    p.append(cyl(0.025, 1.2, (-0.5, 0.2, 1.62), "steel", verts=6))  # cột dù
    p.append(cone(0.95, 0.05, 0.35, (-0.5, 0.2, 2.35), "leaf", verts=8))  # dù
    p.append(wheel(-0.64, 0.05))
    p.append(wheel(0.64, 0.05))
    for x in (-0.5, 0.5):
        p.append(box((0.04, 0.04, 0.26), (x, 0.24, 0.13), "steel"))
    return finish("xe-tra-sua", p)


def sap_phu_kien():
    """Sạp bàn gấp phủ vải hồng, mái bạt đỏ trên 4 cột, hàng hóa lặt vặt."""
    p = []
    p.append(box((1.5, 0.7, 0.05), (0, 0, 0.78), "wood"))  # mặt sạp
    p.append(box((1.52, 0.02, 0.35), (0, -0.36, 0.62), "pink"))  # vải phủ trước
    for x in (-0.7, 0.7):
        for y in (-0.3, 0.3):
            p.append(box((0.04, 0.04, 0.76), (x, y, 0.38), "wood"))  # chân bàn
            p.append(cyl(0.02, 1.2, (x * 1.05, y * 1.2, 1.4), "steel", verts=6))  # cột mái
    p.append(box((1.7, 0.95, 0.04), (0, 0, 2.0), "red", rot=(math.radians(-8), 0, 0)))  # mái bạt
    items = [("sun", -0.5), ("leaf", -0.25), ("cream", 0.0), ("pink", 0.25), ("glass", 0.5)]
    for color, x in items:
        p.append(box((0.16, 0.2, 0.08), (x, -0.08, 0.845), color))
    p.append(box((0.9, 0.04, 0.4), (0, 0.33, 1.05), "cream"))  # bảng treo móc khóa phía sau
    return finish("sap-phu-kien", p)


def export(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    path = EXPORT_DIR / f"{obj.name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
    )
    tris = sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    print(f"XOM_EXPORT ok {path.name} tris={tris}")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    objs = []
    for i, build in enumerate((xe_banh_mi, xe_tra_sua, sap_phu_kien)):
        obj = build()
        objs.append(obj)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    for obj in objs:
        export(obj)


main()
