const CLOUDFLARE_API_BASE = "https://coptic-app-notifications.abraammerzik56.workers.dev";

export async function verifyAdminPin(pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/app-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await response.json().catch(() => ({}));
    return {
      success: response.ok && data?.success === true,
      error: typeof data?.error === "string" ? data.error : undefined,
    };
  } catch {
    return { success: false, error: "network_error" };
  }
}
