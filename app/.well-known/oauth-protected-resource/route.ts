export const dynamic = "force-dynamic";
const DEFAULT_PRODUCTION_ORIGIN = "https://spartanblue.vercel.app";

function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Use the current HTTPS host when configuration is absent or invalid.
    }
  }
  if (process.env.NODE_ENV === "production") return DEFAULT_PRODUCTION_ORIGIN;
  return new URL(request.url).origin;
}

export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl)
    return Response.json({ error: "OAuth is unavailable" }, { status: 503 });
  const origin = appOrigin(request);
  return Response.json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [`${supabaseUrl}/auth/v1`],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
      resource_name: "Spartanblue",
      resource_documentation: `${origin}/oauth/consent`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
