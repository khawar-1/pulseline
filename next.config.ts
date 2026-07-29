import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent reads its domain knowledge off disk at runtime (see
  // src/agent/knowledge/index.ts). Turbopack's tracer does not follow the
  // dynamic join() into the markdown files, so include them explicitly or the
  // knowledge base is missing in the Vercel build while working fine locally.
  outputFileTracingIncludes: {
    "/api/**": ["./src/agent/knowledge/**/*.md"],
  },

  // langchain/@langchain/core/@langchain/openai resolve provider integrations
  // at runtime and ship their own CommonJS interop; bundling them produces
  // resolution failures, so they stay external and Node requires them
  // directly on the server.
  //
  // deepagents and @langchain/langgraph are deliberately NOT here, even
  // though bundling them is slower. Both depend on @langchain/langgraph-sdk,
  // which is pure ESM and vendors its own copy of p-retry at an unusual
  // pnpm-style nested path inside its dist output. Vercel's Lambda runtime
  // cannot load that file through the external/native-require path Turbopack
  // uses for serverExternalPackages ("Cannot use import statement outside a
  // module") even though it works fine with `next start` locally, since local
  // Node just requires straight off disk rather than going through that
  // shim. Bundling forces Next's own compiler to resolve and interop the ESM
  // dependency correctly instead.
  serverExternalPackages: ["langchain", "@langchain/core", "@langchain/openai"],
};

export default nextConfig;
