export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Not awaited: register() must finish before the server accepts requests.
  const { warmUpModel } = await import("./lib/warmup");
  void warmUpModel();
}
