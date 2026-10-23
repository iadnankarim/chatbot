// Kept apart from lib/theme.ts (client-only hooks) so the server layout can import it.
// Keep the storage key and default in sync with lib/theme.ts.

/** Runs before first paint (inlined in the layout) so the page never flashes the wrong theme. */
export const themeInitScript = `try{var t=localStorage.getItem("theme")||"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
