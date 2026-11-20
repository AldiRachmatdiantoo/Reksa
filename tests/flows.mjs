import { Window } from "happy-dom";
import { readFile, readdir, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
import assert from "node:assert/strict";
const win = new Window({ url: "http://localhost:8443" });
for (const key of [
  "window",
  "document",
  "location",
  "localStorage",
  "HTMLElement",
  "HTMLInputElement",
  "Event",
  "MouseEvent",
  "navigator",
])
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? win : win[key],
    configurable: true,
  });
globalThis.innerWidth = 1280;
globalThis.addEventListener = win.addEventListener.bind(win);
globalThis.removeEventListener = win.removeEventListener.bind(win);
win.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__templates = {};
for (const name of await readdir("src/design"))
  globalThis.__templates[`./design/${name}`] = await readFile(`src/design/${name}`, "utf8");
let source = await readFile("src/App.tsx", "utf8");
source = source.replace(/import\.meta\.glob\([^;]+;/, "globalThis.__templates;");
const output = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
await writeFile("src/.flow-test.mjs", output);
try {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: App } = await import("../src/.flow-test.mjs");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(App)));
  const click = async (s) => {
    const n = document.querySelector(s);
    assert.ok(n, `Missing ${s}`);
    await act(async () => n.click());
  };
  const route = async (p) => {
    await act(async () => {
      win.location.hash = p;
      win.dispatchEvent(new win.Event("hashchange"));
    });
  };
  await click("#cookie-essential-btn");
  assert.equal(localStorage.getItem("reksa-cookies"), "penting");
  await route("masuk");
  await click("#tab-register");
  assert.equal(document.querySelector("#name-field").hidden, false);
  await click('[data-role="educator"]');
  assert.match(document.querySelector("#submit-label").textContent, /Portal Guru/);
  await act(async () =>
    document
      .querySelector("#auth-form")
      .dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })),
  );
  assert.match(document.body.textContent, /Portal Guru/);
  await route("belajar");
  await click('[data-minutes="15"]');
  assert.equal(document.querySelector("#timer-display").textContent, "15:00");
  await click("#start-session-btn");
  assert.equal(document.querySelector("#material-open-card").hidden, true);
  await click(".menu-trigger");
  assert.equal(document.querySelector("#material-open-card").hidden, true);
  await click(".menu-trigger");
  await click("#reset-session-btn");
  assert.equal(document.querySelector("#material-open-card").hidden, false);
  await route("foto");
  await click("#simulate-receive-btn");
  assert.equal(document.querySelector("#qr-received-card").hidden, false);
  await route("hasil");
  assert.match(document.body.textContent, /68%/);
  await route("campur");
  const old = document.querySelector("#challenge-prompt").textContent;
  await click("#shuffle-btn");
  assert.notEqual(document.querySelector("#challenge-prompt").textContent, old);
  await route("offline");
  await click("#sync-now-btn");
  assert.match(document.querySelector("#queue-count").textContent, /0/);
  globalThis.innerWidth = 390;
  await act(async () => win.dispatchEvent(new win.Event("resize")));
  await route("belajar");
  await click("#start-session-btn");
  await click("#finish-blurting-btn");
  assert.ok(document.querySelector("#jol-slider"));
  await act(async () => {
    const slider = document.querySelector("#jol-slider");
    slider.value = "42";
    slider.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
  assert.equal(document.querySelector("#jol-value").textContent, "42%");
  await click("#confirm-jol-btn");
  assert.equal(document.querySelector("#capture-unlocked-card").hidden, false);
  await click(".demo-extra .primary");
  assert.match(document.body.textContent, /42%/);
  await act(async () => root.unmount());
  console.log(
    "PASS: desktop and mobile prototype flows, roles, cookies, timer, QR, results, shuffle, offline simulation.",
  );
} finally {
  await unlink("src/.flow-test.mjs");
}
