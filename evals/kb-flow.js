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
  await sleep(6000);

  say("1) KB toggle present: " + (await js(`!!(${kbBtn})`)) + " | placeholder: " + (await js(`document.querySelector("textarea").placeholder`)));
  say("   suggestions (General): " + (await js(suggestions)));
  await shot("kb-off.png");

  await js(`${kbBtn}.click()`); await sleep(1500);
  say("2) after toggle -> pressed: " + (await js(`${kbBtn}.getAttribute("aria-pressed")`)) + " | placeholder: " + (await js(`document.querySelector("textarea").placeholder`)));
  say("   suggestions (KB): " + (await js(suggestions)));
  await shot("kb-on.png");

  await js(`document.querySelector(".aui-thread-welcome-suggestion").click()`); // sends the first KB suggestion
  await waitFor(`(document.querySelector(".aui-md")?.innerText || "").includes("Sources")`, 120000);
  await sleep(2500);
  say("3) KB answer: " + JSON.stringify(await js(`document.querySelector(".aui-md")?.innerText`)));
  await shot("kb-answer.png");

  await type("textarea", "پاسپورٹ کی تجدید کی فیس کیا ہے؟");
  await sleep(500); await pressEnter();
  await waitFor(`document.querySelectorAll(".aui-md").length >= 2 && document.querySelectorAll(".aui-md")[1].innerText.length > 5`, 120000);
  await sleep(4000);
  say("4) Not-in-documents question: " + JSON.stringify(await js(`[...document.querySelectorAll(".aui-md")].at(-1)?.innerText`)));
  await shot("kb-notfound.png");

  say("JS exceptions: " + JSON.stringify(errors));
  ws.close(); edge.kill(); process.exit(0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(1); });
