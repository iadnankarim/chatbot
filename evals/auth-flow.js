// End-to-end login test in Edge headless (DevTools protocol).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9444;
const dir = require("path").join(__dirname, "out"); // screenshots go here
require("fs").mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };

(async () => {
  const profile = path.join(dir, "edge-profile-auth");
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

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP + "/" });
  await waitFor("location.pathname === '/login' && !!document.querySelector('input[type=password]')");
  say("1) open / without login -> URL path: " + (await js("location.pathname")));
  await sleep(1500); await shot("login.png");

  await sleep(2000); // let React hydrate
  await type("input[autocomplete=username]", "ahmed");
  await type("input[type=password]", "wrong-password");
  await sleep(300); await js("document.querySelector('button[type=submit]').click()");
  await waitFor("!!document.querySelector('[role=alert]')", 15000);
  say("2) wrong password -> message: " + (await js("document.querySelector('[role=alert]')?.innerText")) + " | still on: " + (await js("location.pathname")));

  await type("input[type=password]", "Plpa@2026");
  await sleep(300); await js("document.querySelector('button[type=submit]').click()");
  await waitFor("location.pathname === '/' && !!document.querySelector('textarea')", 30000);
  say("3) correct login -> URL path: " + (await js("location.pathname")));
  await sleep(6000);
  say("   sidebar user chip: " + JSON.stringify(await js("document.querySelector('aside')?.lastElementChild?.innerText")));
  await shot("home.png");

  await type("textarea", "Say hello in one short sentence.");
  await sleep(500);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor("(document.querySelector('.aui-md')?.innerText||'').length > 3", 90000);
  await sleep(3000);
  say("4) chat reply while logged in: " + JSON.stringify(await js("document.querySelector('.aui-md')?.innerText")));
  await shot("chat.png");

  await js("document.querySelector('button[aria-label=\"Log out\"]').click()");
  await waitFor("location.pathname === '/login'", 15000);
  say("5) after Log out -> URL path: " + (await js("location.pathname")));
  await send("Page.navigate", { url: APP + "/" });
  await sleep(3000);
  say("6) open / again after logout -> URL path: " + (await js("location.pathname")));
  say("JS exceptions: " + JSON.stringify(errors));
  ws.close(); edge.kill(); process.exit(0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(1); });
