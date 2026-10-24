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
  const btn = (text) => `[...document.querySelectorAll("button")].find(b => b.innerText.trim() === ${JSON.stringify(text)})`;

  // Templates
  check("Templates button is there", await js(`!!(${btn("Templates")})`));
  await js(`${btn("Templates")}.click()`); await sleep(500);
  const labels = await js(`JSON.stringify([...document.querySelectorAll("[role=menuitem]")].map(b => b.innerText.trim()))`);
  check("menu lists the templates", /Notice for all staff/.test(labels) && /Urdu notice/.test(labels), labels);
  await js(`[...document.querySelectorAll("[role=menuitem]")].find(b => b.innerText.trim() === "Notice for all staff").click()`); await sleep(800);
  const filled = await js(`document.querySelector("textarea").value`);
  check("choosing one fills the message box", /Draft a formal notice/.test(filled), JSON.stringify(filled).slice(0, 80));
  await shot("ui-template.png");

  // Source link in Knowledge Base mode
  await type("textarea", "");
  await js(`${btn("Knowledge Base")}.click()`); await sleep(1000);
  await type("textarea", "What is the fee for a new CNIC under urgent service?");
  await sleep(300); await pressEnter();
  const gotLink = await waitFor(`!!document.querySelector("a[href*='/api/kb/file']")`, 240000);
  check("answer shows a clickable source link", gotLink);
  if (gotLink) {
    const href = await js(`document.querySelector("a[href*='/api/kb/file']").getAttribute("href")`);
    const text = await js(`document.querySelector("a[href*='/api/kb/file']").innerText`);
    say("   link: " + text + " -> " + href);
    const r = await js(`fetch(${JSON.stringify(href.split("#")[0])}).then(r => r.status + " " + r.headers.get("content-type"))`);
    check("the link opens the document", /^200 application\/pdf/.test(r), r);
    check("the link points at a page", /#page=\d+/.test(href), href);
  }
  await sleep(1500);
  await shot("ui-source.png");

  // Download menu on the answer
  const rect = JSON.parse(await js(`(() => { const bar = document.querySelector(".aui-assistant-action-bar-root"); const b = bar && [...bar.querySelectorAll("button")].pop(); if (!b) return "null"; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`));
  const more = !!rect;
  if (rect) for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await sleep(800);
  const items = await js(`JSON.stringify([...document.querySelectorAll("[role=menuitem]")].map(b => b.innerText.trim()))`);
  check("More menu has Word and PDF downloads", more && /Download as Word/.test(items) && /Download as PDF/.test(items), items);
  await shot("ui-more.png");

  say(errors.length ? "page errors:\n" + errors.join("\n") : "no page errors");
  ws.close(); edge.kill();
  process.exit(failed ? 1 : 0);
})();
