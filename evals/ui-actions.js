// End-to-end Knowledge Base test in Edge headless (DevTools protocol).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9555;
const dir = require("path").join(__dirname, "out"); // screenshots go here
require("fs").mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

(async () => {
  const profile = path.join(dir, "edge-profile-kb");
  fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (name) => fs.writeFileSync(path.join(dir, name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr)) return true; await sleep(500); } return false; };
  const type = async (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const pressEnter = async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  };
  const kbBtn = `[...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Knowledge Base")`;
  const suggestions = `JSON.stringify([...document.querySelectorAll(".aui-thread-welcome-suggestion")].map(b => b.innerText.trim()))`;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP + "/login" });
  await waitFor(`!!document.querySelector("input[type=password]")`);
  await sleep(2500);
  await type("input[autocomplete=username]", "ahmed");
  await type("input[type=password]", "Plpa@2026");
  await sleep(300); await js(`document.querySelector("button[type=submit]").click()`);
  await waitFor(`location.pathname === "/" && !!document.querySelector("textarea")`, 30000);

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP + "/login" });
  await waitFor(`!!document.querySelector("input[type=password]")`);
  await sleep(2500);
  await type("input[autocomplete=username]", "ahmed");
  await type("input[type=password]", "Plpa@2026");
  await sleep(300); await js(`document.querySelector("button[type=submit]").click()`);
  await waitFor(`location.pathname === "/" && !!document.querySelector("textarea")`, 30000);
  await sleep(6000);

  let failed = 0;
  const check = (name, ok, extra = "") => { if (!ok) failed++; say(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); };
  const click = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };
  const center = async (expr) => { const r = await js(`(() => { const b = ${expr}; if (!b) return "null"; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`); return JSON.parse(r); };

  // record what the page sends to the server
  await js(`window.__calls = []; const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); const u = String(a[0]); if (u.includes("/api/feedback") || u.includes("/api/export")) window.__calls.push(u + " " + r.status + " " + (r.headers.get("content-type") || "")); return r; };`);

  await type("textarea", "Say hello in one short sentence.");
  await sleep(300); await pressEnter();
  await waitFor(`!!document.querySelector(".aui-assistant-action-bar-root")`, 180000);
  await sleep(1500);

  const bar = `document.querySelector(".aui-assistant-action-bar-root")`;
  const up = await center(`[...${bar}.querySelectorAll("button")][1]`);
  const down = await center(`[...${bar}.querySelectorAll("button")][2]`);
  if (up) await click(up.x, up.y);
  await sleep(800);
  if (down) await click(down.x, down.y);
  await sleep(1200);
  const calls = JSON.parse(await js(`JSON.stringify(window.__calls)`));
  check("thumbs up sent to the server", calls.some((c) => c.includes("/api/feedback 200")), JSON.stringify(calls));

  const openMore = async () => { const m = await center(`[...${bar}.querySelectorAll("button")].pop()`); await click(m.x, m.y); await sleep(700); };
  const pick = async (label) => { const it = await center(`[...document.querySelectorAll("[role=menuitem]")].find(b => b.innerText.trim() === ${JSON.stringify(label)})`); if (it) await click(it.x, it.y); return !!it; };

  await openMore();
  check("Word menu item clicked", await pick("Download as Word"));
  await sleep(2500);
  const calls2 = JSON.parse(await js(`JSON.stringify(window.__calls)`));
  check("Word file was made (200, .docx type)", calls2.some((c) => c.includes("/api/export 200 application/vnd.openxmlformats")), JSON.stringify(calls2.slice(-1)));

  await openMore();
  check("PDF menu item clicked", await pick("Download as PDF"));
  await sleep(2000);
  const frame = await js(`(() => { const f = document.querySelector("iframe"); return f && f.contentDocument ? f.contentDocument.body.innerText : null; })()`);
  check("PDF page was prepared for printing", !!frame && /PLPA AI Assistant/.test(frame) && /hello/i.test(frame), JSON.stringify(frame)?.slice(0, 120));

  say(errors.length ? "page errors:\n" + errors.join("\n") : "no page errors");
  ws.close(); edge.kill();
  process.exit(failed ? 1 : 0);
})();
