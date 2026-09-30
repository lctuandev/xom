import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XÓM",
    short_name: "XÓM",
    description: "Sống, buôn bán và làm hàng xóm với bạn bè.",
    start_url: "/play",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff6e5",
    theme_color: "#fff6e5",
    lang: "vi",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
