/**
 * tsdown build for dsh-context-menu.
 *
 * 两个产物：
 *   1. lib/index.js  — ESM Node host 半（无依赖）。
 *   2. lib/client.js — 浏览器 client bundle，harness ModuleLoader
 *      closure-factory 格式：`window.__ModuleLoader__.load({ id, factory })`。
 *      本插件纯 DOM 实现，无任何平台模块外置依赖。
 */

const ID = 'dsh-context-menu'

export default [
  // ---- Node host half ----
  {
    name: ID,
    entry: ['src/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  // ---- Browser client bundle ----
  {
    name: ID + '/client',
    entry: { client: 'src/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(ID) + ', factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
];
