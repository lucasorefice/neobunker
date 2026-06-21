import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: a stray yarn.lock in a parent directory otherwise
    // makes Turbopack infer the wrong root.
    root: path.resolve(__dirname),
    // @moq/hang pulls in @libav.js/variant-opus-af as an Opus WebCodecs
    // *polyfill*, only loaded when the browser lacks native AudioEncoder/Decoder.
    // Its WASM loader uses a runtime-computed dynamic import that a bundler can't
    // statically resolve. The prototype targets modern browsers only (native
    // WebCodecs — "no legacy fallback yet"), so this code path never runs. Treat
    // it as an intentionally-unresolved optional dependency.
    // TODO: to support browsers without native Opus, serve the libav.js wasm
    // assets from a static path and load them at runtime.
    ignoreIssue: [{ path: "**/@libav.js/variant-opus-af/**" }],
  },
};

export default nextConfig;
