// Pipeline asset: model nguồn (art/vendor, art/export) → GLB tối ưu trong apps/web/public/assets/models.
// - "bundle": gom nhiều model tĩnh vào 1 GLB (1 lần tải, dùng chung texture palette); mỗi model là 1 node gốc đặt tên theo file.
// - "single": giữ riêng từng file (nhân vật có skeleton + animation).
// Scale được bake vào node gốc để runtime dùng đơn vị mét (docs/PLAN.md §5.1).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, getBounds, NodeIO, TextureInfo } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  join as joinPrimitives,
  mergeDocuments,
  meshopt,
  prune,
  resample,
  unpartition,
  weld,
} from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = join(root, "apps/web/public/assets/models");
const config = JSON.parse(await readFile(join(root, "packages/assets/bundles.json"), "utf8"));
// `pnpm assets village` → chỉ build bundle/nhóm có tên này (giữ nguyên phần còn lại của manifest) — dùng khi máy
// không có art/vendor (Kenney) mà chỉ đổi model tự dựng trong art/export.
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const wanted = (name) => only.length === 0 || only.includes(name);

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

async function loadModel(src, name, scale, center = false, merge = false) {
  const doc = await io.read(join(root, src.dir, `${name}.glb`));
  // Model tĩnh: gộp các mảnh cùng material của RIÊNG model này thành một (xe Kenney = thân + 4 bánh → 1) — mỗi mảnh là một
  // draw call cho mỗi loại model (docs/PLAN.md §1: < 100 draw call). Làm trước khi bọc node tên nên không lẫn model khác.
  if (merge) await doc.transform(flatten(), joinPrimitives({ keepNamed: false }));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  // Bộ nội thất Kenney có gốc toạ độ ở góc: đưa về giữa đáy để đặt vào cảnh cho dễ.
  const offset = [0, 0, 0];
  if (center) {
    const { min, max } = getBounds(scene);
    offset[0] = -(min[0] + max[0]) / 2;
    offset[1] = -min[1];
    offset[2] = -(min[2] + max[2]) / 2;
  }
  const roots = scene.listChildren();
  // Bọc toàn bộ model trong 1 node gốc mang tên file để runtime tra theo tên.
  const wrapper = doc.createNode(name).setScale([scale, scale, scale]);
  const inner = doc.createNode(`${name}-offset`).setTranslation(offset);
  wrapper.addChild(inner);
  for (const child of roots) {
    scene.removeChild(child);
    inner.addChild(child);
  }
  scene.addChild(wrapper);
  return doc;
}

/** Bỏ attribute không dùng (Kenney xuất kèm TANGENT/TEXCOORD_1 dù không có normal map). */
function stripUnused(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat?.getNormalTexture()) prim.setAttribute("TANGENT", null);
      prim.setAttribute("TEXCOORD_1", null);
    }
  }
  // Texture palette: lọc NEAREST để các ô màu không bị hòa vào nhau khi nhìn xa.
  for (const mat of doc.getRoot().listMaterials()) {
    const info = mat.getBaseColorTextureInfo();
    if (info) {
      info.setMinFilter(TextureInfo.MinFilter.NEAREST).setMagFilter(TextureInfo.MagFilter.NEAREST);
    }
  }
}

async function optimize(doc, { animated }) {
  stripUnused(doc);
  await doc.transform(
    unpartition(),
    dedup(),
    ...(animated ? [resample()] : []),
    weld(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
}

async function write(doc, file) {
  const path = join(outDir, file);
  await mkdir(dirname(path), { recursive: true });
  const glb = await io.writeBinary(doc);
  await writeFile(path, glb);
  return glb.byteLength;
}

const manifestPath = join(outDir, "manifest.json");
const manifest = only.length
  ? JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"))
  : {};

for (const [bundleName, bundle] of Object.entries(config.bundles)) {
  if (!wanted(bundleName)) continue;
  const target = new Document();
  const targetScene = target.createScene(bundleName);
  target.getRoot().setDefaultScene(targetScene);
  const names = [];
  for (const src of bundle.sources) {
    for (const name of src.models) {
      const doc = await loadModel(src, name, src.scale, src.center, true);
      const map = mergeDocuments(target, doc);
      for (const scene of doc.getRoot().listScenes()) {
        const merged = map.get(scene);
        for (const child of merged.listChildren()) targetScene.addChild(child);
        merged.dispose();
      }
      names.push(name);
    }
  }
  await optimize(target, { animated: false });
  const bytes = await write(target, `${bundleName}.glb`);
  manifest[bundleName] = { type: "bundle", url: `/assets/models/${bundleName}.glb`, models: names };
  console.log(`bundle ${bundleName}: ${names.length} model, ${(bytes / 1024).toFixed(1)} KB`);
}

for (const [groupName, group] of Object.entries(config.singles)) {
  if (!wanted(groupName)) continue;
  const files = {};
  for (const name of group.models) {
    const doc = await loadModel(group, name, group.scale);
    await optimize(doc, { animated: true });
    const bytes = await write(doc, `${groupName}/${name}.glb`);
    files[name] = `/assets/models/${groupName}/${name}.glb`;
    console.log(`single ${groupName}/${name}: ${(bytes / 1024).toFixed(1)} KB`);
  }
  manifest[groupName] = { type: "single", files };
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("manifest.json đã cập nhật");
