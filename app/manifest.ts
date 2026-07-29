import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HospitaLingo — English for Hotel & Restaurant",
    short_name: "HospitaLingo",
    description: "AI-powered hospitality English practice for hotel and restaurant teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f1ed",
    theme_color: "#176d5e",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
