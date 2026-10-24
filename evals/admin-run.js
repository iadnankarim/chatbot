const { session, say, APP, dir } = require("./admin-flow.js");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEW = path.join(dir, "Admin_Test_Doc.docx");
// the document that gets uploaded and deleted again: a copy of one sample file
require("fs").copyFileSync(path.resolve(process.env.DOCS_DIR ?? path.join(__dirname, "..", "..", "sample-docs"), "NADRA_Biometric_Procedure_UR.docx"), NEW);
const counts = `JSON.stringify({ docRows: document.querySelectorAll("section:nth-of-type(1) tbody tr").length, text: document.querySelector("section")?.querySelector("h2")?.innerText })`;

(async () => {
  // 1) a normal user must not get in
  const e1 = await session("ahmed", async ({ js, send, waitFor, sleep }) => {
    say("1) ahmed: admin link in sidebar: " + (await js(`!!document.querySelector('a[href="/admin"]')`)));
    await send("Page.navigate", { url: APP + "/admin" }); await sleep(5000);
    say("   ahmed opens /admin -> lands on: " + (await js(`location.pathname`)));
  });
  // 2) admin
  const e2 = await session("admin", async ({ js, send, shot, waitFor, sleep }) => {
    say("2) admin: admin link in sidebar: " + (await js(`!!document.querySelector('a[href="/admin"]')`)));
    await js(`document.querySelector('a[href="/admin"]').click()`);
    await waitFor(`location.pathname === "/admin" && document.querySelectorAll("tbody tr").length > 3`, 60000); await sleep(1500);
    say("   on: " + (await js(`location.pathname`)) + " | " + (await js(`document.querySelector("section h2").innerText`)));
    say("   users table rows: " + (await js(`document.querySelectorAll("section:nth-of-type(2) tbody tr").length`)));
    say("   audit users: " + (await js(`[...document.querySelectorAll("section:nth-of-type(3) p.font-medium")].map(e => e.innerText).join(" | ")`)));
    await shot("ad-1-admin.png");
    // open a saved chat
    await js(`(() => { const b = [...document.querySelectorAll("section:nth-of-type(3) li button")].find(b => /messages/.test(b.innerText) && !/^0 /.test(b.innerText.split("\n")[1] ?? "")); b && b.click(); })()`);
    await sleep(2500);
    say("   audit viewer: " + JSON.stringify(await js(`document.querySelector("section:nth-of-type(3) .overflow-y-auto")?.innerText`)));
    await shot("ad-2-audit.png");
    // add a document (visible to Finance only)
    const root = (await send("DOM.getDocument", {})).result.root.nodeId;
    const node = (await send("DOM.querySelector", { nodeId: root, selector: "input[type=file]" })).result.nodeId;
    await send("DOM.setFileInputFiles", { nodeId: node, files: [NEW] });
    await js(`(() => { const sel = document.querySelector("select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(sel, "Finance"); sel.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await sleep(500);
    await js(`[...document.querySelectorAll("button")].find(b => /Add document/.test(b.innerText)).click()`);
    await waitFor(`/Added Admin_Test_Doc/.test(document.querySelector("[role=status]")?.innerText || "")`, 240000); await sleep(1500);
    say("3) after upload -> status: " + (await js(`document.querySelector("[role=status]")?.innerText`)));
    say("   document rows: " + (await js(`[...document.querySelectorAll("section:nth-of-type(1) tbody tr")].map(r => r.innerText.replace(/\s+/g, " ").trim().slice(0, 60)).join(" || ")`)));
    await shot("ad-3-uploaded.png");
    // delete it again
    await js(`document.querySelector('button[aria-label="Delete Admin_Test_Doc.docx"]').click()`);
    await waitFor(`/Deleted Admin_Test_Doc/.test(document.querySelector("[role=status]")?.innerText || "")`, 60000); await sleep(1500);
    say("4) after delete -> status: " + (await js(`document.querySelector("[role=status]")?.innerText`)));
    say("   still listed: " + (await js(`document.body.innerText.includes("Admin_Test_Doc")`)));
    await shot("ad-4-deleted.png");
  });
  say("JS errors: " + JSON.stringify([...e1, ...e2]));
  process.exit(0);
})().catch((e) => { console.log("ERROR", e.stack); process.exit(1); });
