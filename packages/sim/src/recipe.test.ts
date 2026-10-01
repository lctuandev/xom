import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  baseSpec,
  customOrder,
  type Dish,
  dishCost,
  extrasPrice,
  generateOrder,
  hasIngredients,
  ingredientsFor,
  inspectPart,
  marketPackPrice,
  pickPayment,
  scoreDish,
  settleCash,
  validateBuild,
} from "./recipe.js";
import { seededRandom } from "./time.js";

const banhMi = content.product("banh_mi").recipe;
const traSua = content.product("tra_sua").recipe;
const menu = banhMi.variants.map((v) => ({ variantId: v.id, price: v.refPrice }));

describe("món chuẩn", () => {
  it("bánh mì thịt: đủ các bước, nhân thịt nguội, rau mặc định", () => {
    const spec = baseSpec(banhMi, "banh_mi_thit");
    expect(spec.nhan).toBe("thit_nguoi");
    expect(spec.rau).toEqual(["dua_leo", "do_chua", "hanh", "ngo"]);
    expect(spec.xe).toBe(true);
    expect(spec.goi).toBe(true);
  });
  it("giá vốn bánh mì thịt khoảng 8 nghìn", () => {
    const cost = dishCost(content, banhMi, baseSpec(banhMi, "banh_mi_thit"));
    expect(cost).toBeGreaterThan(7_000);
    expect(cost).toBeLessThan(9_500);
  });
});

describe("khách gọi món", () => {
  it("tất định theo seed, có câu nói và giá", () => {
    const a = generateOrder(banhMi, menu, seededRandom("o", 1));
    const b = generateOrder(banhMi, menu, seededRandom("o", 1));
    expect(a).toEqual(b);
    expect(a?.ask).toMatch(/^Cho con ổ bánh mì/);
  });
  it("yêu cầu 'không hành' thật sự bỏ hành khỏi đơn", () => {
    for (let i = 0; i < 300; i++) {
      const o = generateOrder(banhMi, menu, seededRandom("o", i));
      if (!o) continue;
      if (o.dish.includes("không hành")) expect(o.spec.rau).not.toContain("hanh");
      if (o.dish.includes("nhiều ớt")) expect(o.spec.ot).toBe("ot_nhieu");
      expect(o.dish.includes("nhiều ớt") && o.dish.includes("không ớt")).toBe(false);
    }
  });
  it("chỉ gọi món có trong thực đơn đang bán", () => {
    for (let i = 0; i < 50; i++) {
      const o = generateOrder(
        banhMi,
        [{ variantId: "banh_mi_trung", price: 14_000 }],
        seededRandom("m", i),
      );
      expect(o?.variantId).toBe("banh_mi_trung");
    }
    expect(generateOrder(banhMi, [], seededRandom("x"))).toBeNull();
  });
  it("khách không xin thêm thứ quầy không có", () => {
    const stock = new Map([["bo", 0]]);
    for (let i = 0; i < 300; i++) {
      const o = generateOrder(banhMi, menu, seededRandom("s", i), stock);
      expect(o?.dish).not.toContain("thêm bơ");
      expect(o?.spec.phet).not.toContain("bo");
    }
  });
  it("trà sữa size L và topping thêm được tính thêm tiền", () => {
    const spec: Dish = {
      ...baseSpec(traSua, "tra_sua_truyen_thong"),
      ly: "ly_l",
      topping: ["tc_den", "pudding"],
    };
    expect(extrasPrice(traSua, spec, "tra_sua_truyen_thong")).toBe(10_000);
  });
});

describe("chấm món", () => {
  const spec: Dish = { ...baseSpec(banhMi, "banh_mi_xiu_mai"), rau: ["dua_leo", "do_chua", "ngo"] };
  it("làm đúng thì 100%", () => {
    expect(scoreDish(banhMi, spec, { ...spec, rau: ["ngo", "do_chua", "dua_leo"] })).toEqual({
      score: 1,
      mistakes: [],
    });
  });
  it("quên bỏ hành là sai bước rau; sai nhân bị trừ nặng hơn", () => {
    const rau = scoreDish(banhMi, spec, { ...spec, rau: ["dua_leo", "do_chua", "hanh", "ngo"] });
    const nhan = scoreDish(banhMi, spec, { ...spec, nhan: "thit_nguoi" });
    expect(rau.mistakes).toEqual(["rau"]);
    expect(nhan.score).toBeLessThan(rau.score);
  });
  it("chưa làm bước action (chưa gói) là sai", () => {
    const { goi: _, ...rest } = spec;
    expect(scoreDish(banhMi, spec, rest).mistakes).toContain("goi");
  });
  it("món có lựa chọn không tồn tại bị từ chối", () => {
    expect(validateBuild(banhMi, { nhan: "thit_bo" })).toMatch(/không có/);
    expect(validateBuild(banhMi, { rau: "hanh" })).toMatch(/danh sách/);
    expect(validateBuild(banhMi, spec)).toBeNull();
  });
});

describe("nguyên liệu tiêu hao", () => {
  it("tính đúng theo thứ đã cho vào món", () => {
    const need = ingredientsFor(banhMi, { ...baseSpec(banhMi, "banh_mi_trung"), ot: "ot_nhieu" });
    expect(need.get("banh_mi_phoi")).toBe(1);
    expect(need.get("trung")).toBe(1);
    expect(need.get("ot")).toBe(2);
    expect(need.get("giay_goi")).toBe(1);
    expect(hasIngredients(need, new Map([["banh_mi_phoi", 1]]))).toContain("trung");
  });
});

describe("chợ", () => {
  const eco = content.economy;
  it("hàng tươi buổi chiều đắt hơn, hàng khô thì không", () => {
    const phoi = content.ingredient("banh_mi_phoi");
    const sot = content.ingredient("sot");
    expect(marketPackPrice(phoi, 3, 13 * 60, eco)).toBeGreaterThan(
      marketPackPrice(phoi, 3, 8 * 60, eco),
    );
    expect(marketPackPrice(sot, 3, 13 * 60, eco)).toBe(marketPackPrice(sot, 3, 8 * 60, eco));
  });
});

describe("tính tiền, thối tiền", () => {
  it("khách đưa tờ tiền đủ trả", () => {
    for (let i = 0; i < 100; i++) {
      const p = pickPayment(18_000, 0.3, seededRandom("pay", i));
      if (p.kind === "cash") expect(p.bill).toBeGreaterThanOrEqual(18_000);
    }
  });
  it("thối đúng / thiếu / dư", () => {
    const r = () => 0.9; // khách không thật thà
    expect(settleCash(18_000, 50_000, 32_000, r)).toEqual({ received: 18_000, outcome: "exact" });
    expect(settleCash(18_000, 50_000, 30_000, r)).toEqual({ received: 18_000, outcome: "short" });
    expect(settleCash(18_000, 50_000, 35_000, r)).toEqual({
      received: 15_000,
      outcome: "over_kept",
    });
    expect(settleCash(18_000, 50_000, 35_000, () => 0.1)).toEqual({
      received: 18_000,
      outcome: "over_returned",
    });
  });
});

describe("người chơi tự gọi món (UC-J3)", () => {
  it("chọn món + yêu cầu riêng → đơn đúng như lời gọi, giá theo thực đơn của quầy", () => {
    const o = customOrder(
      banhMi,
      [{ variantId: "banh_mi_thit", price: 18_000 }],
      "banh_mi_thit",
      {},
      ["khong_hanh", "ot_nhieu"],
    );
    if (typeof o === "string") throw new Error(o);
    expect(o.spec.rau).not.toContain("hanh");
    expect(o.spec.ot).toBe("ot_nhieu");
    expect(o.dish).toBe("bánh mì thịt, không hành, nhiều ớt");
    expect(o.price).toBe(18_000);
  });
  it("yêu cầu trái nhau trên cùng bước: chỉ lấy cái đầu", () => {
    const o = customOrder(banhMi, menu, "banh_mi_thit", {}, ["ot_nhieu", "ot_khong"]);
    if (typeof o === "string") throw new Error(o);
    expect(o.spec.ot).toBe("ot_nhieu");
    expect(o.dish).not.toContain("không ớt");
  });
  it("trà sữa: tự chọn size L tính thêm tiền", () => {
    const tsMenu = traSua.variants.map((v) => ({ variantId: v.id, price: v.refPrice }));
    const first = traSua.variants[0];
    const size = traSua.steps.find((st) => st.pick && Object.keys(st.pick).length > 1);
    if (!first || !size?.pick) throw new Error("thiếu dữ liệu");
    const big = size.options.find((op) => (op.extraPrice ?? 0) > 0 && op.id in (size.pick ?? {}));
    if (!big) throw new Error("không có lựa chọn tính thêm tiền");
    const o = customOrder(traSua, tsMenu, first.id, { [size.id]: big.id }, []);
    if (typeof o === "string") throw new Error(o);
    expect(o.price).toBe(first.refPrice + (big.extraPrice ?? 0));
  });
  it("món không có trên thực đơn, lựa chọn bịa → báo lỗi", () => {
    expect(customOrder(banhMi, [], "banh_mi_thit", {}, [])).toBeTypeOf("string");
    expect(customOrder(banhMi, menu, "banh_mi_thit", { nhan: "bo" }, [])).toBeTypeOf("string");
    expect(customOrder(banhMi, menu, "banh_mi_thit", {}, ["bay_ba"])).toBeTypeOf("string");
  });
});

describe("sửa xe (SERVICE, UC-G2…G4)", () => {
  const repair = content.product("sua_xe").recipe;
  const menu = repair.variants.map((v) => ({ variantId: v.id, price: v.refPrice }));

  it("khách chỉ kể triệu chứng, không nói tên bệnh", () => {
    for (let i = 0; i < 30; i++) {
      const order = generateOrder(repair, menu, seededRandom("sx", i));
      expect(order).not.toBeNull();
      if (!order) continue;
      const variant = repair.variants.find((v) => v.id === order.variantId);
      expect(variant?.symptoms).toContain(order.dish);
      expect(order.ask).not.toContain(variant?.name ?? "");
    }
  });

  it("hai bệnh cùng triệu chứng (xẹp bánh) — phải kiểm tra mới biết vá hay thay ruột", () => {
    const vaRuot = repair.variants.find((v) => v.id === "lop_dinh");
    const thayRuot = repair.variants.find((v) => v.id === "ruot_nat");
    const shared = vaRuot?.symptoms?.filter((x) => thayRuot?.symptoms?.includes(x)) ?? [];
    expect(shared.length).toBeGreaterThan(0);
    expect(inspectPart(content, "sua_xe", "lop_dinh", "lop_sau")).toMatch(/vá được/);
    expect(inspectPart(content, "sua_xe", "ruot_nat", "lop_sau")).toMatch(/thay ruột/);
  });

  it("bộ phận không có bệnh thì bình thường; sản phẩm không có chẩn đoán trả null", () => {
    expect(inspectPart(content, "sua_xe", "bugi_hong", "den")).toBe(
      content.product("sua_xe").diagnosis?.ok,
    );
    expect(inspectPart(content, "sua_xe", "bugi_hong", "khong_co")).toBeNull();
    expect(inspectPart(content, "banh_mi", "thit", "bugi")).toBeNull();
  });

  it("sửa sai bệnh bị chấm sai; sửa đúng thì đủ điểm và tốn đúng phụ tùng", () => {
    const spec = baseSpec(repair, "bugi_hong");
    const wrong: Dish = { ...spec, sua: "va_ruot" };
    expect(scoreDish(repair, spec, wrong).mistakes).toContain("sua");
    expect(scoreDish(repair, spec, spec).score).toBe(1);
    expect(ingredientsFor(repair, spec).get("bugi")).toBe(1);
    expect(ingredientsFor(repair, baseSpec(repair, "non_hoi")).size).toBe(0);
  });
});
