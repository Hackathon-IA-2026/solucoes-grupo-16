import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  // Work around a Node 24/cross-spawn issue that can return empty stdout from
  // `tsc --showConfig`. Next still performs the same production type check via
  // the TypeScript compiler API, as documented for Next 16.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
