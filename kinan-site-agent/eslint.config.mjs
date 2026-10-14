import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/**", "out/**", "standalone/dist/**", "kinan-site-agent.html", "lib/deck/brand-logo.ts", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    "@typescript-eslint/no-unused-expressions": "off",
    "@next/next/no-img-element": "off",
    // the font <link> is in the app-router root layout, which loads on every page
    "@next/next/no-page-custom-font": "off",
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "warn",
  } },
];
export default config;
