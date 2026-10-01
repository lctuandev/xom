# Ảnh chân dung nhân vật cho khung "đứng trước quầy" (UC-E5): render đầu + vai của model Kenney Mini Characters.
# GLB trong public đã nén meshopt (Blender 4.0 không đọc được) → giải nén trước bằng gltf-transform:
#   (cd packages/assets && node -e '...NodeIO + MeshoptDecoder, bỏ EXT_meshopt_compression...')
# Chạy: blender -b -P art/blender/chan_dung.py -- <model.glb> <out.png> [góc_xoay_độ]
# Rồi thu nhỏ 160px WebP vào apps/web/public/portraits/<model>.webp (sharp).
import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index("--")+1:]
src, out = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type=='ARMATURE')
for o in sc.objects:
    if o.name.startswith("Icosphere"): o.hide_render = True
idle = next(a for a in bpy.data.actions if a.name.startswith("idle"))
arm.animation_data_create(); arm.animation_data.action = idle
sc.frame_set(1)
dg = bpy.context.evaluated_depsgraph_get()
pts=[]
for o in sc.objects:
    if o.type=='MESH' and not o.hide_render:
        e=o.evaluated_get(dg)
        pts += [e.matrix_world @ v.co for v in e.data.vertices]
zmax=max(p.z for p in pts); zmin=min(p.z for p in pts)
h=zmax-zmin
cx=sum(p.x for p in pts)/len(pts)
# khung: từ đỉnh đầu xuống ~ngực (60% chiều cao từ trên)
top=zmax+0.1*h; bot=zmax-0.78*h
cam_d=bpy.data.cameras.new("c"); cam_d.type='ORTHO'; cam_d.ortho_scale=(top-bot)
cam=bpy.data.objects.new("c",cam_d); sc.collection.objects.link(cam)
yaw=math.radians(float(argv[2]) if len(argv)>2 else 20)
dist=5
cz=(top+bot)/2
cam.location=Vector((cx+dist*math.sin(yaw), -dist*math.cos(yaw), cz))
cam.rotation_euler=(math.radians(90),0,yaw)
sc.camera=cam
for name,rot,en in [("key",(50,0,30),3.0),("fill",(60,0,-60),1.2),("rim",(120,0,180),2.0)]:
    l=bpy.data.lights.new(name,'SUN'); l.energy=en
    lo=bpy.data.objects.new(name,l); lo.rotation_euler=tuple(math.radians(a) for a in rot); sc.collection.objects.link(lo)
w=bpy.data.worlds.new("w"); w.use_nodes=True; w.node_tree.nodes["Background"].inputs[0].default_value=(1,1,1,1); w.node_tree.nodes["Background"].inputs[1].default_value=0.6
sc.world=w
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=48; sc.cycles.use_denoising=False
sc.render.film_transparent=True
sc.render.resolution_x=sc.render.resolution_y=256
sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'
sc.view_settings.view_transform='Standard'
sc.render.filepath=out
bpy.ops.render.render(write_still=True)
