import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ScoGene - AI数学採点",
    short_name: "ScoGene",
    description:
      "AIが高校教師レベルで数学の解答を採点。途中式の評価、部分点、赤ペン添削まで対応。",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9fc",
    theme_color: "#4338ca",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "新規採点",
        short_name: "採点",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "採点履歴",
        short_name: "履歴",
        url: "/history",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
