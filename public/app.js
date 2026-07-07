/*
=========================================================
BondStats AI
Financial Chat Client
Version 1.0.0
=========================================================
*/

const form = document.querySelector("#chatForm");
const promptInput = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const thinking = document.querySelector("#thinking");
const sendBtn = document.querySelector("#sendBtn");
const clearBtn = document.querySelector("#clearBtn");
const engineStatus = document.querySelector("#engineStatus");
const engineStatusText = document.querySelector("#engineStatusText");

let busy = false;


/*
=========================================================
SAFE HTML
=========================================================
*/

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/*
=========================================================
SCROLL
=========================================================
*/

function scrollToBottom() {
  if (!messages) return;

  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}


/*
=========================================================
TEXTAREA RESIZE
=========================================================
*/

function resizeInput() {
  if (!promptInput) return;

  promptInput.style.height = "auto";

  const nextHeight = Math.min(
    promptInput.scrollHeight,
    180
  );

  promptInput.style.height = `${nextHeight}px`;
}


/*
=========================================================
BUSY STATE
=========================================================
*/

function setBusy(value) {
  busy = Boolean(value);

  if (sendBtn) {
    sendBtn.disabled = busy;
  }

  if (promptInput) {
    promptInput.disabled = busy;
  }

  if (thinking) {
    thinking.classList.toggle(
      "hidden",
      !busy
    );
  }

  if (busy) {
    scrollToBottom();
  }
}


/*
=========================================================
ENGINE STATUS
=========================================================
*/

function setEngineStatus(
  online,
  text
) {
  if (!engineStatus || !engineStatusText) {
    return;
  }

  engineStatusText.textContent = text;

  engineStatus.dataset.online =
    online ? "true" : "false";

  const dot =
    engineStatus.querySelector(".status-dot");

  if (!dot) return;

  if (online) {
    dot.style.background = "var(--green)";
    dot.style.boxShadow =
      "0 0 12px var(--green)";
  } else {
    dot.style.background = "var(--danger)";
    dot.style.boxShadow =
      "0 0 12px var(--danger)";
  }
}


/*
=========================================================
HEALTH CHECK
=========================================================
*/

async function checkEngineHealth() {
  try {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, 7000);

    const response =
      await fetch("/api/health", {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        signal: controller.signal,
        cache: "no-store"
      });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(
        `Health check failed: ${response.status}`
      );
    }

    const data =
      await response.json();

    if (data?.ok === true) {
      setEngineStatus(
        true,
        "Analysis Engine Online"
      );

      return true;
    }

    throw new Error(
      "Invalid health response"
    );

  } catch (error) {
    console.warn(
      "Engine health check failed:",
      error
    );

    setEngineStatus(
      false,
      "Engine Offline"
    );

    return false;
  }
}


/*
=========================================================
CREATE USER MESSAGE
=========================================================
*/

function addUserMessage(text) {
  if (!messages) return;

  const article =
    document.createElement("article");

  article.className =
    "message user-message";

  article.innerHTML = `
    <div class="message-bubble">

      <span class="message-speaker">
        YOU
      </span>

      <p>
        ${escapeHTML(text)}
      </p>

    </div>
  `;

  messages.appendChild(article);

  scrollToBottom();
}


/*
=========================================================
CREATE ASSISTANT MESSAGE
=========================================================
*/

function addAssistantMessage(data) {
  if (!messages) return;

  const article =
    document.createElement("article");

  article.className =
    "message assistant-message";

  const blocks = [
    [
      "WHY IT MATTERS",
      data?.why
    ],
    [
      "MECHANISM",
      data?.mechanism
    ],
    [
      "COUNTERCASE",
      data?.countercase
    ],
    [
      "CONFIDENCE",
      data?.confidence
    ],
    [
      "WHAT WOULD CHANGE THE VIEW",
      data?.change
    ]
  ];

  article.innerHTML = `
    <div
      class="assistant-avatar"
      aria-hidden="true"
    >
      AI
    </div>

    <div class="message-bubble">

      <span class="message-speaker">
        BONDSTATS AI
      </span>

      <p>
        ${escapeHTML(
          data?.answer ||
          "No analysis was returned."
        )}
      </p>

      <div class="analysis-grid">

        ${blocks
          .filter(
            ([, content]) =>
              typeof content === "string" &&
              content.trim()
          )
          .map(
            ([title, content]) => `
              <div class="analysis-block">

                <strong>
                  ${escapeHTML(title)}
                </strong>

                <p>
                  ${escapeHTML(content)}
                </p>

              </div>
            `
          )
          .join("")}

      </div>

      ${
        data?.disclaimer
          ? `
            <p class="disclaimer">
              ${escapeHTML(
                data.disclaimer
              )}
            </p>
          `
          : ""
      }

    </div>
  `;

  messages.appendChild(article);

  scrollToBottom();
}


/*
=========================================================
ERROR MESSAGE
=========================================================
*/

function addErrorMessage(text) {
  if (!messages) return;

  const article =
    document.createElement("article");

  article.className =
    "message assistant-message";

  article.innerHTML = `
    <div
      class="assistant-avatar"
      aria-hidden="true"
    >
      AI
    </div>

    <div
      class="
        message-bubble
        error-bubble
      "
    >

      <span class="message-speaker">
        ANALYSIS ERROR
      </span>

      <p>
        ${escapeHTML(text)}
      </p>

    </div>
  `;

  messages.appendChild(article);

  scrollToBottom();
}


/*
=========================================================
API REQUEST
=========================================================
*/

async function askFinancialAI(message) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 30000);

  try {
    const response =
      await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Accept":
            "application/json"
        },

        body:
          JSON.stringify({
            message
          }),

        signal:
          controller.signal,

        cache:
          "no-store"
      });

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `Request failed with status ${response.status}`
      );
    }

    if (
      !data ||
      typeof data.answer !== "string"
    ) {
      throw new Error(
        "Invalid analysis response"
      );
    }

    return data;

  } finally {
    clearTimeout(timeout);
  }
}


/*
=========================================================
SUBMIT MESSAGE
=========================================================
*/

async function submitMessage() {
  if (busy) {
    return;
  }

  if (!promptInput) {
    return;
  }

  const message =
    promptInput.value.trim();

  if (!message) {
    promptInput.focus();
    return;
  }

  addUserMessage(message);

  promptInput.value = "";

  resizeInput();

  setBusy(true);

  try {
    const data =
      await askFinancialAI(message);

    addAssistantMessage(data);

    setEngineStatus(
      true,
      "Analysis Engine Online"
    );

  } catch (error) {
    console.error(
      "Chat request failed:",
      error
    );

    if (
      error?.name === "AbortError"
    ) {
      addErrorMessage(
        "The analysis timed out. Please try again."
      );
    } else {
      addErrorMessage(
        "The analysis engine could not respond. Please try again."
      );
    }

    setEngineStatus(
      false,
      "Engine Connection Error"
    );

  } finally {
    setBusy(false);

    promptInput.focus();
  }
}


/*
=========================================================
FORM SUBMIT
=========================================================
*/

if (form) {
  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      await submitMessage();
    }
  );
}


/*
=========================================================
ENTER TO SEND
SHIFT + ENTER FOR NEW LINE
=========================================================
*/

if (promptInput) {
  promptInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();

        if (form?.requestSubmit) {
          form.requestSubmit();
        } else {
          submitMessage();
        }
      }
    }
  );
}


/*
=========================================================
AUTO RESIZE
=========================================================
*/

if (promptInput) {
  promptInput.addEventListener(
    "input",
    resizeInput
  );
}


/*
=========================================================
NEW SESSION
=========================================================
*/

function resetSession() {
  if (!messages) return;

  messages.innerHTML = `
    <article
      class="
        message
        assistant-message
      "
    >

      <div
        class="assistant-avatar"
        aria-hidden="true"
      >
        AI
      </div>

      <div class="message-bubble">

        <span class="message-speaker">
          BONDSTATS AI
        </span>

        <p>
          New session ready.
          Ask a question about markets,
          monetary policy, bonds,
          inflation, risk or
          macroeconomics.
        </p>

      </div>

    </article>
  `;

  if (promptInput) {
    promptInput.value = "";

    resizeInput();

    promptInput.focus();
  }

  scrollToBottom();
}


/*
=========================================================
CLEAR BUTTON
=========================================================
*/

if (clearBtn) {
  clearBtn.addEventListener(
    "click",
    resetSession
  );
}


/*
=========================================================
INITIALIZATION
=========================================================
*/

async function initializeApp() {
  resizeInput();

  setBusy(false);

  await checkEngineHealth();

  if (promptInput) {
    promptInput.focus();
  }
}


/*
=========================================================
START
=========================================================
*/

initializeApp();
