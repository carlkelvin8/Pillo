import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next")),
});

const config = [
  {
    ignores: [
      ".next/**",
      ".next-prod/**",
      "node_modules/**",
      "docs/**",
      "supabase/functions/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: "No hard-coded hex colors. Use design tokens (see globals.css).",
        },
      ],
    },
  },
  {
    // Hex values are allowed where tokens are defined or inside SVG art.
    files: ["src/components/brand/**", "src/config/**", "**/*.test.*"],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default config;
