"""Kit nhà phố Việt chi tiết (docs/ART.md §5 bước 1 — low-poly chi tiết + AO nướng vào màu đỉnh).

Chạy: blender -b -P art/blender/nha_pho.py
Xuất: art/export/<tên>.glb — gom vào bundle "village" (packages/assets/bundles.json, `pnpm assets`).

Một hàm `nha_pho()` ghép module: tầng trệt (cửa cuốn / cửa sắt kéo / quán mở) + bảng hiệu + mái hiên tôn, các lầu (gờ sàn,
ban công lan can sắt, cửa kính khung, cửa sổ chớp, máy lạnh, chậu cây), mái (tôn dốc / ngói / sân thượng có bồn nước inox),
chi tiết hông (ống thoát nước, hộp công tơ). Tường vát cạnh. Sau khi gộp mesh, nướng AO (Cycles) vào màu đỉnh để góc khuất,
chân tường, dưới mái hiên tối đi — chân thật hơn mà vẫn một material, một draw call mỗi loại nhà.
Quy ước như nha_que.py: mét, gốc giữa đáy, mặt tiền quay về -Y Blender (= +Z glTF), vừa ô 4 m.
"""

import sys
from pathlib import Path

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nha_que as q  # noqa: E402 — dùng lại helper (hộp, mái, màu đỉnh, export)

q.PALETTE.update(
    {
        "son_kem": "#f3e2c0",
        "son_cam": "#f2b07a",
        "son_xanh_la": "#b9dba5",
        "son_lam": "#a9c8e8",
        "sat": "#3f4a45",  # sắt sơn xám xanh (lan can, cửa sắt kéo)
        "sat_xanh": "#2f6b5a",
        "cuon": "#b8bec4",  # cửa cuốn tôn
        "cuon_dam": "#9aa1a8",
        "trong": "#3a3330",  # bên trong tối (quán mở cửa)
        "inox": "#d9dde2",
        "may_lanh": "#f4f4f2",
        "bien_do": "#d8402f",
        "bien_vang": "#f2c14e",
        "bien_xanh": "#2c7a63",
        "chau": "#b5653d",
        "ong": "#8c9399",
    }
)

box, cyl, sphere, plate = q.box, q.cyl, q.sphere, q.plate


def beveled_body(w, d, h, z0, color):
    """Khối tường chính vát nhẹ các cạnh đứng (bớt cảm giác hộp)."""
    o = box((w, d, h), (0, 0, z0 + h / 2), color)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    vertical = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > h * 0.9]
    bmesh.ops.bevel(bm, geom=vertical, offset=0.06, segments=1, affect="EDGES")
    # Chia lưới mặt tường cho AO nội suy mượt (mặt to ít đỉnh thì AO thành vệt chéo theo tam giác).
    for zc in (z0 + 0.5, z0 + 1.5):
        bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, 1)
        )
    for xc in (0,):
        bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(xc, 0, 0), plane_no=(1, 0, 0)
        )
    bm.to_mesh(o.data)
    bm.free()
    return o


def roller_shutter(y, z0, w, h):
    """Cửa cuốn: các nan ngang xen hai sắc + hộp cuốn phía trên."""
    n = 9
    for i in range(n):
        plate(w, h / n, (0, y - 0.03, z0 + (i + 0.5) * h / n), "cuon" if i % 2 else "cuon_dam")
    box((w + 0.1, 0.22, 0.28), (0, y - 0.1, z0 + h + 0.14), "cuon_dam")


def folding_gate(y, z0, w, h):
    """Cửa sắt kéo xếp: song đứng + ray trên dưới, phía sau là tối (cửa hé mở)."""
    plate(w, h, (0, y - 0.02, z0 + h / 2), "trong")
    for i in range(13):
        x = -w / 2 + 0.05 + i * (w - 0.1) / 12
        plate(0.04, h, (x, y - 0.04, z0 + h / 2), "sat_xanh")
    for zz in (z0 + 0.05, z0 + h - 0.05, z0 + h / 2):
        plate(w, 0.05, (0, y - 0.05, zz), "sat_xanh")


def open_shop(y, z0, w, h):
    """Quán mở cửa: ô cửa tối (lòng quán) trên mặt tiền, kệ hàng thấp thoáng bên trong, quầy kính đặt ra trước."""
    plate(w, h, (0, y - 0.02, z0 + h / 2), "trong")
    for k in range(3):
        plate(w * 0.8, 0.05, (0, y - 0.04, z0 + 0.9 + k * 0.5), "go")
        for j in range(5):
            plate(0.12, 0.2, (-w * 0.35 + j * w * 0.17, y - 0.05, z0 + 1.03 + k * 0.5), "bien_vang" if (j + k) % 2 else "co_do")
    box((w * 0.55, 0.45, 0.85), (-w * 0.15, y - 0.3, z0 + 0.425), "go_sang")
    box((w * 0.55, 0.5, 0.05), (-w * 0.15, y - 0.3, z0 + 0.87), "inox")
    # Hai ghế nhựa đỏ trước quán.
    for sx in (-1, 1):
        box((0.32, 0.32, 0.32), (sx * 1.0 + 0.4, y - 0.6, z0 + 0.16), "co_do")


def balcony(y, z, w):
    """Ban công: sàn đua ra, lan can sắt song đứng + tay vịn."""
    box((w, 0.75, 0.12), (0, y - 0.37, z), "son_kem")
    n = 11
    for i in range(n):
        x = -w / 2 + 0.08 + i * (w - 0.16) / (n - 1)
        plate(0.03, 0.8, (x, y - 0.72, z + 0.46), "sat")
    plate(w, 0.05, (0, y - 0.73, z + 0.88), "sat")
    box((0.06, 0.7, 0.05), (-w / 2 + 0.03, y - 0.37, z + 0.88), "sat")
    box((0.06, 0.7, 0.05), (w / 2 - 0.03, y - 0.37, z + 0.88), "sat")


def glass_door(y, z, w=1.3, h=2.0):
    plate(w + 0.12, h + 0.1, (0, y - 0.02, z + h / 2), "go")
    plate(w, h, (0, y - 0.03, z + h / 2), "kinh")
    plate(0.05, h, (0, y - 0.04, z + h / 2), "go")


def shutter_window(x, y, z, w=0.7, h=1.0):
    """Cửa sổ có hai cánh chớp mở ra hai bên (nan ngang)."""
    plate(w, h, (x, y - 0.02, z), "kinh")
    for sx in (-1, 1):
        for k in range(5):
            plate(w / 2, h / 6, (x + sx * (w * 0.75), y - 0.03, z - h / 2 + (k + 0.6) * h / 5), "go_sang")


def ac_unit(x, y, z):
    box((0.7, 0.35, 0.5), (x, y - 0.2, z), "may_lanh")
    plate(0.3, 0.3, (x - 0.1, y - 0.38, z), "ong")
    box((0.04, 0.3, 0.04), (x - 0.3, y - 0.17, z - 0.27), "sat")
    box((0.04, 0.3, 0.04), (x + 0.3, y - 0.17, z - 0.27), "sat")


def plant_pot(x, y, z):
    cyl(0.14, 0.25, (x, y, z + 0.125), "chau", verts=8, r2=0.1)
    sphere(0.22, (x, y, z + 0.4), "la")


def water_tank(x, y, z):
    """Bồn nước inox nằm trên chân sắt (nóc nhà phố nào cũng có)."""
    for sx in (-1, 1):
        box((0.06, 0.6, 0.4), (x + sx * 0.4, y, z + 0.2), "sat")
    o = cyl(0.36, 1.2, (x, y, z + 0.75), "inox", verts=12)
    o.rotation_euler = (0, 1.5708, 0)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(rotation=True)


def nha_pho(name, floors=1, wall="son_kem", ground="cuon", roof="ton", sign="bien_do", w=3.4, d=3.4):
    gh, fh = 3.0, 2.8  # tầng trệt cao hơn các lầu
    y = -d / 2
    box((w + 0.25, d + 0.4, 0.15), (0, -0.1, 0.075), "nen")
    total = gh + fh * floors
    beveled_body(w, d, total, 0.15, wall)
    z0 = 0.15
    # Tầng trệt.
    door_w, door_h = w - 0.6, 2.4
    {"cuon": roller_shutter, "sat": folding_gate, "quan": open_shop}[ground](y, z0, door_w, door_h)
    # Bảng hiệu (chữ vẽ lúc chạy ở quầy người chơi; nhà NPC để trống màu) + khung. Nhà ở (sign=None) thì không có.
    if sign:
        box((w - 0.1, 0.12, 0.55), (0, y - 0.08, z0 + gh - 0.3), sign)
        plate(w, 0.06, (0, y - 0.15, z0 + gh - 0.02), "sat")
    # Mái hiên tôn đua ra vỉa hè.
    q.shed_roof(w, 0.95, z0 + gh - 1.0, z0 + gh - 0.8, y - 0.9, "ton")
    # Các lầu.
    for f in range(floors):
        z = z0 + gh + f * fh
        box((w + 0.12, 0.25, 0.14), (0, y - 0.04, z), "son_kem")  # gờ sàn
        balcony(y, z, w - 0.2)
        glass_door(y, z + 0.08)
        if w > 3.0:
            ac_unit(w / 2 - 0.45, y, z + 2.2)
        if f % 2 == 0:
            plant_pot(-w / 2 + 0.35, y - 0.4, z + 0.06)
    # Cửa sổ hông (nhìn xiên vẫn thấy) cho nhà nhiều lầu.
    for f in range(floors):
        z = z0 + gh + f * fh + 1.4
        o = box((0.06, 0.8, 1.0), (w / 2 + 0.02, 0.4, z), "kinh")
        o.select_set(False)
    top = z0 + total
    if roof == "ton":
        box((w + 0.08, d + 0.08, 0.3), (0, 0, top + 0.15), wall)  # tường chắn mái
        q.shed_roof(w, d * 0.9, top + 0.3, top + 0.9, y + 0.05, "ton", over=0.12)
    elif roof == "ngoi":
        q.tiled_gable(w, d, top, 1.0, over=0.25, rows=6)
    else:  # sân thượng: lan can xây + bồn nước + chòi cầu thang mái tôn
        for sx in (-1, 1):
            box((0.12, d, 0.7), (sx * (w / 2 - 0.06), 0, top + 0.35), wall)
        box((w, 0.12, 0.7), (0, y + 0.06, top + 0.35), wall)
        box((w, 0.12, 0.7), (0, -y - 0.06, top + 0.35), wall)
        box((1.3, 1.2, 1.9), (-w / 2 + 0.8, d / 2 - 0.75, top + 0.95), wall)
        q.shed_roof(1.3, 1.2, top + 1.95, top + 2.1, d / 2 - 1.35, "ton", over=0.1)
        water_tank(w / 2 - 0.9, d / 2 - 0.8, top)
    # Hông: ống thoát nước + hộp công tơ điện.
    cyl(0.05, total, (-w / 2 + 0.05, y + 0.05, z0 + total / 2), "ong", verts=6)
    box((0.3, 0.12, 0.4), (-w / 2 + 0.35, y - 0.06, z0 + 2.0), "xam")
    q.export(name)


if __name__ == "__main__":
    q.reset()
    # Nhà phố cho dãy phố chính (content.housing.shops).
    nha_pho("nha-pho-a", floors=1, wall="son_kem", ground="cuon", roof="ton", sign="bien_do")
    nha_pho("nha-pho-b", floors=2, wall="son_xanh_la", ground="sat", roof="san", sign="bien_vang")
    nha_pho("nha-pho-c", floors=1, wall="son_cam", ground="quan", roof="ngoi", sign="bien_xanh")
    nha_pho("nha-pho-d", floors=2, wall="son_lam", ground="cuon", roof="san", sign="bien_do")
    # Nhà xây trên ô đất của người chơi (content.buildings, docs/BANDO.md bước E).
    nha_pho("tiem-1-tang", floors=0, wall="son_kem", ground="quan", roof="ngoi", sign="bien_vang")
    nha_pho("nha-2-tang", floors=1, wall="son_xanh_la", ground="quan", roof="san", sign="bien_do")
    # Nhà dân theo cấp (content.housing — nhà ống 1/2 lầu) và tạp hoá xóm quê: cùng kit, giữ tên model cũ.
    nha_pho("nha-ong-1-lau", floors=1, wall="voi_xanh", ground="sat", roof="ngoi", sign=None, w=3.2)
    nha_pho("nha-ong-2-lau", floors=2, wall="voi_vang", ground="sat", roof="san", sign=None, w=3.2)
    nha_pho("tiem-tap-hoa", floors=0, wall="voi_hong", ground="quan", roof="ton", sign="bien_xanh")
    nha_pho("tiem-tap-hoa-trang", floors=0, wall="voi_trang", ground="quan", roof="ngoi", sign="bien_do")
