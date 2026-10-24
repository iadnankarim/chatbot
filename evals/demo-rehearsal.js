// Rehearsal of the whole MD demo in ONE browser session, following demo-script.md:
// login -> general chat (English, Urdu) -> file summary -> Knowledge Base (incl. "not found") ->
// admin page with chat audit. Prints a timing and pass/fail table; screenshots go to evals/out/.
// Run against the production build:  BASE_URL=http://localhost:3000 node evals/demo-rehearsal.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.BASE_URL ?? "http://localhost:3000";
const DOCS = path.resolve(process.env.DOCS_DIR ?? path.join(__dirname, "..", "..", "sample-docs"));
const PORT = 9555;
const out = path.join(__dirname, "out");
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const record = (step, seconds, ok, note = "") => {
  rows.push({ step, seconds, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(seconds).padStart(4)} s  ${step}${note ? "\n        " + note : ""}`);
};

(async () => {
  const profile = path.join(out, "edge-profile-rehearsal");
  fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0; const pending = new Map(); const errors = []; const external = []; let chooser = null;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
    if (m.method === "Page.fileChooserOpened") chooser = m.params;
    if (m.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true });
    if (m.method === "Network.requestWillBeSent") {
      const u = m.params.request.url;
      if (!u.startsWith(APP) && !/^(data:|blob:|about:)/.test(u)) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expression, userGesture = false) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture })).result?.result?.value;
  const shot = async (name) => fs.writeFileSync(path.join(out, name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr)) return true; await sleep(400); } return false; };
  const type = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const enter = async () => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: type === "keyDown" ? "\r" : undefined }); };

  await send("Network.enable"); await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Page.setInterceptFileChooserDialog", { enabled: true });

  const login = async (user) => {
    await send("Page.navigate", { url: APP + "/login" });
    await waitFor(`!!document.querySelector("input[type=password]")`, 60000); await sleep(3500);
    for (let i = 0; i < 12; i++) {
      await type("input[autocomplete=username]", user); await type("input[type=password]", process.env.DEMO_PASSWORD ?? "Plpa@2026"); await sleep(700);
      if (await js(`!document.querySelector("button[type=submit]").disabled`)) break; await sleep(2000);
    }
    if (await js(`document.querySelector("button[type=submit]").disabled`)) {
      console.log("   (login form never became active) JS errors:", JSON.stringify(errors.slice(0, 3)), "| readyState:", await js("document.readyState"), "| scripts loaded:", await js(`performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).length`));
    }
    await js(`document.querySelector("button[type=submit]").click()`);
    await waitFor(`location.pathname === "/" || location.pathname === "/admin"`, 60000);
    await waitFor(`!!document.querySelector("textarea")`, 60000); await sleep(3000);
  };
  const lastReply = () => js(`(() => { const l = [...document.querySelectorAll(".aui-md")]; return l.length ? l[l.length - 1].innerText : ""; })()`);
  const replyCount = () => js(`document.querySelectorAll(".aui-md").length`);

  // Sends the typed text (or clicks a suggestion), waits for a NEW reply and for it to stop growing.
  const ask = async (label, text, { suggestion, check, attach } = {}) => {
    const before = await replyCount();
    const t0 = Date.now();
    if (attach) {
      chooser = null;
      await send("Runtime.evaluate", { expression: `document.querySelector('[aria-label="Add Attachment"]').click()`, userGesture: true });
      for (let i = 0; i < 20 && !chooser; i++) await sleep(250);
      if (!chooser) return record(label, 0, false, "file chooser did not open");
      await send("DOM.setFileInputFiles", { backendNodeId: chooser.backendNodeId, files: [attach] }); await sleep(2000);
    }
    if (suggestion) await js(`[...document.querySelectorAll(".aui-thread-welcome-suggestion")][${suggestion - 1}].click()`);
    else { await type("textarea", text); await sleep(300); await enter(); }
    const got = await waitFor(`document.querySelectorAll(".aui-md").length > ${before} && document.querySelectorAll(".aui-md")[document.querySelectorAll(".aui-md").length - 1].innerText.length > 2`, 420000);
    let last = -1, stable = 0;
    while (got && stable < 3) { await sleep(2000); const len = (await lastReply()).length; stable = len === last ? stable + 1 : 0; last = len; }
    const reply = (await lastReply()).replace(/\s+/g, " ").trim();
    const seconds = Math.round((Date.now() - t0) / 1000);
    const ok = got && (check ? check(reply) : reply.length > 10);
    record(label, seconds, ok, reply.slice(0, 170));
    return reply;
  };
  const newChat = async () => { await js(`[...document.querySelectorAll("aside button, aside a")].find((e) => e.innerText.trim() === "New")?.click()`); await sleep(2500); };

  // ---- A. login
  let t = Date.now(); await login("ahmed");
  record("A. Login as ahmed (Operations)", Math.round((Date.now() - t) / 1000), (await js(`document.querySelector("aside")?.innerText.includes("Ahmed Khan")`)) === true);
  await shot("rehearsal-1-home.png");

  // ---- B. general chat
  await ask("B1. General chat, English suggestion", "", { suggestion: 1, check: (r) => /subject|dear|leave|regards/i.test(r) });
  await shot("rehearsal-2-english-chat.png");
  await newChat();
  await ask("B2. General chat, Urdu", "چھٹی کی درخواست کا ایک مختصر رسمی خط لکھیں", { check: (r) => /[\u0600-\u06FF]{20,}/.test(r) });
  await shot("rehearsal-3-urdu-chat.png");

  // ---- C. file summary
  await newChat();
  await ask("C. Attach the fee schedule PDF and summarize it", "Summarize this document.", { attach: path.join(DOCS, "NADRA_Fee_Schedule_EN.pdf"), check: (r) => /750/.test(r) && /1,500/.test(r) });
  await shot("rehearsal-4-file-summary.png");

  // ---- D. Knowledge Base
  await newChat();
  await js(`[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Knowledge Base").click()`); await sleep(1500);
  const kb = [
    ["D1. KB: CNIC urgent fee", "What is the fee for a new CNIC under urgent service?", (r) => /1,500/.test(r) && /Fee_Schedule/.test(r) && /page 1/.test(r)],
    ["D2. KB: annual leave", "How many days of annual leave does an employee get?", (r) => /30/.test(r) && /Leave_Policy/.test(r)],
    ["D3. KB: Urdu, CNIC validity", "شناختی کارڈ کی میعاد کتنی ہوتی ہے؟", (r) => /10|۱۰/.test(r) && /CNIC_Guide_UR/.test(r)],
    ["D4. KB: PLPA Act, comes into force", "When does the Pakistan Land Port Authority Act come into force?", (r) => /at once/i.test(r) && /PLPA_Bill/.test(r)],
    ["D5. KB: PLPA ERP, number of modules", "How many modules does the PLPA ERP platform cover?", (r) => /21/.test(r) && /PLPA_ERP/.test(r)],
    ["D6. KB: PLPA ERP, Stakeholder Portal phase", "Which phase includes the Stakeholder Portal and what are its dates?", (r) => /phase 2/i.test(r) && /PLPA_ERP/.test(r)],
    ["D7. KB: not in the documents (passport fee)", "What is the passport renewal fee?", (r) => /not found/i.test(r) && !/Sources/.test(r)],
    ["D8. KB: not in the documents (ERP budget)", "What is the total budget for the ERP project?", (r) => /not found/i.test(r) && !/Sources/.test(r)],
  ];
  for (const [label, q, check] of kb) await ask(label, q, { check });
  await shot("rehearsal-5-knowledge-base.png");

  // ---- E. history survives a refresh
  await js(`location.reload()`); await waitFor(`!!document.querySelector("textarea")`, 60000); await sleep(6000);
  const titles = await js(`document.querySelector("aside")?.innerText`);
  record("E. After a refresh the earlier chats are still listed", 0, /What is the fee|annual leave|passport|Summarize|Draft a polite/i.test(titles ?? ""), (titles ?? "").replace(/\s+/g, " ").slice(0, 150));
  await shot("rehearsal-6-after-refresh.png");

  // ---- F. admin
  await js(`document.querySelector('button[aria-label="Log out"]').click()`); await waitFor(`location.pathname === "/login"`, 20000);
  await login("admin");
  await send("Page.navigate", { url: APP + "/admin" });
  await waitFor(`location.pathname === "/admin" && document.querySelectorAll("tbody tr").length > 3`, 60000); await sleep(3000);
  const adminText = (await js(`document.body.innerText`)) ?? "";
  record("F1. Admin page lists the documents", 0, /PLPA_ERP_Terms_of_Reference/.test(adminText) && /Users \(4\)/.test(adminText));
  record("F2. Chat audit shows ahmed's chats", 0, /Ahmed Khan/.test(adminText) && /messages/.test(adminText));
  await shot("rehearsal-7-admin.png");

  // ---- G. offline proof
  record("G. No request left localhost during the whole session", 0, external.length === 0, external.slice(0, 3).join(", "));
  record("H. No JavaScript errors in the browser", 0, errors.length === 0, errors.slice(0, 2).join(" | "));

  const failed = rows.filter((r) => !r.ok);
  const total = rows.reduce((n, r) => n + r.seconds, 0);
  console.log(`\n${rows.length - failed.length}/${rows.length} steps passed, ${Math.round(total / 60)} min of waiting in total`);
  if (failed.length) console.log("Failed: " + failed.map((f) => f.step).join("; "));
  ws.close(); edge.kill();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(2); });
