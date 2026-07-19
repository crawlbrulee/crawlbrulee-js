import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // no declaration maps: src/ isn't published, they'd point at nothing
  dts: { sourcemap: false },
  // match the published exports map: index.js/.d.ts (esm) + index.cjs/.d.cts
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.js' : '.cjs',
    dts: format === 'es' ? '.d.ts' : '.d.cts',
  }),
  sourcemap: true,
  treeshake: true,
  minify: false,
})
