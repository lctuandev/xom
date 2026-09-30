"use client";

import { type Condition, content } from "@xom/content";
import { useEffect } from "react";
import { send } from "./net/socket";
import { useGame } from "./store";

type State = ReturnType<typeof useGame.getState>;

/** Điều kiện hoàn thành bước kịch bản, đánh giá theo trạng thái game hiện tại. */
export function conditionMet(cond: Condition, s: State): boolean {
  const me = s.me;
  const biz = me?.business;
  switch (cond) {
    case "has_business":
      return !!biz;
    case "has_stock":
      return !!me?.inventory.some((i) => i.qty > 0 && (!biz || i.productId === biz.productId));
    case "has_lot":
      return !!biz?.lotId;
    case "shop_open":
      return !!biz?.open;
    case "served_3":
      return s.servedCount >= 3;
    case "has_job":
      return !!me?.jobId;
    case "job_tasks_2":
      return s.jobTasksDone >= 2;
  }
}

/**
 * Điều phối kịch bản người mới: bước mới có lời thoại → mở hội thoại; đạt điều kiện → sang bước tiếp.
 * Tiến độ lưu trên server (Player.tutorial) qua intent "tutorial:set".
 */
export function useTutorial() {
  useEffect(() => {
    let sent: string | null = null;
    const advance = (next: string) => {
      if (sent === next) return;
      sent = next;
      void send("tutorial:set", { step: next });
    };
    const check = (s: State) => {
      if (!s.me || s.status !== "online") return;
      const step = content.stepById.get(s.me.tutorial);
      if (!step) return;
      if (step.lines.length > 0 && !s.seenDialogues.includes(step.id)) {
        if (s.dialogue !== step.id) {
          // NPC bắt chuyện: đóng bảng đang mở để người chơi tập trung vào lời thoại.
          if (s.sheet) s.openSheet(null);
          s.showDialogue(step.id);
        }
        return;
      }
      if (s.dialogue) return;
      if (step.until) {
        if (step.next && conditionMet(step.until, s)) advance(step.next);
      } else if (step.next && step.choices.length === 0) {
        // Bước chỉ có lời thoại: nghe xong thì sang bước tiếp.
        advance(step.next);
      }
    };
    check(useGame.getState());
    return useGame.subscribe(check);
  }, []);
}

/** Chọn một nhánh ở cuối hội thoại. */
export function chooseBranch(next: string) {
  useGame.getState().showDialogue(null);
  void send("tutorial:set", { step: next });
}
