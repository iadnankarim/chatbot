// Browser side of the per-user chat storage: the same shape as localStorage, but async and
// kept on the server (app/api/storage), so chats follow the user and survive a refresh.

async function request(key: string, init?: RequestInit) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, init);
  if (res.status === 401) {
    // The login expired: go back to the login page instead of losing chats silently.
    window.location.assign("/login");
    throw new Error("Not signed in");
  }
  if (!res.ok) throw new Error(`Storage request failed (${res.status})`);
  return res;
}

export const serverStorage = {
  async getItem(key: string): Promise<string | null> {
    const { value } = await (await request(key)).json();
    return typeof value === "string" ? value : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await request(key, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  },
  async removeItem(key: string): Promise<void> {
    await request(key, { method: "DELETE" });
  },
};
