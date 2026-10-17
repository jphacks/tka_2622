import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ものさき。Monosaki",
    short_name: "Monosaki",
    description: "モノの次を、見つけよう。",
    lang: "ja",
    start_url: "/items",
    display: "standalone",
    background_color: "#f8f7f4",
    theme_color: "#f8f7f4",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
