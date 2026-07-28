import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent reads its domain knowledge off disk at runtime (see
  // src/agent/knowledge/index.ts). Turbopack's tracer does not follow the
  // dynamic join() into the markdown files, so include them explicitly or the
  // knowledge base is missing in the Vercel build while working fine locally.
  outputFileTracingIncludes: {
    "/api/**": ["./src/agent/knowledge/**/*.md"],
  },

  // LangChain and deepagents resolve provider integrations at runtime and ship
  // their own CommonJS interop. Bundling them produces resolution failures, so
  // leave them external and let Node require them directly on the server.
  serverExternalPackages: [
    "deepagents",
    "langchain",
    "@langchain/core",
    "@langchain/langgraph",
    "@langchain/openai",
  ],
};

export default nextConfig;
