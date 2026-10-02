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

// ───────── Thanh trạng thái (góp ý UI): icon nhỏ, nét viền đậm cùng bộ với icon neo ─────────

/** Tiền mặt: xấp tiền polymer xanh có chữ đ. */
export function IconCash({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="3.5"
        y="5"
        width="18"
        height="11"
        rx="2"
        fill="#2e8b57"
        stroke={INK}
        strokeWidth="1.6"
      />
      <rect
        x="2"
        y="7.5"
        width="18"
        height="11"
        rx="2"
        fill="#5cc28a"
        stroke={INK}
        strokeWidth="1.6"
      />
      <circle cx="11" cy="13" r="3.2" fill="#e8f7ee" stroke={INK} strokeWidth="1.2" />
      <path
        d="M11.9 11.2v3.9M10.1 12.4h1.8M12.4 11.4h1"
        stroke={INK}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle cx="10.6" cy="14.2" r="1" fill="none" stroke={INK} strokeWidth="1.1" />
      <path d="M4.5 10v6M17.5 10v6" stroke="#2e8b57" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Uy tín: ngôi sao vàng có viền và vệt sáng. */
export function IconStar({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="m12 2.6 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 16.9l-5.7 3 1.2-6.3-4.6-4.4 6.3-.8Z"
        fill="#f5c542"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 6.2 10.4 9.6" stroke="#fff3c4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** No: chén cơm trắng có đôi đũa. */
export function IconRice({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m15.5 2.5 5 8M18 2l4 7.5" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 11c0-4 3.5-6 8-6s8 2 8 6" fill="#fffaf0" stroke={INK} strokeWidth="1.5" />
      <path
        d="M8 8.5h.01M11 7.5h.01M14 8.5h.01M10 10h.01M13 10.2h.01"
        stroke="#c9b48a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2.5 11h19c0 5-4 8.5-9.5 8.5S2.5 16 2.5 11Z"
        fill="#4a90c8"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M5.5 13.5h13" stroke="#cfe6f7" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Khát: giọt nước. */
export function IconDrop({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.5C9 7 5.5 10.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 2.5Z"
        fill="#4fb3e8"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 14.5a3 3 0 0 0 2.5 3"
        fill="none"
        stroke="#e3f5ff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Sun() {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g>
      {rays.map((a) => (
        <path
          key={a}
          d="M12 1.8v2.6"
          stroke="#f2a51a"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="5" fill="#ffd34d" stroke={INK} strokeWidth="1.4" />
    </g>
  );
}

function Cloud({ fill = "#f4f6f8", dx = 0, dy = 0 }: { fill?: string; dx?: number; dy?: number }) {
  return (
    <path
      transform={`translate(${dx} ${dy})`}
      d="M6.5 18.5h11a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.4A4.2 4.2 0 0 0 6.5 18.5Z"
      fill={fill}
      stroke={INK}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  );
}

/** Kiểu trời trên thanh trạng thái (UC-B4): nắng · trăng (đêm quang) · âm u · mưa · bão. */
export function IconWeather({ kind, night, className }: P & { kind: string; night?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {kind === "sunny" && !night && <Sun />}
      {kind === "sunny" && night && (
        <path
          d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5Z"
          fill="#ffe08a"
          stroke={INK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      {kind === "cloudy" && (
        <>
          <Cloud fill="#c9d2dc" dx={2.5} dy={-3.5} />
          <Cloud />
        </>
      )}
      {(kind === "rain" || kind === "storm") && (
        <>
          <Cloud fill={kind === "storm" ? "#9aa6b4" : "#dfe5ec"} dy={-3} />
          {kind === "rain" ? (
            <path
              d="M8 18.5l-1 3M12 18.5l-1 3M16 18.5l-1 3"
              stroke="#4fb3e8"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="m12.5 15.5-2.5 4h3l-2 4"
              fill="none"
              stroke="#f5c542"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </>
      )}
    </svg>
  );
}

// ───────── Thanh điều hướng dưới (góp ý UI): icon vẽ tay cỡ lớn, nhãn chữ đè nhẹ ở chân ─────────

/** Xóm: tấm bản đồ gấp có ghim đỏ. */
export function IconMap({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M5 12 17 7l14 5 12-5v29l-12 5-14-5-12 5Z"
        fill="#9ed36a"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M17 7v29M31 12v29" stroke={INK} strokeWidth="2" />
      <path d="M17 7v29l14 5V12Z" fill="#7cc35a" />
      <path d="M17 7v29M31 12v29" stroke={INK} strokeWidth="2.2" />
      <path
        d="M8 27c4-2 6 3 10 1s5-6 10-4 6 3 11 1"
        fill="none"
        stroke="#4fb3e8"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24 3a7 7 0 0 0-7 7c0 5.5 7 12 7 12s7-6.5 7-12a7 7 0 0 0-7-7Z"
        fill="#e4432d"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="2.6" fill="#fff4d6" stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}

/** Làm ăn: xe đẩy bán hàng có mái che sọc đỏ trắng. */
export function IconShop({ className }: P) {
  const stripes = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M9 19h30v15H9Z"
        fill="#f2c27a"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect
        x="13"
        y="22"
        width="22"
        height="8"
        rx="1.5"
        fill="#cfe9f7"
        stroke={INK}
        strokeWidth="2"
      />
      <path d="M16 25h3M22 25h3M28 25h3" stroke="#e4432d" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 34h38" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="39" r="4" fill="#5b5b5b" stroke={INK} strokeWidth="2.2" />
      <circle cx="34" cy="39" r="4" fill="#5b5b5b" stroke={INK} strokeWidth="2.2" />
      <path d="M11 19V9M37 19V9" stroke={INK} strokeWidth="2.2" />
      {stripes.map((i) => (
        <path
          key={i}
          d={`M${7 + i * 7} 8h7l-1 7c0 2-5 2-5 0Z`}
          fill={i % 2 ? "#fff4d6" : "#e4432d"}
          stroke={INK}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      ))}
      <path d="M6 8h36" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Nhiệm vụ: bia ngắm có phi tiêu cắm hồng tâm. */
export function IconQuest({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="22" cy="26" r="17" fill="#fff4d6" stroke={INK} strokeWidth="2.6" />
      <circle cx="22" cy="26" r="12" fill="#e4432d" stroke={INK} strokeWidth="2" />
      <circle cx="22" cy="26" r="7" fill="#fff4d6" stroke={INK} strokeWidth="2" />
      <circle cx="22" cy="26" r="3" fill="#e4432d" stroke={INK} strokeWidth="1.8" />
      <path d="M22 26 40 8" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M22 26 40 8" stroke="#f5c542" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="m37 5 1.5 5.5L44 12l-4 3.5-5.5-1.5L33 8.5Z"
        fill="#3f8a4f"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Việc làm: cặp da nâu có nón lá vắt bên. */
export function IconJob({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M17 15v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
      />
      <rect
        x="6"
        y="15"
        width="36"
        height="25"
        rx="4"
        fill="#a8693a"
        stroke={INK}
        strokeWidth="2.6"
      />
      <path d="M6 24h36" stroke={INK} strokeWidth="2.2" />
      <path d="M8 17.5h32" stroke="#c98a55" strokeWidth="2" strokeLinecap="round" />
      <rect
        x="20"
        y="21"
        width="8"
        height="6"
        rx="1.5"
        fill="#f5c542"
        stroke={INK}
        strokeWidth="2"
      />
      <path
        d="M26 6 38 2l8 9Z"
        fill="#f2d48a"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M30 6.5 39 4" stroke="#c9a24f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Hàng xóm: hai người đứng cạnh nhau, một người vẫy tay. */
export function IconNeighbors({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M26 44c0-8 4-13 10-13s10 5 10 13Z"
        fill="#4a90c8"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="22" r="7" fill="#f2c9a0" stroke={INK} strokeWidth="2.4" />
      <path d="M29.5 20c1-5 12-6 13 0-3-2-9-2-13 0Z" fill="#3b2414" />
      <path
        d="M2 44c0-9 5-15 12-15s12 6 12 15Z"
        fill="#e4432d"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="19" r="8" fill="#f2c9a0" stroke={INK} strokeWidth="2.4" />
      <path d="M6 17c1-7 15-8 16-1-4-1-10-2-16 1Z" fill="#3b2414" stroke={INK} strokeWidth="1.2" />
      <path d="M4 33 1 22" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M4 33 1 22" stroke="#f2c9a0" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M11 21h.01M17 21h.01M36 23h.01"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11.5 24.5c1.5 1.2 3.5 1.2 5 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** ☰ Menu: ba thanh tròn đầu màu nắng, viền nâu — nút duy nhất ở thanh dưới, chữ "Menu" đè nhẹ bên dưới. */
export function IconMenu({ className }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {[11, 21, 31].map((y) => (
        <rect
          key={y}
          x="7"
          y={y}
          width="34"
          height="7"
          rx="3.5"
          fill="#f2c14e"
          stroke={INK}
          strokeWidth="2.6"
        />
      ))}
    </svg>
  );
}
