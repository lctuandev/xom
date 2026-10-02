// Danh mục chức năng (docs/IA.md §4): MỖI chức năng một sheet riêng, một file riêng, một icon riêng. Menu ☰, icon neo,
// nút ngữ cảnh, thông báo "Xem ›" đều mở chức năng qua id ở đây — thêm chức năng = thêm một dòng + một file sheet
// (features/sheets.tsx), không nhồi thêm tab vào sheet khác.

export type FeatureGroup = "shop" | "trade" | "work" | "xom" | "me";

export const GROUPS: { id: FeatureGroup; name: string; emoji: string }[] = [
  { id: "shop", name: "Cửa hàng", emoji: "🏪" },
  { id: "trade", name: "Mua bán", emoji: "🧺" },
  { id: "work", name: "Việc làm", emoji: "💼" },
  { id: "xom", name: "Xóm", emoji: "🏘️" },
  { id: "me", name: "Tôi", emoji: "🙂" },
];

export interface FeatureMeta {
  title: string;
  /** Icon trong Menu ☰ / cột neo. */
  icon: string;
  group: FeatureGroup;
  /** Một dòng mô tả dưới icon trong Menu. */
  hint: string;
  /** Không hiện trong Menu (chỉ mở tại chỗ: quầy hàng xóm, sạp, nói chuyện…). */
  hidden?: boolean;
  /** Phải tới tận nơi (id địa điểm) mới dùng được: từ Menu thì tự đi tới rồi mở. */
  place?: string;
}

export const FEATURES = {
  // 🏪 Cửa hàng của tôi
  shops: {
    title: "Các cửa hàng",
    icon: "🏬",
    group: "shop",
    hint: "Mọi cửa hàng của mình, chọn cửa hàng để quản lý",
  },
  stall: {
    title: "Quầy của tôi",
    icon: "🏪",
    group: "shop",
    hint: "Mở/đóng quầy, hôm nay bán được bao nhiêu",
  },
  dishes: { title: "Thực đơn & giá", icon: "🍽️", group: "shop", hint: "Bật/tắt món, chỉnh giá" },
  stock: {
    title: "Kho hàng",
    icon: "📦",
    group: "shop",
    hint: "Còn bao nhiêu nguyên liệu, làm được mấy phần",
  },
  lot: { title: "Chỗ bán", icon: "📍", group: "shop", hint: "Chọn chỗ đẩy xe ra bán" },
  lease: {
    title: "Thuê nhà & giấy tờ",
    icon: "🏠",
    group: "shop",
    hint: "Mở tiệm trong nhà mặt tiền, tiền nhà",
  },
  staff: { title: "Nhân viên", icon: "👩‍🍳", group: "shop", hint: "Thuê người bán thay theo ca" },
  books: { title: "Sổ sách", icon: "📊", group: "shop", hint: "Doanh thu, lãi 7 ngày" },
  regulars: { title: "Khách quen", icon: "❤️", group: "shop", hint: "Ai hay ghé quầy mình" },
  reviews: { title: "Đánh giá", icon: "📒", group: "shop", hint: "Khách chấm sao, mình trả lời" },
  promo: {
    title: "Khai trương",
    icon: "🎉",
    group: "shop",
    hint: "Tổ chức khai trương cho đông khách",
  },
  recipes: { title: "Công thức", icon: "📖", group: "shop", hint: "Mỗi món làm thế nào" },
  equipment: {
    title: "Vựa xe Ông Sáu",
    icon: "🛒",
    group: "shop",
    hint: "Mua xe hàng, đổi nghề, sửa xe",
    place: "vua_xe",
  },
  // 🧺 Mua bán
  market: {
    title: "Chợ đầu mối",
    icon: "🧺",
    group: "trade",
    hint: "Nhập nguyên liệu",
    place: "cho_dau_moi",
  },
  liquidate: {
    title: "Thanh lý hàng tồn",
    icon: "♻️",
    group: "trade",
    hint: "Bán lại hàng không dùng nữa",
    place: "cho_dau_moi",
  },
  food: { title: "Ăn uống", icon: "🍜", group: "trade", hint: "Quán ăn quanh xóm" },
  atm: { title: "Cây ATM", icon: "🏧", group: "trade", hint: "Rút / gửi tiền" },
  vendor: { title: "Sạp ăn", icon: "🍲", group: "trade", hint: "Mua ăn ở sạp", hidden: true },
  shop: {
    title: "Quầy hàng xóm",
    icon: "🛒",
    group: "trade",
    hint: "Gọi món ở quầy người khác",
    hidden: true,
  },
  // 💼 Việc làm
  jobs: { title: "Làm thuê", icon: "💼", group: "work", hint: "Quán cơm, bưu cục… lương theo giờ" },
  contracts: {
    title: "Việc xóm",
    icon: "📋",
    group: "work",
    hint: "Làm hàng giao tận nơi trước hạn",
  },
  gigs: { title: "Thuê nhau", icon: "📸", group: "work", hint: "Người chơi thuê nhau làm việc" },
  ride: { title: "Xe ôm", icon: "🛵", group: "work", hint: "Thuê xe, chở khách" },
  site: { title: "Phụ hồ", icon: "🏗️", group: "work", hint: "Trộn vữa cho công trình xóm" },
  // 🏘️ Xóm
  neighbors: {
    title: "Hàng xóm",
    icon: "👥",
    group: "xom",
    hint: "Ai đang online, mời bạn, vào xóm khác",
  },
  today: { title: "Hôm nay", icon: "📅", group: "xom", hint: "Thứ mấy, xóm có sự kiện gì" },
  board: { title: "Bảng xóm", icon: "🏆", group: "xom", hint: "Giải tuần, thị phần, đang hot" },
  fund: {
    title: "Quỹ & công trình",
    icon: "💰",
    group: "xom",
    hint: "Góp quỹ, bỏ phiếu xây chung",
  },
  talk: {
    title: "Nói chuyện",
    icon: "💬",
    group: "xom",
    hint: "Hỏi chuyện chủ quán",
    hidden: true,
  },
  // 🙂 Tôi
  profile: { title: "Hồ sơ", icon: "🙂", group: "me", hint: "Cấp, danh tiếng, tin cậy, no/khát" },
  wallet: {
    title: "Ví tiền",
    icon: "👛",
    group: "me",
    hint: "💵 tiền mặt, 🏦 ngân hàng, hôm nay thu gì",
  },
  story: { title: "Chuyện của tôi", icon: "📜", group: "me", hint: "Các mốc đời mình ở xóm" },
  skills: { title: "Kỹ năng", icon: "📈", group: "me", hint: "Kỹ năng, mở khoá theo cấp" },
  badges: { title: "Thành tựu", icon: "🏅", group: "me", hint: "Huy hiệu đã đạt" },
  friends: { title: "Người quen", icon: "🫶", group: "me", hint: "Thân với ai trong xóm" },
  quests: { title: "Nhiệm vụ", icon: "🎯", group: "me", hint: "Việc tiếp theo, mục tiêu hôm nay" },
  settings: { title: "Cài đặt", icon: "⚙️", group: "me", hint: "Âm thanh, hiệu năng, đăng xuất" },
} as const satisfies Record<string, FeatureMeta>;

export type FeatureId = keyof typeof FEATURES;

export const featureMeta = (id: FeatureId): FeatureMeta => FEATURES[id];

/** Icon neo mặc định hai bên màn hình (người chơi tự ghim lại trong Menu, mỗi bên tối đa 4). */
export const DEFAULT_PINS: { left: FeatureId[]; right: FeatureId[] } = {
  left: ["food", "market", "stall", "jobs"],
  right: ["quests", "neighbors"],
};
export const MAX_PINS = 4;

/** Id cũ (sheet:tab trước khi tách, vd. thông báo "jobs:gigs") → id chức năng mới. */
export function featureFromLink(link: string): FeatureId | "menu" | null {
  const [sheet, tab] = link.split(":");
  const legacy: Record<string, FeatureId> = { business: "stall", xom: "neighbors" };
  const id = (tab && tab in FEATURES ? tab : sheet && (legacy[sheet] ?? sheet)) ?? "";
  if (id === "menu") return "menu";
  return id in FEATURES ? (id as FeatureId) : null;
}
