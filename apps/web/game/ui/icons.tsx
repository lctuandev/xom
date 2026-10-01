// Icon neo trên màn hình chính (góp ý UX): vẽ tay bằng SVG, viền nâu đậm + màu nổi, không cần nền nút hay chữ —
// nhìn là biết. Quầng sáng (class `icon-halo`) giúp icon nổi trên mọi nền bản đồ 3D, ngày lẫn đêm.

const INK = "#3b2414";
type P = { className?: string };

/** Ăn uống: tô phở bốc khói, đôi đũa. */
export function IconFood({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round">
        <path d="M17 6c-2 3 2 5 0 8M24 4c-2 3 2 5 0 8M31 6c-2 3 2 5 0 8" stroke="#9aa3ad" />
      </g>
      <path d="M33 4 41 22" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M33 4 41 22" stroke="#e8b04a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M38 5 43 21" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M38 5 43 21" stroke="#e8b04a" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M5 22h38c0 10-7 17-15 18h-8C12 39 5 32 5 22Z"
        fill="#e4432d"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M9 22c0-3 5-5 15-5s15 2 15 5" fill="#fff4d6" stroke={INK} strokeWidth="2.2" />
      <path d="M13 21c3-2 6 1 9-1s6 1 9-1 4 1 5 1" fill="none" stroke="#e8c27a" strokeWidth="1.8" />
      <circle cx="17" cy="20" r="2.2" fill="#6aa84f" stroke={INK} strokeWidth="1.2" />
      <path d="M10 28h28" stroke="#f7d36b" strokeWidth="2.4" strokeLinecap="round" />
      <rect
        x="18"
        y="39"
        width="12"
        height="4"
        rx="1.5"
        fill="#c0392b"
        stroke={INK}
        strokeWidth="2"
      />
    </svg>
  );
}

/** Chợ: rổ tre đầy rau củ. */
export function IconMarket({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M12 20C12 8 36 8 36 20"
        fill="none"
        stroke={INK}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M12 20C12 8 36 8 36 20"
        fill="none"
        stroke="#c8913f"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M14 19c-2-6 4-9 6-4" fill="#6aa84f" stroke={INK} strokeWidth="2" />
      <path d="M22 18c0-7 7-8 7-2" fill="#3f8a4f" stroke={INK} strokeWidth="2" />
      <path
        d="M29 20 37 11l3 3-7 8Z"
        fill="#f08a24"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M38 9l3-3M40 11l3-1" stroke="#3f8a4f" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="19" cy="21" r="3.6" fill="#e4432d" stroke={INK} strokeWidth="2" />
      <path
        d="M5 20h38l-4 20a4 4 0 0 1-4 3H13a4 4 0 0 1-4-3Z"
        fill="#d9a35b"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M8 27h32M9.5 34h29" stroke="#a8702f" strokeWidth="2" />
      <path d="M15 21l2 21M24 21v21M33 21l-2 21" stroke="#a8702f" strokeWidth="2" />
    </svg>
  );
}

/** Bảng xóm: cúp vàng có sao. */
export function IconTrophy({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M14 9H6v5c0 6 5 9 10 9M34 9h8v5c0 6-5 9-10 9"
        fill="none"
        stroke={INK}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M14 9H6v5c0 6 5 9 10 9M34 9h8v5c0 6-5 9-10 9"
        fill="none"
        stroke="#f2b632"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M13 5h22v11c0 7-5 12-11 12S13 23 13 16Z"
        fill="#f5c542"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M17 8v8c0 3 2 6 4 7"
        fill="none"
        stroke="#fff3c4"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="m24 10 1.8 3.7 4 .6-2.9 2.8.7 4L24 19.2 20.4 21l.7-4-2.9-2.8 4-.6Z"
        fill="#e4432d"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M21 28h6v6h-6Z" fill="#e0a92e" stroke={INK} strokeWidth="2.4" />
      <rect
        x="13"
        y="34"
        width="22"
        height="9"
        rx="2"
        fill="#7a4a2a"
        stroke={INK}
        strokeWidth="2.6"
      />
      <path d="M18 38.5h12" stroke="#f5c542" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Cài đặt: bánh răng. */
export function IconGear({ className }: P) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
        {teeth.map((a) => (
          <rect
            key={a}
            x="20"
            y="3"
            width="8"
            height="9"
            rx="2"
            fill="#8fb3d9"
            transform={`rotate(${a} 24 24)`}
          />
        ))}
        <circle cx="24" cy="24" r="14" fill="#8fb3d9" />
      </g>
      <circle
        cx="24"
        cy="24"
        r="14"
        fill="none"
        stroke="#c9dcf0"
        strokeWidth="2"
        strokeDasharray="10 40"
      />
      <circle cx="24" cy="24" r="6" fill="#fff8e8" stroke={INK} strokeWidth="2.6" />
    </svg>
  );
}

/** Nói / chat: bong bóng thoại có ba chấm. */
export function IconChat({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M24 6C13 6 5 12.5 5 21c0 4.6 2.4 8.7 6.3 11.5L9 42l10-6c1.6.3 3.3.5 5 .5 11 0 19-6.5 19-15S35 6 24 6Z"
        fill="#fff8e8"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="21" r="3" fill="#e4432d" stroke={INK} strokeWidth="1.6" />
      <circle cx="24" cy="21" r="3" fill="#f5c542" stroke={INK} strokeWidth="1.6" />
      <circle cx="32.5" cy="21" r="3" fill="#3f8a4f" stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}
