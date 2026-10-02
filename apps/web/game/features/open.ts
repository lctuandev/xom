import { content } from "@xom/content";
import { getPlayer } from "../scene/player";
import { useGame } from "../store";
import { nearestAtm } from "../world";
import { type FeatureId, featureMeta } from "./registry";

/**
 * Mở một chức năng theo id (Menu ☰, icon neo, nút "›", thông báo). Chức năng phải dùng tại chỗ (chợ, vựa xe, ATM, công
 * trường): đang đứng đó thì mở ngay, chưa thì tự đi tới rồi mở khi tới nơi (luật server: phải đứng gần mới mua/bán).
 * `from: "sheet"` (nút "›", ô trong Menu): nhớ sheet đang mở để có nút ‹ Quay lại.
 */
export function openFeature(id: FeatureId, opts: { from?: "sheet" } = {}) {
  const st0 = useGame.getState();
  const st =
    opts.from === "sheet"
      ? { ...st0, openSheet: (s: typeof st0.sheet) => (s ? st0.pushSheet(s) : st0.openSheet(null)) }
      : st0;
  const meta = featureMeta(id);
  if (meta.place) {
    if (st.nearPlace === meta.place) return st.openSheet(id);
    st.openSheet(null);
    st.setGoal({ kind: "place", id: meta.place, open: id });
    st.toast({ kind: "info", text: `🚶 Đang đi tới ${meta.title}…` });
    return;
  }
  if (id === "atm") {
    if (st.nearAtm) return st.openSheet("atm");
    const p = getPlayer().position;
    const atm = nearestAtm(p.x, p.z);
    st.openSheet(null);
    if (atm) st.setGoal({ kind: "atm", id: atm.id, open: "atm" });
    return;
  }
  if (id === "ride") {
    // Đã thuê xe hôm nay: đứng đâu cũng chạy được; chưa thì ra trạm thuê xe.
    const station = content.data.rides.stationPlaceId;
    if (st.ride?.bikeToday || st.nearPlace === station) return st.openSheet("ride");
    st.openSheet(null);
    st.setGoal({ kind: "place", id: station, open: "ride" });
    st.toast({ kind: "info", text: "🚶 Đang ra trạm xe ôm…" });
    return;
  }
  if (id === "site") {
    const site = st.world.sites?.[0];
    if (st.nearSite || !site) return st.openSheet("site");
    st.openSheet(null);
    st.setGoal({ kind: "point", x: site.x, z: site.z + 1.2, open: "site" });
    return;
  }
  st.openSheet(id);
}
