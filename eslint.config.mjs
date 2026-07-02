import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [
      // Next.js auto-generated files
      "next-env.d.ts",
      ".next/**",
      // CommonJS utility scripts — legitimately use require()
      "scripts/**/*.cjs",
      // Third-party
      "node_modules/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
