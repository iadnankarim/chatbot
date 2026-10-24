// Chat history test: send a message, refresh, check the thread and its messages come back,
// then check that another user does not see them.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9999;
const dir = require("path").join(__dirname, "out"); // screenshots go here
require("fs").mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

async function session(user, steps) {
  const profile = path.join(dir, "edge-profile-" + user);
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
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 300));
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
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }); });
  const helpers = { send, js, shot, waitFor, type, pressEnter, sleep, errors };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP + "/login" });
  await waitFor(`!!document.querySelector("input[type=password]")`);
  await sleep(4000);
  // keep typing until the form really accepted the text (the page may still be hydrating)
  for (let i = 0; i < 12; i++) {
    await type("input[autocomplete=username]", user);
    await type("input[type=password]", "Plpa@2026");
    await sleep(800);
    if (await js(`!document.querySelector("button[type=submit]").disabled`)) break;
    await sleep(2000);
  }
  await js(`document.querySelector("button[type=submit]").click()`);
  await waitFor(`location.pathname === "/" && !!document.querySelector("textarea")`, 30000);
  await sleep(6000);
  try { await steps(helpers); } finally { ws.close(); edge.kill(); }
  return errors;
}


module.exports = { session, say, APP, dir };
