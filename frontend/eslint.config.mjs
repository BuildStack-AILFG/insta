import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Dashboard screens fetch on mount and render blob:/QR images. These React-Compiler heuristics flag those idiomatic patterns
    // (setState after an awaited fetch inside an effect, <img> for object URLs) without pointing at real bugs.
    files: ["src/app/dashboard/**", "src/components/dashboard/**", "src/components/auth/**", "src/components/sales/**", "src/components/site/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
