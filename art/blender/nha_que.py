"""Nhà xóm quê theo cấp (docs/DESIGN.md §5 — nhà ở nâng cấp dần) + cây cối, rào quê.

Chạy: blender -b -P art/blender/nha_que.py
Xuất: art/export/<tên>.glb — gom vào bundle "village" (packages/assets/bundles.json, `pnpm assets village`).

Cấp nhà (content.housing): nhà tranh → nhà cấp 4 mái ngói → nhà ống 1 lầu → nhà ống 2 lầu.
Quy ước: đơn vị mét, gốc ở giữa đáy, MẶT TIỀN quay về -Y của Blender (= +Z trong glTF/three, giống Kenney),
vừa một ô bản đồ 4 m (chừa lề), màu phẳng theo palette ấm, low-poly (vài trăm tam giác mỗi nhà).
"""

import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "art/export"


def lin(hex_color: str):
    """#rrggbb (sRGB) → màu linear cho Principled BSDF."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


PALETTE = {
    "voi_vang": "#ffe08f",  # tường vôi vàng
    "voi_xanh": "#bfe8d8",  # tường vôi xanh ngọc
    "voi_hong": "#ffcdb9",
    "voi_trang": "#fff6e3",
    "ngoi": "#d6503a",  # mái ngói đỏ
    "ngoi_dam": "#8f3324",
    "ngoi_vua": "#b8442f",  # hàng ngói xen (mái sọc)
    "be_tong": "#a9a49a",  # cột điện bê tông
    "su": "#e8e4dc",  # sứ cách điện
    "day_dien": "#26282b",
    "ton": "#6d8fa8",  # mái tôn xanh
    "tranh": "#c9a45c",  # mái lá/rơm
    "tre": "#a8894c",  # vách tre
    "go": "#7a4a2a",  # cửa gỗ
    "go_sang": "#a86a3d",
    "kinh": "#86b7cf",
    "nen": "#b7a58c",  # nền gạch, bậc thềm
    "cot": "#e8dcc4",
    "la": "#4f8a3c",
    "la_dam": "#3c6e2f",
    "than_cay": "#7b5a3a",
    "chuoi": "#7cae3f",
    "lu": "#8a5a3c",
    "co_do": "#e4432d",
    "vang": "#f5c542",
    "atm_xanh": "#1f5aa6",  # thân cây ATM màu ngân hàng
    "atm_dam": "#123764",
    "man_hinh": "#7fd0ff",
    "xam": "#c9d1d9",
    "den": "#2b2f36",
    "da": "#9a948a",  # bệ đá
}

_mats = {}


def mat(name: str):
    if name not in _mats:
        m = bpy.data.materials.new(f"xom-{name}")
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = lin(PALETTE[name])
        bsdf.inputs["Roughness"].default_value = 0.85
        _mats[name] = m
    return _mats[name]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def assign(obj, color: str):
    obj.data.materials.clear()
    obj.data.materials.append(mat(color))
    return obj


def box(size, loc, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return assign(o, color)


def cyl(r, h, loc, color, verts=8, r2=None):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=loc
    )
    return assign(bpy.context.active_object, color)


def sphere(r, loc, color, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return assign(o, color)


def gable_roof(w, d, z, rise, color, over=0.25, along="x"):
    """Mái hai mái (lăng trụ tam giác) phủ khối w×d, nóc chạy theo trục `along`, chân mái ở cao độ z."""
    hw, hd = w / 2 + over, d / 2 + over
    me = bpy.data.meshes.new("roof")
    bm = bmesh.new()
    if along == "x":
        pts = [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-hw, 0, z + rise), (hw, 0, z + rise)]
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    else:
        pts = [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (0, -hd, z + rise), (0, hd, z + rise)]
        faces = [(1, 2, 5, 4), (3, 0, 4, 5), (0, 1, 4), (2, 3, 5), (0, 3, 2, 1)]
    vs = [bm.verts.new(p) for p in pts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("roof", me)
    bpy.context.collection.objects.link(o)
    return assign(o, color)


def tiled_gable(w, d, z, rise, over=0.25, rows=6, light="ngoi", dark="ngoi_vua"):
    """Mái ngói hai mái chạy theo trục x, mỗi mái chia `rows` hàng ngói xen sáng/tối (mỗi hàng 2 tam giác) — nhìn từ trên
    (camera chính) thấy rõ lớp ngói mà vẫn rẻ (docs/ART.md bước 2). Hai đầu hồi là tam giác tường."""
    hw, hd = w / 2 + over, d / 2 + over
    for side in (-1, 1):
        for k in range(rows):
            t0, t1 = k / rows, (k + 1) / rows
            y0, y1 = side * hd * (1 - t0), side * hd * (1 - t1)
            z0_, z1_ = z + rise * t0, z + rise * t1
            me = bpy.data.meshes.new("ngoi")
            bm = bmesh.new()
            vs = [bm.verts.new(v) for v in [(-hw, y0, z0_), (hw, y0, z0_), (hw, y1, z1_), (-hw, y1, z1_)]]
            bm.faces.new(vs)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            for f in bm.faces:
                if f.normal.z < 0:
                    f.normal_flip()
            bm.to_mesh(me)
            bm.free()
            o = bpy.data.objects.new("ngoi", me)
            bpy.context.collection.objects.link(o)
            assign(o, light if k % 2 == 0 else dark)
    # Đầu hồi (tường tam giác) + bờ nóc.
    for sx in (-1, 1):
        me = bpy.data.meshes.new("hoi")
        bm = bmesh.new()
        x = sx * (w / 2)
        vs = [bm.verts.new(v) for v in [(x, -d / 2, z), (x, d / 2, z), (x, 0, z + rise * (d / 2) / hd)]]
        bm.faces.new(vs)
        for f in bm.faces:
            if f.normal.x * sx < 0:
                f.normal_flip()
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new("hoi", me)
        bpy.context.collection.objects.link(o)
        assign(o, "voi_trang")
    box((w + 2 * over + 0.1, 0.18, 0.12), (0, 0, z + rise + 0.03), "ngoi_dam")


def hip_roof(w, d, z, rise, color, over=0.3):
    """Mái tranh bốn mái (nhà tranh): đỉnh là một đường nóc ngắn."""
    hw, hd = w / 2 + over, d / 2 + over
    ridge = max(0.0, hw - hd)
    me = bpy.data.meshes.new("hip")
    bm = bmesh.new()
    pts = [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-ridge, 0, z + rise), (ridge, 0, z + rise)]
    vs = [bm.verts.new(p) for p in pts]
    for f in [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("hip", me)
    bpy.context.collection.objects.link(o)
    return assign(o, color)


def shed_roof(w, d, z_front, z_back, y_front, color, over=0.15):
    """Mái hiên dốc một phía (hiên trước, mái tôn)."""
    hw = w / 2 + over
    me = bpy.data.meshes.new("shed")
    bm = bmesh.new()
    y0, y1 = y_front - over, y_front + d
    pts = [(-hw, y0, z_front), (hw, y0, z_front), (hw, y1, z_back), (-hw, y1, z_back)]
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.06)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("shed", me)
    bpy.context.collection.objects.link(o)
    return assign(o, color)


def front_openings(y, z0, w, door_w=0.9, door_h=1.9, win=True, door_color="go", wall_w=3.0):
    """Cửa chính + hai cửa sổ trên mặt tiền (dán nổi nhẹ ra trước mặt tường y)."""
    box((door_w, 0.06, door_h), (0, y - 0.03, z0 + door_h / 2), door_color)
    if win:
        for sx in (-1, 1):
            x = sx * min(wall_w / 2 - 0.45, door_w / 2 + 0.6)
            box((0.6, 0.06, 0.6), (x, y - 0.03, z0 + 1.3), "go_sang")
            box((0.46, 0.08, 0.46), (x, y - 0.04, z0 + 1.3), "kinh")


def bake_vertex_colors(objs):
    """Màu của từng phần → vertex color; cả model dùng MỘT material (1 draw call mỗi loại nhà — PLAN §1)."""
    for o in objs:
        m = o.data.materials[0] if o.data.materials else None
        col = m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value[:] if m else (1, 1, 1, 1)
        layer = o.data.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        for d in layer.data:
            d.color = col
        o.data.materials.clear()
    shared = bpy.data.materials.new("xom-vertex")
    shared.use_nodes = True
    nodes = shared.node_tree.nodes
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    shared.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    for o in objs:
        o.data.materials.append(shared)


def plate(w, h, loc, color):
    """Mặt phẳng mỏng quay ra phố (-Y): 2 tam giác thay cho hộp 12 tam giác — song sắt, nan cửa, kệ, khung (chi tiết chỉ
    nhìn từ phía trước; giữ ngân sách tam giác khi cả dãy phố dùng chung — PLAN §1)."""
    x, y, z = loc
    me = bpy.data.meshes.new("plate")
    bm = bmesh.new()
    vs = [
        bm.verts.new(p)
        for p in [(x - w / 2, y, z - h / 2), (x + w / 2, y, z - h / 2), (x + w / 2, y, z + h / 2), (x - w / 2, y, z + h / 2)]
    ]
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("plate", me)
    bpy.context.collection.objects.link(o)
    return assign(o, color)




def bake_ao(obj, strength=0.6):
    """Nướng AO (Cycles) vào một lớp màu đỉnh rồi nhân vào màu gốc."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    mesh = obj.data
    col = mesh.color_attributes["Col"]
    ao = mesh.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = ao
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene.render.bake.target = "VERTEX_COLORS"
    bpy.ops.object.bake(type="AO")
    for c, a in zip(col.data, ao.data, strict=True):
        k = 1 - strength * (1 - a.color[0])
        c.color = (c.color[0] * k, c.color[1] * k, c.color[2] * k, c.color[3])
    mesh.color_attributes.remove(mesh.color_attributes["AO"])
    mesh.color_attributes.active_color = mesh.color_attributes["Col"]


def export(name: str, ao: bool = True):
    """Gộp mọi object thành một mesh một material (màu ở vertex color), nướng AO vào màu đỉnh (docs/ART.md), xuất GLB, dọn
    cảnh."""
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bake_vertex_colors(objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    bpy.ops.object.shade_flat()
    if ao:
        bake_ao(joined)
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_vertex_color="ACTIVE",
    )
    tris = sum(len(p.vertices) - 2 for p in joined.data.polygons)
    print(f"✔ {name}: ~{tris} tam giác")
    reset()


# ───────────────────────── Nhà theo cấp ─────────────────────────


def nha_tranh():
    """Cấp 0: nhà tranh vách tre, nền đất nện, mái lá bốn mái."""
    w, d, h = 2.6, 2.2, 1.7
    box((w + 0.3, d + 0.3, 0.12), (0, 0, 0.06), "nen")
    box((w, d, h), (0, 0, 0.12 + h / 2), "tre")
    # Nẹp tre dọc cho có vân vách.
    for i in range(-3, 4):
        box((0.05, 0.03, h), (i * 0.37, -d / 2 - 0.015, 0.12 + h / 2), "go_sang")
    box((0.8, 0.06, 1.5), (0.4, -d / 2 - 0.04, 0.12 + 0.75), "go")
    hip_roof(w, d, 0.12 + h, 1.2, "tranh", over=0.45)
    export("nha-tranh")


def nha_cap4(color="voi_vang", name="nha-cap4"):
    """Cấp 1: nhà cấp 4 tường vôi, mái ngói đỏ có hàng ngói, hiên trước hai cột, cửa gỗ pa-nô, hai cửa sổ song sắt, bậc
    thềm, AO nướng (docs/ART.md bước 2 — ~300 tam giác vì cả hàng 50 nhà dân dùng)."""
    w, d, h = 3.2, 2.6, 2.3
    y_wall = -d / 2 + 0.3  # tường lùi vào chừa hiên
    box((w + 0.2, d + 0.5, 0.2), (0, -0.1, 0.1), "nen")
    box((1.0, 0.35, 0.1), (0, -d / 2 - 0.25, 0.05), "nen")  # bậc thềm
    box((w, d - 0.3, h), (0, 0.15, 0.2 + h / 2), color)
    # Cửa gỗ hai cánh pa-nô + hai cửa sổ song sắt (mặt phẳng — chỉ nhìn từ trước).
    plate(0.95, 1.95, (0, y_wall - 0.02, 0.2 + 0.975), "go")
    plate(0.04, 1.95, (0, y_wall - 0.03, 0.2 + 0.975), "go_sang")
    for sx in (-1, 1):
        x = sx * 1.05
        plate(0.7, 0.75, (x, y_wall - 0.02, 0.2 + 1.35), "kinh")
        for k in range(5):
            plate(0.03, 0.75, (x - 0.28 + k * 0.14, y_wall - 0.03, 0.2 + 1.35), "den")
        plate(0.78, 0.06, (x, y_wall - 0.03, 0.2 + 1.75), "go_sang")
    # Hiên: hai cột tròn, mái ngói kéo ra che hiên.
    for sx in (-1, 1):
        cyl(0.08, h, (sx * (w / 2 - 0.15), -d / 2 - 0.1, 0.2 + h / 2), "cot", verts=6)
    tiled_gable(w, d + 0.3, 0.2 + h, 1.05, over=0.3, rows=6)
    export(name)

def nha_ong(floors=1, color="voi_xanh", name="nha-ong-1-lau"):
    """Cấp 2–3: nhà ống mặt tiền hẹp, tầng trệt cửa sắt kéo + mái hiên tôn, lầu có ban công."""
    w, d = 3.2, 3.4
    fh = 2.6
    total = fh * (floors + 1)
    box((w + 0.2, d + 0.2, 0.15), (0, 0, 0.075), "nen")
    box((w, d, total), (0, 0, 0.15 + total / 2), color)
    y = -d / 2
    # Tầng trệt: cửa rộng (kiểu nhà phố bán buôn), mái hiên tôn.
    box((2.0, 0.06, 2.1), (0, y - 0.03, 0.15 + 1.05), "go")
    shed_roof(w, 0.9, 0.15 + 2.5, 0.15 + 2.75, y - 0.8, "ton")
    for f in range(1, floors + 1):
        z = 0.15 + f * fh
        # Ban công: sàn, lan can, cửa lầu.
        box((w - 0.2, 0.7, 0.1), (0, y - 0.35, z), "nen")
        box((w - 0.2, 0.05, 0.75), (0, y - 0.68, z + 0.42), "cot")
        box((1.4, 0.06, 1.8), (0, y - 0.03, z + 0.95), "kinh")
        box((1.5, 0.07, 0.12), (0, y - 0.035, z + 1.9), "go_sang")
    # Mái: sân thượng có tường chắn + mái tôn nhỏ (nhà ống quê hay vậy).
    top = 0.15 + total
    box((w + 0.1, d + 0.1, 0.25), (0, 0, top + 0.12), "voi_trang")
    gable_roof(w * 0.8, d * 0.5, top + 0.25, 0.6, "ngoi", over=0.1, along="x")
    export(name)


def tiem_tap_hoa(color="voi_hong", name="tiem-tap-hoa"):
    """Nhà phố quê một tầng bán buôn (thay nhà phố hiện đại): mái ngói, mái hiên vải sọc, bảng hiệu trống."""
    w, d, h = 3.4, 3.0, 2.7
    box((w + 0.2, d + 0.2, 0.2), (0, 0, 0.1), "nen")
    box((w, d, h), (0, 0, 0.2 + h / 2), color)
    y = -d / 2
    box((2.4, 0.06, 2.0), (0, y - 0.03, 0.2 + 1.0), "go")
    # Bảng hiệu (chữ do runtime vẽ ở quầy riêng; đây là tấm trống màu).
    box((w - 0.3, 0.08, 0.45), (0, y - 0.05, 0.2 + h - 0.35), "vang")
    shed_roof(w, 0.8, 0.2 + 2.25, 0.2 + 2.45, y - 0.75, "co_do")
    gable_roof(w, d, 0.2 + h, 0.9, "ngoi", over=0.2, along="x")
    export(name)


def truong_lang():
    """Trường làng: dãy lớp một tầng dài, hành lang cột, mái ngói, cột cờ."""
    w, d, h = 3.8, 2.6, 2.5
    box((w, d + 0.4, 0.2), (0, -0.2, 0.1), "nen")
    box((w, d - 0.4, h), (0, 0.2, 0.2 + h / 2), "voi_vang")
    for i in range(3):
        x = -1.1 + i * 1.1
        box((0.6, 0.06, 1.7), (x, -d / 2 + 0.37, 0.2 + 0.85), "go")
    for i in range(5):
        cyl(0.07, h, (-1.75 + i * 0.875, -d / 2 - 0.05, 0.2 + h / 2), "cot", verts=6)
    tiled_gable(w, d + 0.1, 0.2 + h, 0.9, over=0.2, rows=6)
    cyl(0.03, 4.5, (1.6, -d / 2 - 0.6, 2.25), "cot", verts=6)
    box((0.02, 0.6, 0.4), (1.6, -d / 2 - 0.92, 4.2), "co_do")
    export("truong-lang")


def uy_ban():
    """Trụ sở UBND xã / nhà văn hoá (thay toà cao tầng): hai tầng, mái ngói, sân cờ."""
    w, d = 3.8, 3.2
    fh = 2.5
    box((w, d, 0.25), (0, 0, 0.125), "nen")
    box((w, d - 0.6, fh * 2), (0, 0.3, 0.25 + fh), "voi_vang")
    for i in range(4):
        cyl(0.12, fh * 2, (-1.5 + i * 1.0, -d / 2 + 0.05, 0.25 + fh), "voi_trang", verts=8)
    box((w + 0.1, 0.7, 0.15), (0, -d / 2 + 0.3, 0.25 + fh), "voi_trang")
    for f in range(2):
        for i in range(3):
            box((0.55, 0.06, 1.1), (-1.0 + i, -d / 2 + 0.57, 0.25 + f * fh + 1.2), "kinh")
    box((1.6, 0.1, 0.4), (0, -d / 2 + 0.0, 0.25 + fh * 2 - 0.2), "co_do")
    tiled_gable(w, d - 0.4, 0.25 + fh * 2, 1.0, over=0.25, rows=6)
    export("uy-ban")


# ───────────────────────── Cây cối, rào quê ─────────────────────────


def cay_dua():
    """Cây dừa: thân cong nhẹ, chùm lá xoè."""
    segs = 5
    x = 0.0
    for i in range(segs):
        x += 0.06 * i
        cyl(0.13 - i * 0.012, 0.9, (x, 0, 0.45 + i * 0.88), "than_cay", verts=6)
    top = (x, 0, segs * 0.88 + 0.1)
    for k in range(7):
        a = k / 7 * math.tau
        box(
            (1.7, 0.32, 0.04),
            (top[0] + math.cos(a) * 0.8, top[1] + math.sin(a) * 0.8, top[2] - 0.25),
            "la",
            rot=(0, math.radians(22), a),
        )
    sphere(0.12, (top[0] + 0.12, 0.1, top[2] - 0.2), "than_cay")
    sphere(0.12, (top[0] - 0.1, -0.1, top[2] - 0.22), "than_cay")
    export("cay-dua")


def cay_chuoi():
    """Bụi chuối: vài thân ngắn, lá to bản."""
    for (dx, dy, hh) in [(0, 0, 1.6), (0.45, 0.2, 1.2), (-0.35, 0.3, 1.0)]:
        cyl(0.11, hh, (dx, dy, hh / 2), "chuoi", verts=6)
        for k in range(4):
            a = k / 4 * math.tau + dx
            box(
                (1.1, 0.4, 0.03),
                (dx + math.cos(a) * 0.5, dy + math.sin(a) * 0.5, hh + 0.05),
                "la",
                rot=(0, math.radians(-25), a),
            )
    export("cay-chuoi")


def bui_tre():
    """Bụi tre làng: nhiều cây mảnh, ngọn xoè."""
    import random

    rng = random.Random(7)
    for _ in range(9):
        dx, dy = rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5)
        h = rng.uniform(3.2, 4.6)
        tilt = rng.uniform(-0.12, 0.12)
        cyl(0.05, h, (dx, dy, h / 2), "tre", verts=5)
        bpy.context.active_object.rotation_euler = (tilt, rng.uniform(-0.1, 0.1), 0)
        sphere(0.55, (dx + tilt * h * 0.5, dy, h), "la_dam", scale=(1, 1, 0.6))
    export("bui-tre")


def hang_rao_tre():
    """Rào tre thấp 4 m (một cạnh ô): cọc + hai thanh ngang."""
    for i in range(9):
        box((0.06, 0.06, 0.9), (-1.9 + i * 0.475, 0, 0.45), "tre")
    for z in (0.35, 0.7):
        box((3.9, 0.04, 0.05), (0, 0, z), "go_sang")
    export("hang-rao-tre")


def lu_nuoc():
    """Lu nước trước hiên."""
    cyl(0.32, 0.65, (0, 0, 0.32), "lu", verts=10, r2=0.24)
    cyl(0.26, 0.04, (0, 0, 0.67), "go", verts=10)
    export("lu-nuoc")


def dong_rom():
    """Đống rơm sau nhà."""
    cyl(0.75, 1.0, (0, 0, 0.5), "tranh", verts=8, r2=0.55)
    cyl(0.55, 0.6, (0, 0, 1.3), "tranh", verts=8, r2=0.05)
    export("dong-rom")


def cot_dien():
    """Cột điện bê tông vuông thon kiểu Việt + xà ngang, sứ cách điện, hộp công tơ, mớ dây chùng (thay cột Kenney 416 tam
    giác — docs/ART.md bước 2: ~80 tam giác)."""
    cyl(0.13, 7.5, (0, 0, 3.75), "be_tong", verts=4, r2=0.08)
    box((1.6, 0.1, 0.1), (0, 0, 6.9), "be_tong")
    for x in (-0.7, -0.25, 0.25, 0.7):
        box((0.07, 0.07, 0.14), (x, 0, 7.02), "su")
    box((0.28, 0.16, 0.36), (0, -0.14, 2.6), "xam")
    # Mớ dây chùng đi hai phía (mặt phẳng mảnh).
    for z in (6.75, 6.55, 6.4):
        plate(0.03, 0.03, (0, -0.05, z), "day_dien")
        o = plate(2.2, 0.025, (0, 0, z), "day_dien")
        o.rotation_euler = (0, 0, 1.5708)
    o = plate(0.04, 2.2, (0.12, -0.1, 3.5), "day_dien")
    export("cot-dien")


def xe_hoi(color="co_do", name="xe-hoi-do"):
    """Xe hơi đậu ven đường kiểu hộp đơn giản (~150 tam giác, thay xe Kenney ~2.000 tam giác cho xe đậu)."""
    box((1.7, 3.8, 0.55), (0, 0, 0.55), color)
    box((1.5, 2.0, 0.55), (0, 0.15, 1.1), color)
    box((1.52, 1.6, 0.42), (0, 0.15, 1.1), "kinh")
    plate(1.3, 0.35, (0, -1.91, 0.65), "xam")  # lưới tản nhiệt
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(0.32, 0.22, (sx * 0.82, sy * 1.25, 0.32), "den", verts=8).rotation_euler = (0, 1.5708, 0)
    export(name)


def cay_atm():
    """Cây ATM vỉa hè (UC-I6): bệ đá, thân tủ xanh ngân hàng, băng vàng logo, màn hình lõm, bàn phím nghiêng,
    khe thẻ / khe tiền, mái che nhỏ + đèn LED, camera. Mặt máy quay -Y (= +Z trong three)."""
    box((1.0, 0.8, 0.12), (0, 0, 0.06), "da")
    # Thân tủ + hai vách hông nhô ra che màn hình (như cabin thật).
    box((0.84, 0.62, 1.62), (0, 0.04, 0.12 + 0.81), "atm_xanh")
    for sx in (-1, 1):
        box((0.08, 0.2, 1.3), (sx * 0.43, -0.32, 0.12 + 0.65 + 0.2), "atm_dam")
    # Băng vàng đầu máy (logo XÓM BANK vẽ bằng biển chữ trong game).
    box((0.86, 0.66, 0.2), (0, 0.04, 1.84), "vang")
    # Mái che.
    box((1.1, 0.95, 0.06), (0, -0.08, 2.0), "atm_dam")
    box((1.0, 0.04, 0.05), (0, -0.54, 1.95), "man_hinh")  # đèn LED viền mái
    # Màn hình lõm: khung tối + kính sáng.
    box((0.62, 0.06, 0.48), (0, -0.28, 1.36), "den")
    box((0.52, 0.04, 0.38), (0, -0.315, 1.37), "man_hinh")
    # Bàn phím nghiêng + phím màu (huỷ đỏ, đồng ý xanh lá).
    box((0.62, 0.3, 0.05), (0, -0.4, 1.0), "xam", rot=(math.radians(-25), 0, 0))
    box((0.08, 0.06, 0.03), (0.2, -0.44, 1.035), "co_do", rot=(math.radians(-25), 0, 0))
    box((0.08, 0.06, 0.03), (0.2, -0.36, 1.07), "la", rot=(math.radians(-25), 0, 0))
    # Khe thẻ (bên phải màn hình) + khe tiền (dưới bàn phím).
    box((0.1, 0.05, 0.03), (0.24, -0.33, 1.14), "den")
    box((0.4, 0.06, 0.05), (0, -0.31, 0.82), "den")
    box((0.16, 0.05, 0.1), (-0.22, -0.31, 0.84), "xam")  # khe biên lai
    # Camera nhỏ trên màn hình.
    sphere(0.035, (0, -0.31, 1.66), "den")
    export("cay-atm")


if __name__ == "__main__":
    reset()
    nha_tranh()
    nha_cap4("voi_vang", "nha-cap4")
    nha_cap4("voi_xanh", "nha-cap4-xanh")
    # nha-ong-1/2-lau, tiem-tap-hoa(-trang): dựng bằng kit nhà phố (art/blender/nha_pho.py).
    truong_lang()
    uy_ban()
    cay_dua()
    cay_chuoi()
    bui_tre()
    hang_rao_tre()
    lu_nuoc()
    dong_rom()
    cay_atm()
    cot_dien()
    for c, n in (("co_do", "xe-hoi-do"), ("atm_xanh", "xe-hoi-xanh"), ("voi_trang", "xe-hoi-trang")):
        xe_hoi(c, n)
