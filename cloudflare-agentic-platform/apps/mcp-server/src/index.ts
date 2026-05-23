import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { OpsAgent } from "./agent";
import authHandler from "./auth";

export { OpsAgent };

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": OpsAgent.serve("/mcp") as any,
    "/sse": OpsAgent.serveSSE("/sse") as any,
  },
  defaultHandler: authHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
