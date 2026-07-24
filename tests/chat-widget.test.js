import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initChatWidget,
  renderAnswer,
  resolveEndpoint,
  PLACEHOLDER_ENDPOINT,
} from "../js/chat-widget.js";

// Flush pending microtasks so async render assertions after `await ask()` /
// fetch resolution are stable.
const flush = () => new Promise((r) => setTimeout(r, 0));

function okResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("resolveEndpoint (config resolution order)", () => {
  it("prefers an explicit option", () => {
    const win = { ADSC_CHAT_ENDPOINT: "https://from-window/ask", document: null };
    expect(resolveEndpoint({ endpoint: "https://explicit/ask" }, win)).toBe(
      "https://explicit/ask"
    );
  });
  it("falls back to window.ADSC_CHAT_ENDPOINT", () => {
    const win = { ADSC_CHAT_ENDPOINT: "https://from-window/ask", document: null };
    expect(resolveEndpoint({}, win)).toBe("https://from-window/ask");
  });
  it("reads data-endpoint off a script tag when no option/window value", () => {
    const script = document.createElement("script");
    script.setAttribute("data-endpoint", "https://from-script/ask");
    document.body.appendChild(script);
    expect(resolveEndpoint({}, { document })).toBe("https://from-script/ask");
    script.remove();
  });
  it("falls back to the labeled placeholder", () => {
    expect(resolveEndpoint({}, { document })).toBe(PLACEHOLDER_ENDPOINT);
  });
});

describe("initChatWidget rendering + states", () => {
  let container;
  let fetchMock;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.body;
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("injects the bubble/button into the DOM without opening the panel", () => {
    const w = initChatWidget({ container, fetch: fetchMock });
    const bubble = document.querySelector(".adsc-chat-bubble");
    const panel = document.querySelector(".adsc-chat-panel");
    expect(bubble).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(w.isOpen()).toBe(false);
    expect(panel.getAttribute("data-open")).toBe("false");
    // No network call fires on init.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opening the panel reveals the input", () => {
    const w = initChatWidget({ container, fetch: fetchMock });
    const bubble = document.querySelector(".adsc-chat-bubble");
    bubble.click();
    expect(w.isOpen()).toBe(true);
    expect(document.querySelector(".adsc-chat-panel").getAttribute("data-open")).toBe("true");
    expect(document.querySelector(".adsc-chat-input")).toBeTruthy();
  });

  it("submitting a question calls fetch with the right URL and JSON body", async () => {
    fetchMock.mockResolvedValue(okResponse({ answer: "Hi", citations: [], refused: false }));
    const w = initChatWidget({ container, endpoint: "https://ep/ask", fetch: fetchMock });
    w.open();
    const input = document.querySelector(".adsc-chat-input");
    const form = document.querySelector(".adsc-chat-form");
    input.value = "How do mixers work?";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ep/ask");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ question: "How do mixers work?" });
    // User's message echoed as text.
    expect(document.querySelector(".adsc-chat-msg--user").textContent).toBe(
      "How do mixers work?"
    );
  });

  it("renders a successful answer as TEXT, never as injected HTML (XSS-safe)", async () => {
    const evil = '<img src=x onerror="window.__pwned=1"> hello';
    fetchMock.mockResolvedValue(
      okResponse({ answer: evil, citations: [], refused: false })
    );
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("hi");
    await flush();

    const bot = document.querySelector(".adsc-chat-msg--bot .adsc-chat-answer");
    expect(bot.textContent).toBe(evil);
    // The literal string is present as text, but NO <img> node was created.
    expect(document.querySelector(".adsc-chat-log img")).toBeNull();
    expect(window.__pwned).toBeUndefined();
  });

  it("renders citations as anchors with correct href/text, target and rel", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        answer: "Grounded answer.",
        citations: [
          { title: "FAQ: Mixers", url: "faq.html#mixers" },
          { title: "Blog post", url: "blog/detail.html?slug=x" },
        ],
        refused: false,
      })
    );
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("mixers?");
    await flush();

    const links = document.querySelectorAll(".adsc-chat-cite-link");
    expect(links.length).toBe(2);
    expect(links[0].textContent).toBe("FAQ: Mixers");
    expect(links[0].getAttribute("href")).toBe("faq.html#mixers");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener");
    expect(links[1].getAttribute("href")).toBe("blog/detail.html?slug=x");
  });

  it("renders a successful answer with NO citations cleanly", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ answer: "No sources here.", citations: [], refused: false })
    );
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("hi");
    await flush();
    expect(document.querySelector(".adsc-chat-msg--bot .adsc-chat-answer").textContent).toBe(
      "No sources here."
    );
    expect(document.querySelector(".adsc-chat-cite-link")).toBeNull();
  });

  it("renders a refusal as a notice with no citation links", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        answer: "I can't give medical advice. Please consult a professional.",
        citations: [],
        refused: true,
      })
    );
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("is my kid autistic?");
    await flush();

    const notice = document.querySelector(".adsc-chat-msg--notice");
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain("medical advice");
    expect(document.querySelector(".adsc-chat-msg--bot")).toBeNull();
    expect(document.querySelector(".adsc-chat-cite-link")).toBeNull();
  });

  it("renders the friendly rate-limit message on HTTP 429", async () => {
    fetchMock.mockResolvedValue(okResponse({ error: "rate_limited" }, 429));
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("hi");
    await flush();

    const err = document.querySelector(".adsc-chat-msg--error");
    expect(err).toBeTruthy();
    expect(err.textContent.toLowerCase()).toContain("too fast");
  });

  it("renders an error state with a retry option when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("hi");
    await flush();

    const err = document.querySelector(".adsc-chat-msg--error");
    expect(err).toBeTruthy();
    expect(err.querySelector(".adsc-chat-retry")).toBeTruthy();
  });

  it("shows the loading indicator during the call and clears it after", async () => {
    let resolveFetch;
    fetchMock.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      })
    );
    const w = initChatWidget({ container, fetch: fetchMock });
    const p = w.ask("hi");

    // Mid-flight: loading indicator present.
    expect(document.querySelector("[data-loading='true']")).toBeTruthy();

    resolveFetch(okResponse({ answer: "done", citations: [], refused: false }));
    await p;
    await flush();

    // After completion: loading gone, answer present.
    expect(document.querySelector("[data-loading='true']")).toBeNull();
    expect(document.querySelector(".adsc-chat-msg--bot .adsc-chat-answer").textContent).toBe(
      "done"
    );
  });

  it("clears loading even when the request errors", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const w = initChatWidget({ container, fetch: fetchMock });
    await w.ask("hi");
    await flush();
    expect(document.querySelector("[data-loading='true']")).toBeNull();
  });
});

describe("renderAnswer (pure helper)", () => {
  let host;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  it("escapes model output via textContent", () => {
    renderAnswer(host, { answer: "<script>alert(1)</script>", citations: [], refused: false });
    expect(host.querySelector(".adsc-chat-answer").textContent).toBe(
      "<script>alert(1)</script>"
    );
    expect(host.querySelector("script")).toBeNull();
  });

  it("skips citations that lack a url", () => {
    renderAnswer(host, {
      answer: "x",
      citations: [{ title: "no url" }, { title: "ok", url: "u" }],
      refused: false,
    });
    const links = host.querySelectorAll(".adsc-chat-cite-link");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("u");
  });

  it("uses the url as the label when title is missing", () => {
    renderAnswer(host, { answer: "x", citations: [{ url: "u" }], refused: false });
    expect(host.querySelector(".adsc-chat-cite-link").textContent).toBe("u");
  });
});
