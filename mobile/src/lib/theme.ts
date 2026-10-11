import { useColorScheme } from "react-native";

// Mirrors the web tokens in frontend/src/app/globals.css (dark = pink/black, light = pink/white).
const dark = {
  background: "#0a0508",
  surface: "#140910",
  surface2: "#1f0e18",
  border: "rgba(244, 114, 182, 0.16)",
  text: "#fdf2f8",
  muted: "#b79aab",
  brand: "#ec4899",
  brandHover: "#db2777",
  brandSoft: "#f472b6",
  onBrand: "#ffffff",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
};

const light: typeof dark = {
  background: "#fff5f9",
  surface: "#ffffff",
  surface2: "#fde7f1",
  border: "rgba(219, 39, 119, 0.14)",
  text: "#2b0a1a",
  muted: "#7a5468",
  brand: "#db2777",
  brandHover: "#be185d",
  brandSoft: "#ec4899",
  onBrand: "#ffffff",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
};

export type Colors = typeof dark;

export function useColors(): Colors {
  return useColorScheme() === "light" ? light : dark;
}

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
