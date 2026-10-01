import { Logo } from "./Logo";

// Tranh minh hoạ con hẻm Sài Gòn (SVG thuần, không tải ảnh): dãy nhà ống có ban công, bảng hiệu,
// dây đèn lồng đung đưa, xe bánh mì dưới dù, nồi phở bốc khói, ghế nhựa, xe máy chạy ngang, mây trôi.
// Dùng cho trang đăng nhập và màn hình đang tải (docs/PLAN.md — ấn tượng đầu tiên).

const HOUSES = [
  { x: 0, w: 70, h: 150, wall: "#f2c14e", roof: "#b84a3a", sign: "TẠP HÓA", signBg: "#2f7d4f" },
  { x: 70, w: 62, h: 185, wall: "#8fc5c9", roof: "#6b4b35", sign: "PHỞ", signBg: "#c0392b" },
  { x: 132, w: 74, h: 160, wall: "#f4e1c1", roof: "#b84a3a", sign: "BÁNH MÌ", signBg: "#e4432d" },
  { x: 206, w: 60, h: 200, wall: "#e9a3a0", roof: "#6b4b35", sign: "TRÀ SỮA", signBg: "#8e44ad" },
  { x: 266, w: 70, h: 170, wall: "#b7d7a8", roof: "#b84a3a", sign: "CƠM TẤM", signBg: "#d35400" },
  { x: 336, w: 64, h: 150, wall: "#f2c14e", roof: "#6b4b35", sign: "CÀ PHÊ", signBg: "#6d4c41" },
];
const GROUND = 250;

function House({ x, w, h, wall, roof, sign, signBg }: (typeof HOUSES)[number]) {
  const top = GROUND - h;
  const floors = Math.floor((h - 60) / 42);
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} fill={wall} />
      <rect x={x - 2} y={top - 6} width={w + 4} height={8} fill={roof} rx={2} />
      {Array.from({ length: floors }, (_, f) => {
        const y = top + 14 + f * 42;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: số tầng cố định
          <g key={f}>
            <rect x={x + 10} y={y} width={w - 20} height={22} fill="#fff6e5" className="xa-win" />
            <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + 22} stroke={roof} strokeWidth={2} />
            {/* Ban công + chậu cây */}
            <rect x={x + 6} y={y + 24} width={w - 12} height={4} fill={roof} />
            <circle cx={x + 14} cy={y + 21} r={4} fill="#4f8a3c" />
            <circle cx={x + w - 14} cy={y + 21} r={4} fill="#c0392b" />
          </g>
        );
      })}
      {/* Mái hiên sọc + bảng hiệu */}
      <rect x={x + 4} y={GROUND - 62} width={w - 8} height={14} fill={signBg} rx={2} />
      <text
        x={x + w / 2}
        y={GROUND - 52}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={800}
        fill="#fff6e5"
        fontFamily="inherit"
      >
        {sign}
      </text>
      <path
        d={`M${x + 2} ${GROUND - 46} h${w - 4} l-6 12 h-${w - 16} z`}
        fill="#fff6e5"
        stroke={signBg}
        strokeWidth={1.5}
        strokeDasharray="6 6"
      />
      <rect x={x + 10} y={GROUND - 34} width={w - 20} height={34} fill="#3b2a20" opacity={0.85} />
    </g>
  );
}

export function XomArt({ className = "", night = false }: { className?: string; night?: boolean }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      role="img"
      aria-label="Con hẻm trong xóm: dãy nhà, quán ăn, đèn lồng, xe bánh mì"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="xa-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={night ? "#1b2447" : "#ffb56b"} />
          <stop offset="1" stopColor={night ? "#6b4c7a" : "#ffe3b0"} />
        </linearGradient>
        <radialGradient id="xa-glow">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <style>{`
        .xa-cloud { animation: xa-drift 38s linear infinite; }
        .xa-cloud2 { animation: xa-drift 55s linear infinite; animation-delay: -20s; }
        @keyframes xa-drift { from { transform: translateX(-120px); } to { transform: translateX(460px); } }
        .xa-lantern { transform-box: fill-box; transform-origin: 50% 0; animation: xa-sway 2.6s ease-in-out infinite; }
        @keyframes xa-sway { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
        .xa-steam { animation: xa-steam 2.4s ease-out infinite; }
        @keyframes xa-steam { from { transform: translateY(0); opacity: .8; } to { transform: translateY(-26px); opacity: 0; } }
        .xa-bike { animation: xa-ride 9s linear infinite; }
        @keyframes xa-ride { from { transform: translateX(440px); } to { transform: translateX(-80px); } }
        .xa-win { animation: xa-flicker 6s ease-in-out infinite; }
        @keyframes xa-flicker { 0%,100% { opacity: ${night ? 1 : 0.95}; } 50% { opacity: ${night ? 0.8 : 1}; } }
        @media (prefers-reduced-motion: reduce) { .xa-cloud,.xa-cloud2,.xa-lantern,.xa-steam,.xa-bike { animation: none; } }
      `}</style>

      <rect width="400" height="300" fill="url(#xa-sky)" />
      <circle cx="330" cy="55" r="22" fill={night ? "#fdf3c4" : "#fff1c9"} opacity="0.95" />
      <g className="xa-cloud" opacity="0.8">
        <ellipse cx="60" cy="45" rx="30" ry="9" fill="#fff" />
        <ellipse cx="80" cy="40" rx="18" ry="8" fill="#fff" />
      </g>
      <g className="xa-cloud2" opacity="0.6">
        <ellipse cx="40" cy="80" rx="24" ry="7" fill="#fff" />
      </g>

      {HOUSES.map((h) => (
        <House key={h.x} {...h} />
      ))}

      {/* Dây điện + đèn lồng */}
      <path d="M0 70 Q100 95 200 72 T400 70" fill="none" stroke="#3b2a20" strokeWidth="1.2" />
      {[30, 75, 120, 165, 210, 255, 300, 345, 385].map((lx, i) => (
        <g key={lx} className="xa-lantern" style={{ animationDelay: `${-i * 0.3}s` }}>
          <line x1={lx} y1={76} x2={lx} y2={84} stroke="#3b2a20" strokeWidth="1" />
          <ellipse
            cx={lx}
            cy={91}
            rx={6}
            ry={8}
            fill={i % 3 === 0 ? "#e4432d" : i % 3 === 1 ? "#f6b93b" : "#d35493"}
          />
          <rect x={lx - 3} y={98} width={6} height={2} fill="#b8860b" />
        </g>
      ))}

      {/* Vỉa hè + đường */}
      <rect y={GROUND} width="400" height="18" fill="#c9bfae" />
      <rect y={GROUND + 18} width="400" height="32" fill="#5d6168" />
      {[20, 90, 160, 230, 300, 370].map((x) => (
        <rect key={x} x={x} y={GROUND + 32} width="30" height="3" fill="#f3efe6" />
      ))}

      {/* Xe bánh mì dưới dù + ghế nhựa + nồi phở */}
      <g transform="translate(120 0)">
        <circle cx="30" cy={GROUND - 20} r="40" fill="url(#xa-glow)" opacity={night ? 1 : 0.4} />
        <path d={`M5 ${GROUND - 44} Q30 ${GROUND - 62} 55 ${GROUND - 44} z`} fill="#e4432d" />
        <line x1="30" y1={GROUND - 50} x2="30" y2={GROUND - 12} stroke="#6b4b35" strokeWidth="2" />
        <rect
          x="10"
          y={GROUND - 26}
          width="42"
          height="20"
          fill="#f4e1c1"
          stroke="#6b4b35"
          rx="2"
        />
        <rect x="14" y={GROUND - 24} width="34" height="10" fill="#cfeaf6" />
        <text
          x="31"
          y={GROUND - 9}
          textAnchor="middle"
          fontSize="6"
          fontWeight={800}
          fill="#e4432d"
        >
          BÁNH MÌ
        </text>
        <circle cx="16" cy={GROUND + 1} r="4" fill="#3b2a20" />
        <circle cx="46" cy={GROUND + 1} r="4" fill="#3b2a20" />
      </g>
      {[40, 58, 250, 268, 286].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y={GROUND - 10}
            width="12"
            height="3"
            fill={x > 200 ? "#2e86c1" : "#e4432d"}
          />
          <rect
            x={x + 1}
            y={GROUND - 7}
            width="2"
            height="8"
            fill={x > 200 ? "#2e86c1" : "#e4432d"}
          />
          <rect
            x={x + 9}
            y={GROUND - 7}
            width="2"
            height="8"
            fill={x > 200 ? "#2e86c1" : "#e4432d"}
          />
        </g>
      ))}
      <g transform="translate(80 0)">
        <rect x="0" y={GROUND - 22} width="22" height="16" fill="#9aa4ad" rx="2" />
        <g className="xa-steam">
          <path
            d={`M6 ${GROUND - 26} q4 -6 0 -12`}
            stroke="#fff"
            strokeWidth="2"
            fill="none"
            opacity="0.8"
          />
          <path
            d={`M14 ${GROUND - 26} q-4 -6 0 -12`}
            stroke="#fff"
            strokeWidth="2"
            fill="none"
            opacity="0.8"
          />
        </g>
      </g>

      {/* Người ngồi ăn (bóng) */}
      {[46, 256, 280].map((x, i) => (
        <g key={x} fill={["#2b2118", "#44342a", "#2b2118"][i]}>
          <circle cx={x + 6} cy={GROUND - 26} r="5" />
          <rect x={x + 1} y={GROUND - 21} width="10" height="12" rx="3" />
        </g>
      ))}

      {/* Xe máy chạy ngang */}
      <g className="xa-bike">
        <g transform={`translate(0 ${GROUND + 20})`}>
          <circle cx="8" cy="18" r="6" fill="#222" />
          <circle cx="34" cy="18" r="6" fill="#222" />
          <path d="M4 12 h30 l4 6 h-38 z" fill="#c0392b" />
          <rect x="16" y="0" width="8" height="12" rx="3" fill="#2b2118" />
          <circle cx="20" cy="-3" r="5" fill="#f6b93b" />
        </g>
      </g>
    </svg>
  );
}

const TIPS = [
  "Khách chỉ ghé quầy khi bạn đứng quầy và còn đủ nguyên liệu.",
  "Kéo một ngón để xoay góc nhìn trong quán, chụm hai ngón để thu/phóng.",
  "Sáng có xôi, phở; tối có ốc, nướng — ghé 🍜 Ăn uống xem sạp nào đang bày.",
  "Múc cơm đủ các món trong phiếu 'Cần múc' mới được tiền việc.",
  "Mời bạn vào xóm bằng nút 👥 Hàng xóm → 📨 Mời bạn.",
  "Tối trời, đèn đường bật sáng — xóm đêm cũng đông khách lắm.",
];

/** Màn hình đang tải: tranh xóm, chữ "Đang vào xóm…" nhấp nháy, một mẹo chơi ngẫu nhiên. */
export function LoadingScreen({ text = "Đang vào xóm" }: { text?: string }) {
  const tip = TIPS[Math.floor((Date.now() / 7000) % TIPS.length)];
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-cream">
      <XomArt className="h-[62dvh] w-full" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <Logo className="h-16" />
        <p className="text-base font-semibold">
          {text}
          <span className="inline-block w-6 animate-pulse text-left">…</span>
        </p>
        <p className="text-sm text-ink/60">💡 {tip}</p>
      </div>
    </div>
  );
}
