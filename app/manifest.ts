import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "موازنة — حسابك العائلي",
    short_name: "موازنة",
    description: "تسجيل السحوبات والسداد ومتابعة الرصيد والأقساط.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f3",
    theme_color: "#173d32",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
