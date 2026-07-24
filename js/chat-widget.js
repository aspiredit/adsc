/**
 * ADSC chat widget — a self-contained, dependency-free floating chat bubble.
 *
 * Slice D of the RAG chat assistant (issues/015-rag-chat-assistant.md). It is
 * strictly ADDITIVE: a position:fixed bubble in the bottom-right corner that
 * toggles a chat panel. It never touches page layout/flow, and all of its
 * styles live in an injected <style> block scoped under the `.adsc-chat-`
 * prefix so they cannot leak into the rest of the site.
 *
 * It talks to the Worker endpoint (frozen contract):
 *   POST {endpoint}  body: { "question": "..." }
 *   200 success:  { answer, citations: [{title,url}], refused: false }
 *   200 refusal:  { answer, citations: [], refused: true }
 *   429:          { error: "rate_limited" }
 *
 * SECURITY: the model's `answer` and every citation label are rendered with
 * `.textContent` only — NEVER innerHTML — so a malicious/model-injected string
 * like `<img onerror=...>` shows up as literal text and cannot execute.
 *
 * Structured as an ES module for jsdom/vitest: `initChatWidget(options)` builds
 * the DOM into a container (default document.body) and returns a small handle;
 * `renderAnswer(container, data)` is a pure-ish helper unit-tested in isolation.
 * Auto-init is guarded so importing the module in a test fires no network call.
 */

// TODO(slice C): real workers.dev URL
export const PLACEHOLDER_ENDPOINT = "https://adsc-chat.example.workers.dev/ask";

const CSS = `
.adsc-chat-root { position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;
  font-family: inherit; font-size: 16px; line-height: 1.4; }
.adsc-chat-root * { box-sizing: border-box; }
.adsc-chat-bubble { width: 60px; height: 60px; border-radius: 50%; border: none;
  background: #1f6feb; color: #fff; font-size: 26px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25); display: flex; align-items: center;
  justify-content: center; }
.adsc-chat-bubble:focus-visible { outline: 3px solid #ffd33d; outline-offset: 2px; }
.adsc-chat-panel { position: absolute; bottom: 72px; right: 0; width: 340px;
  max-width: calc(100vw - 40px); height: 460px; max-height: calc(100vh - 120px);
  background: #fff; color: #111; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.3); display: none; flex-direction: column;
  overflow: hidden; }
.adsc-chat-panel[data-open="true"] { display: flex; }
.adsc-chat-header { background: #1f6feb; color: #fff; padding: 12px 14px;
  font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
.adsc-chat-close { background: transparent; border: none; color: #fff; font-size: 20px;
  cursor: pointer; line-height: 1; }
.adsc-chat-log { flex: 1 1 auto; overflow-y: auto; padding: 12px; display: flex;
  flex-direction: column; gap: 10px; }
.adsc-chat-msg { padding: 8px 10px; border-radius: 10px; max-width: 90%;
  white-space: pre-wrap; word-wrap: break-word; }
.adsc-chat-msg--user { align-self: flex-end; background: #1f6feb; color: #fff; }
.adsc-chat-msg--bot { align-self: flex-start; background: #eef1f5; color: #111; }
.adsc-chat-msg--notice { align-self: flex-start; background: #fff7e6; color: #5a4300;
  border: 1px solid #f0c66b; }
.adsc-chat-msg--error { align-self: flex-start; background: #fdecea; color: #7a1c12;
  border: 1px solid #f3b4ad; }
.adsc-chat-cites { margin: 6px 0 0; padding: 0; list-style: none; display: flex;
  flex-direction: column; gap: 2px; }
.adsc-chat-cite-link { color: #1f6feb; text-decoration: underline; font-size: 14px; }
.adsc-chat-loading { align-self: flex-start; color: #555; font-style: italic; }
.adsc-chat-dot { animation: adsc-chat-blink 1s infinite; }
.adsc-chat-dot:nth-child(2) { animation-delay: 0.2s; }
.adsc-chat-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes adsc-chat-blink { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
.adsc-chat-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #e2e6eb; }
.adsc-chat-input { flex: 1 1 auto; padding: 8px 10px; border: 1px solid #c9ced6;
  border-radius: 8px; font: inherit; }
.adsc-chat-send { padding: 8px 14px; border: none; border-radius: 8px;
  background: #1f6feb; color: #fff; cursor: pointer; }
.adsc-chat-send:disabled { opacity: 0.5; cursor: default; }
.adsc-chat-retry { margin-top: 6px; background: transparent; border: 1px solid #7a1c12;
  color: #7a1c12; border-radius: 6px; padding: 4px 8px; cursor: pointer; font: inherit;
  font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .adsc-chat-dot { animation: none; } }
`;

const STYLE_ID = "adsc-chat-styles";

/**
 * Resolve the endpoint URL, in priority order:
 *   1. an explicit `options.endpoint`
 *   2. `window.ADSC_CHAT_ENDPOINT`
 *   3. a `data-endpoint` attribute on the currently-executing <script> tag
 *   4. the clearly-labeled placeholder above
 */
export function resolveEndpoint(options = {}, win = typeof window !== "undefined" ? window : undefined) {
  if (options && typeof options.endpoint === "string" && options.endpoint.trim()) {
    return options.endpoint.trim();
  }
  if (win && typeof win.ADSC_CHAT_ENDPOINT === "string" && win.ADSC_CHAT_ENDPOINT.trim()) {
    return win.ADSC_CHAT_ENDPOINT.trim();
  }
  const doc = win && win.document ? win.document : (typeof document !== "undefined" ? document : undefined);
  if (doc) {
    // Prefer document.currentScript (set while the module's host <script> runs),
    // else fall back to any script tag carrying data-endpoint.
    const cur = doc.currentScript;
    if (cur && cur.getAttribute && cur.getAttribute("data-endpoint")) {
      return cur.getAttribute("data-endpoint").trim();
    }
    const tagged = doc.querySelector && doc.querySelector("script[data-endpoint]");
    if (tagged && tagged.getAttribute("data-endpoint")) {
      return tagged.getAttribute("data-endpoint").trim();
    }
  }
  return PLACEHOLDER_ENDPOINT;
}

function injectStyles(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * Append a user question bubble (rendered as text) to the log.
 */
export function renderUserMessage(container, question) {
  const doc = container.ownerDocument;
  const el = doc.createElement("div");
  el.className = "adsc-chat-msg adsc-chat-msg--user";
  el.textContent = String(question == null ? "" : question);
  container.appendChild(el);
  return el;
}

/**
 * Render a Worker response into `container`.
 *
 * SECURITY-CRITICAL: `data.answer` and citation titles are assigned via
 * `.textContent` only. No branch of this function ever uses innerHTML, so
 * model output cannot inject markup or execute script.
 *
 * @param {Element} container
 * @param {{answer?: string, citations?: Array<{title?:string,url?:string}>, refused?: boolean}} data
 * @returns {Element} the appended message node
 */
export function renderAnswer(container, data) {
  const doc = container.ownerDocument;
  const d = data || {};
  const refused = d.refused === true;

  const msg = doc.createElement("div");
  msg.className = "adsc-chat-msg " + (refused ? "adsc-chat-msg--notice" : "adsc-chat-msg--bot");
  if (refused) msg.setAttribute("role", "note");

  const answer = doc.createElement("div");
  answer.className = "adsc-chat-answer";
  // textContent — never innerHTML — so `<img onerror=...>` renders as literal text.
  answer.textContent = typeof d.answer === "string" ? d.answer : "";
  msg.appendChild(answer);

  // Refusals carry no citations by contract; only render links for grounded answers.
  const citations = Array.isArray(d.citations) ? d.citations : [];
  if (!refused && citations.length) {
    const list = doc.createElement("ul");
    list.className = "adsc-chat-cites";
    citations.forEach((c) => {
      if (!c || typeof c.url !== "string" || !c.url) return;
      const li = doc.createElement("li");
      const a = doc.createElement("a");
      a.className = "adsc-chat-cite-link";
      a.href = c.url;
      a.target = "_blank";
      a.rel = "noopener";
      // Label via textContent; fall back to the URL when title is missing.
      a.textContent = typeof c.title === "string" && c.title ? c.title : c.url;
      li.appendChild(a);
      list.appendChild(li);
    });
    if (list.childNodes.length) msg.appendChild(list);
  }

  container.appendChild(msg);
  return msg;
}

/**
 * Render a friendly error message with a retry button.
 */
export function renderError(container, message, onRetry) {
  const doc = container.ownerDocument;
  const el = doc.createElement("div");
  el.className = "adsc-chat-msg adsc-chat-msg--error";
  el.setAttribute("role", "alert");
  const text = doc.createElement("div");
  text.textContent = message;
  el.appendChild(text);
  if (typeof onRetry === "function") {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "adsc-chat-retry";
    btn.textContent = "Try again";
    btn.addEventListener("click", () => onRetry());
    el.appendChild(btn);
  }
  container.appendChild(el);
  return el;
}

const RATE_LIMIT_MESSAGE =
  "You're sending messages too fast. Please wait a moment and try again.";
const NETWORK_ERROR_MESSAGE =
  "Sorry — something went wrong reaching the assistant. Please try again.";

/**
 * Initialize the chat widget.
 *
 * @param {Object} [options]
 * @param {string}  [options.endpoint] explicit endpoint URL (highest priority)
 * @param {Element} [options.container] where to mount (default: document.body)
 * @param {Function}[options.fetch] fetch impl override (for tests)
 * @param {string}  [options.title] header title text
 * @returns {{root:Element, open:Function, close:Function, toggle:Function,
 *            ask:Function, isOpen:Function, destroy:Function, endpoint:string}}
 */
export function initChatWidget(options = {}) {
  const container = options.container || (typeof document !== "undefined" ? document.body : null);
  if (!container) throw new Error("initChatWidget: no container / document available");
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : undefined);
  const endpoint = resolveEndpoint(options, win);
  const fetchImpl =
    options.fetch || (win && win.fetch) || (typeof fetch !== "undefined" ? fetch : null);

  injectStyles(doc);

  const root = doc.createElement("div");
  root.className = "adsc-chat-root";

  // Bubble toggle button
  const bubble = doc.createElement("button");
  bubble.type = "button";
  bubble.className = "adsc-chat-bubble";
  bubble.setAttribute("aria-label", "Open chat assistant");
  bubble.setAttribute("aria-expanded", "false");
  bubble.textContent = "💬";

  // Panel
  const panel = doc.createElement("div");
  panel.className = "adsc-chat-panel";
  panel.setAttribute("data-open", "false");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat assistant");

  const header = doc.createElement("div");
  header.className = "adsc-chat-header";
  const heading = doc.createElement("span");
  heading.textContent = options.title || "Ask ADSC";
  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "adsc-chat-close";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.textContent = "×";
  header.appendChild(heading);
  header.appendChild(closeBtn);

  const log = doc.createElement("div");
  log.className = "adsc-chat-log";
  log.setAttribute("aria-live", "polite");

  const form = doc.createElement("form");
  form.className = "adsc-chat-form";
  const input = doc.createElement("input");
  input.type = "text";
  input.className = "adsc-chat-input";
  input.setAttribute("aria-label", "Type your question");
  input.placeholder = "Ask a question…";
  const send = doc.createElement("button");
  send.type = "submit";
  send.className = "adsc-chat-send";
  send.textContent = "Send";
  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(header);
  panel.appendChild(log);
  panel.appendChild(form);
  root.appendChild(bubble);
  root.appendChild(panel);
  container.appendChild(root);

  let loadingEl = null;
  let busy = false;

  function isOpen() {
    return panel.getAttribute("data-open") === "true";
  }
  function open() {
    panel.setAttribute("data-open", "true");
    bubble.setAttribute("aria-expanded", "true");
    bubble.setAttribute("aria-label", "Close chat assistant");
    input.focus();
  }
  function close() {
    panel.setAttribute("data-open", "false");
    bubble.setAttribute("aria-expanded", "false");
    bubble.setAttribute("aria-label", "Open chat assistant");
  }
  function toggle() {
    isOpen() ? close() : open();
  }

  function showLoading() {
    hideLoading();
    loadingEl = doc.createElement("div");
    loadingEl.className = "adsc-chat-msg adsc-chat-msg--bot adsc-chat-loading";
    loadingEl.setAttribute("data-loading", "true");
    loadingEl.setAttribute("aria-label", "Assistant is typing");
    ["·", "·", "·"].forEach(() => {
      const dot = doc.createElement("span");
      dot.className = "adsc-chat-dot";
      dot.textContent = "•";
      loadingEl.appendChild(dot);
    });
    log.appendChild(loadingEl);
    log.scrollTop = log.scrollHeight;
  }
  function hideLoading() {
    if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
    loadingEl = null;
  }

  function setBusy(v) {
    busy = v;
    send.disabled = v;
    input.disabled = v;
  }

  /**
   * Ask a question: renders the user bubble + loading state, calls the endpoint,
   * then renders success / refusal / rate-limit / error. Always clears loading.
   */
  async function ask(question) {
    const q = String(question == null ? "" : question).trim();
    if (!q || busy) return;
    renderUserMessage(log, q);
    input.value = "";
    setBusy(true);
    showLoading();
    log.scrollTop = log.scrollHeight;

    try {
      if (!fetchImpl) throw new Error("no fetch available");
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (res && res.status === 429) {
        renderError(log, RATE_LIMIT_MESSAGE);
      } else if (!res || res.ok === false) {
        renderError(log, NETWORK_ERROR_MESSAGE, () => ask(q));
      } else {
        const data = await res.json();
        renderAnswer(log, data);
      }
    } catch (err) {
      renderError(log, NETWORK_ERROR_MESSAGE, () => ask(q));
    } finally {
      hideLoading();
      setBusy(false);
      log.scrollTop = log.scrollHeight;
    }
  }

  bubble.addEventListener("click", toggle);
  closeBtn.addEventListener("click", close);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
  });

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { root, open, close, toggle, isOpen, ask, destroy, endpoint };
}

/**
 * Auto-init guard: only fire in a real browser when a document exists AND the
 * consumer opts in with `window.ADSC_CHAT_AUTOINIT`. Importing this module in a
 * test (or without the flag) never mounts the widget or hits the network.
 */
export function autoInit(win = typeof window !== "undefined" ? window : undefined) {
  if (!win || !win.document || !win.ADSC_CHAT_AUTOINIT) return null;
  const start = () => initChatWidget({});
  if (win.document.readyState === "loading") {
    win.document.addEventListener("DOMContentLoaded", start, { once: true });
    return null;
  }
  return start();
}

autoInit();
