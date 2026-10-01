/**
 * Chữ "XÓM" (logo): chữ đậm màu đỏ gạch viền kem, dấu sắc trên chữ O là chiếc nón lá nghiêng — nhận ra ngay "chất Việt".
 * Vẽ bằng SVG nên sắc nét ở mọi cỡ; dùng ở trang chủ, đăng nhập, màn hình tải.
 */
export function Logo({ className = "h-20" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 132" className={className} role="img" aria-label="XÓM">
      <title>XÓM</title>
      <defs>
        <linearGradient id="xom-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0563a" />
          <stop offset="1" stopColor="#b8321f" />
        </linearGradient>
        <linearGradient id="xom-non" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7dc8f" />
          <stop offset="1" stopColor="#d9a94a" />
        </linearGradient>
      </defs>
      {/* Bóng đổ ấm phía sau chữ. */}
      <text
        x="160"
        y="122"
        textAnchor="middle"
        fontSize="104"
        fontWeight="900"
        fill="#5c2b19"
        opacity="0.25"
        transform="translate(4 5)"
        style={{ fontFamily: "inherit", letterSpacing: "4px" }}
      >
        XOM
      </text>
      <text
        x="160"
        y="122"
        textAnchor="middle"
        fontSize="104"
        fontWeight="900"
        fill="url(#xom-ink)"
        stroke="#fff6e5"
        strokeWidth="6"
        paintOrder="stroke"
        style={{ fontFamily: "inherit", letterSpacing: "4px" }}
      >
        XOM
      </text>
      {/* Nón lá thay dấu sắc trên chữ O. */}
      <g transform="translate(138 16) rotate(-14)">
        <path
          d="M0 26 L26 0 L52 26 Q26 32 0 26Z"
          fill="url(#xom-non)"
          stroke="#8a5a22"
          strokeWidth="2.5"
        />
        <path d="M13 13 L39 13 M7 20 L45 20" stroke="#b9832f" strokeWidth="2" />
        <path d="M6 27 Q26 40 46 27" fill="none" stroke="#8a5a22" strokeWidth="2" />
      </g>
    </svg>
  );
}
