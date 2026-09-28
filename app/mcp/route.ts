import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { createWorkspaceMcpServer } from "../../lib/mcp/workspace-server";
import { allowRequest } from "../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MCP_BODY_BYTES = 512 * 1024;
const DEFAULT_PRODUCTION_ORIGIN = "https://spartanblue.vercel.app";

function productionOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Fall through to the request origin.
    }
  }
  if (process.env.NODE_ENV === "production") return DEFAULT_PRODUCTION_ORIGIN;
  return new URL(request.url).origin;
}

function authChallenge(request: Request) {
  const metadataUrl = `${productionOrigin(request)}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Authentication required" },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}", scope="openid email profile"`,
      },
    },
  );
}

function mcpError(message: string, status: number) {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32600, message },
      id: null,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_BODY_BYTES)
    return mcpError("Request too large", 413);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    return mcpError("Content-Type must be application/json", 415);

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token || token.length > 4096) return authChallenge(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey)
    return mcpError("Workspace data service is unavailable", 503);

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return authChallenge(request);
  if (!allowRequest(`mcp:${data.user.id}`, 240, 10 * 60_000))
    return mcpError("Too many MCP requests", 429);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createWorkspaceMcpServer({
    client,
    user: data.user,
    accessToken: token,
    origin: productionOrigin(request),
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      authInfo: {
        token,
        clientId: "supabase-oauth",
        scopes: ["openid", "email", "profile"],
      },
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch {
    return mcpError("Internal MCP error", 500);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function GET() {
  return mcpError("Use POST for Streamable HTTP", 405);
}

export function DELETE() {
  return mcpError("Stateless MCP sessions cannot be deleted", 405);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
      "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
