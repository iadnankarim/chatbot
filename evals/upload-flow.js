// Browser test: attach a PDF in the chat, ask for a summary, read the reply.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9666;
const dir = require("path").join(__dirname, "out"); // screenshots go here
require("fs").mkdirSync(dir, { recursive: true });
const FILE = process.argv[2] || path.resolve(process.env.DOCS_DIR ?? path.join(__dirname, "..", "..", "sample-docs"), "NADRA_Fee_Schedule_EN.pdf");
const BAD = process.argv[3] || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

(async () => {
  const profile = path.join(dir, "edge-profile-up");
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

  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Page.navigate", { url: APP + "/login" });
  await waitFor(`!!document.querySelector("input[type=password]")`);
  await sleep(2500);
  await type("input[autocomplete=username]", "ahmed");
  await type("input[type=password]", "Plpa@2026");
  await sleep(300); await js(`document.querySelector("button[type=submit]").click()`);
  await waitFor(`location.pathname === "/" && !!document.querySelector("textarea")`, 30000);
  await sleep(6000);

  say("1) attach button present: " + (await js(`!!document.querySelector("[aria-label=\\"Add Attachment\\"]")`)));
  await shot("up-0-home.png");

  let chooser = null;
  const origOnMessage = ws.onmessage;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === "Page.fileChooserOpened") chooser = m.params; origOnMessage(e); };
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  const attach = async (file) => {
    chooser = null;
    // userGesture: the browser only opens a file chooser for a real user click
    await send("Runtime.evaluate", { expression: `document.querySelector('[aria-label="Add Attachment"]').click()`, userGesture: true });
    for (let i = 0; i < 20 && !chooser; i++) await sleep(250);
    if (!chooser) { say("   (file chooser did not open)"); return; }
    say("   file chooser opened");
    await send("DOM.setFileInputFiles", { backendNodeId: chooser.backendNodeId, files: [file] });
    await sleep(2500);
  };

  if (BAD) {
    await attach(BAD);
    say("2) after attaching an unsupported file -> chips: " + JSON.stringify(await js(`[...document.querySelectorAll('[class*=attachment]')].map(e => e.innerText.trim()).filter(Boolean)`)));
    await shot("up-bad.png");
  } else {
    await attach(FILE);
    say("2) after attaching -> chips: " + JSON.stringify(await js(`[...document.querySelectorAll('[class*=attachment]')].map(e => e.innerText.trim()).filter(Boolean)`)));
    await shot("up-1-attached.png");
    await type("textarea", "Summarize this document.");
    await sleep(500); await pressEnter();
    const t0 = Date.now();
    await waitFor(`(document.querySelector(".aui-md")?.innerText || "").length > 20`, 300000);
    say("3) first text after " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
    let last = -1, stable = 0;
    for (let i = 0; i < 150; i++) { await sleep(2000); const len = await js(`(document.querySelector(".aui-md")?.innerText || "").length`); if (len > 0 && len === last) { if (++stable >= 3) break; } else stable = 0; last = len; }
    say("   finished after " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
    say("4) reply: " + JSON.stringify(await js(`document.querySelector(".aui-md")?.innerText`)));
    say("   user message shows: " + JSON.stringify(await js(`document.querySelector(".aui-user-message-content")?.innerText`)));
    await shot("up-2-reply.png");
  }
  say("JS errors: " + JSON.stringify(errors));
  ws.close(); edge.kill(); process.exit(0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(1); });
