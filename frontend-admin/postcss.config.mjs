// Empty on purpose: Tailwind v4 is applied via the @tailwindcss/vite plugin
// in vite.config.ts, not PostCSS. Without this file, Vite's config search
// walks up to the sibling Next.js prototype's postcss.config.mjs (which
// uses an incompatible plugin format) and fails to build.
export default {}
