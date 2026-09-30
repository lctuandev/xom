import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  baseSpec,
  type Dish,
  dishCost,
  extrasPrice,
  generateOrder,
  hasIngredients,
  ingredientsFor,
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
