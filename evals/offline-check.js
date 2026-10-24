// Loads login, logs in, opens the chat, sends one message, and lists every network request that
// does NOT go to localhost. For an offline product that list must be empty.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9777;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(__dirname, "edge-profile-off");
  fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const all = []; const external = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Network.requestWillBeSent") {
      const u = m.params.request.url; all.push(u);
      if (!/^(http:\/\/localhost:3000|data:|blob:|about:|chrome-extension:)/.test(u)) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr)) return true; await sleep(500); } return false; };
  const type = async (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);

  await send("Network.enable"); await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP + "/login" });
  await waitFor(`!!document.querySelector("input[type=password]")`); await sleep(2500);
  await type("input[autocomplete=username]", "ahmed"); await type("input[type=password]", "Plpa@2026");
  await sleep(300); await js(`document.querySelector("button[type=submit]").click()`);
  await waitFor(`location.pathname === "/" && !!document.querySelector("textarea")`); await sleep(5000);
  await type("textarea", "Say hello in one short sentence."); await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor(`(document.querySelector(".aui-md")?.innerText || "").length > 3`, 120000); await sleep(3000);

  console.log(`requests total: ${all.length}, outside localhost: ${external.length}`);
  for (const u of [...new Set(external)]) console.log("  EXTERNAL:", u);
  ws.close(); edge.kill(); process.exit(0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(1); });
