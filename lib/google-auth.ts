import "server-only";

type GoogleWorkspaceConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export function googleWorkspaceConfig(): GoogleWorkspaceConfig {
  const config = {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "",
  };
  if (Object.values(config).some((value) => !value))
    throw new Error("Google Workspace no está configurado");
  return config;
}

export async function getGoogleWorkspaceAccessToken() {
  const config = googleWorkspaceConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error("No se pudo renovar el acceso a Google Workspace");
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token)
      throw new Error("Google no devolvió un acceso válido");
    return body.access_token;
  } finally {
    clearTimeout(timeout);
  }
}
