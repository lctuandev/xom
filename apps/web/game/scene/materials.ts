import {
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
} from "three";

const cache = new WeakMap<Material, MeshLambertMaterial>();

/**
 * Đổi MeshStandardMaterial (PBR) của Kenney sang MeshLambertMaterial: rẻ hơn nhiều trên GPU mobile,
 * với texture palette màu phẳng thì nhìn gần như không khác.
 */
export function toLambert(root: Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const convert = (m: Material) => {
      if (!(m instanceof MeshStandardMaterial)) return m;
      let lambert = cache.get(m);
      if (!lambert) {
        lambert = new MeshLambertMaterial({ map: m.map, color: m.color, side: m.side });
        cache.set(m, lambert);
      }
      return lambert;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(convert) : convert(obj.material);
  });
}
