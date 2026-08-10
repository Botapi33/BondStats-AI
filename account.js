"use strict";

/* ============================================================
   BONDSTATS ACCOUNT LAYER
   Auth + Google + Email + persistent chat storage

   IMPORTANT:
   - Does NOT modify app.js
   - Does NOT intercept Enter
   - Does NOT replace submit handlers
   - A failure here must never stop BondStats AI
   ============================================================ */

(() => {
  try {
    /* ========================================================
       CONFIG
       ======================================================== */

    const SUPABASE_URL =
      "https://kiyuawmnmzffqlgvntbv.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_riRSgP_k4LrvrHP9oHMggA_5Ik-Mjwy";


    /* ========================================================
       FAIL-SAFE START
       ======================================================== */

    if (!window.supabase?.createClient) {
      console.warn(
        "[BondStats Account] Supabase library unavailable. AI continues normally."
      );
      return;
    }

    const db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );


    /* ========================================================
       STATE
       ======================================================== */

    let currentUser = null;
    let currentConversationId = null;

    const savedMessageKeys = new Set();


    /* ========================================================
       SAFE HELPERS
       ======================================================== */

    function safeText(value) {
      return typeof value === "string"
        ? value.trim()
        : "";
    }

    function escapeHTML(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function makeMessageKey(role, content) {
      return `${role}:${content}`;
    }

    function getRedirectURL() {
      return (
        window.location.origin +
        window.location.pathname
      );
    }


    /* ========================================================
       STYLES
       ======================================================== */

    function injectStyles() {
      if (
        document.querySelector(
          "#bondstats-account-styles"
        )
      ) {
        return;
      }

      const style =
        document.createElement("style");

      style.id =
        "bondstats-account-styles";

      style.textContent = `
        #bondstats-account-trigger {
          position: fixed;
          top: 18px;
          right: 22px;
          z-index: 9000;
          display: flex;
          align-items: center;
          gap: 9px;
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(126,255,171,.35);
          background: rgba(7,25,18,.88);
          backdrop-filter: blur(14px);
          color: #ecfff2;
          font: 500 13px/1 Arial, sans-serif;
          cursor: pointer;
          box-shadow:
            0 0 0 1px rgba(76,255,137,.04),
            0 8px 28px rgba(0,0,0,.25);
        }

        #bondstats-account-trigger:hover {
          border-color: rgba(126,255,171,.7);
          background: rgba(10,35,23,.96);
        }

        #bondstats-account-trigger .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #72ff9b;
          box-shadow: 0 0 10px #72ff9b;
        }

        #bondstats-account-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99998;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0,0,0,.68);
          backdrop-filter: blur(10px);
        }

        #bondstats-account-modal {
          width: min(410px, 100%);
          padding: 26px;
          border-radius: 22px;
          border: 1px solid rgba(109,255,157,.30);
          background:
            linear-gradient(
              180deg,
              rgba(14,45,30,.98),
              rgba(5,18,13,.99)
            );
          color: #f1fff5;
          box-shadow:
            0 35px 90px rgba(0,0,0,.55),
            0 0 60px rgba(52,255,121,.07);
          font-family: Arial, sans-serif;
        }

        .bondstats-account-title {
          margin: 0 0 5px;
          font-size: 22px;
          font-weight: 700;
        }

        .bondstats-account-subtitle {
          margin: 0 0 22px;
          color: rgba(235,255,241,.68);
          font-size: 13px;
          line-height: 1.5;
        }

        #bondstats-google-login {
          width: 100%;
          height: 44px;
          border: 1px solid #8e918f;
          border-radius: 22px;
          background: #131314;
          color: #e3e3e3;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        #bondstats-google-login:hover {
          background: #1e1f20;
        }

        .bondstats-google-g {
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
        }

        .bondstats-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
          color: rgba(230,255,238,.42);
          font-size: 11px;
        }

        .bondstats-divider::before,
        .bondstats-divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: rgba(130,255,170,.15);
        }

        .bondstats-account-input {
          box-sizing: border-box;
          width: 100%;
          height: 44px;
          margin-bottom: 10px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(132,255,173,.22);
          outline: none;
          background: rgba(0,0,0,.28);
          color: #f3fff6;
          font-size: 14px;
        }

        .bondstats-account-input:focus {
          border-color: rgba(116,255,161,.65);
        }

        .bondstats-email-button {
          width: 100%;
          height: 44px;
          margin-top: 2px;
          border: 0;
          border-radius: 12px;
          background: #75ff9b;
          color: #072010;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
        }

        .bondstats-account-secondary {
          width: 100%;
          margin-top: 8px;
          padding: 9px;
          border: 0;
          background: transparent;
          color: rgba(230,255,238,.72);
          cursor: pointer;
          font-size: 12px;
        }

        #bondstats-account-message {
          min-height: 18px;
          margin-top: 12px;
          color: rgba(222,255,233,.74);
          font-size: 12px;
          line-height: 1.45;
        }

        .bondstats-account-close {
          float: right;
          width: 32px;
          height: 32px;
          border: 1px solid rgba(160,255,190,.18);
          border-radius: 50%;
          background: transparent;
          color: white;
          cursor: pointer;
        }

        #bondstats-signed-in-panel {
          display: none;
        }

        .bondstats-account-email {
          margin: 12px 0 18px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(0,0,0,.22);
          color: #dffff0;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        #bondstats-sign-out {
          width: 100%;
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.05);
          color: #fff;
          cursor: pointer;
        }

        @media (max-width: 700px) {
          #bondstats-account-trigger {
            top: 10px;
            right: 10px;
            height: 34px;
            padding: 0 11px;
            font-size: 12px;
          }

          #bondstats-account-modal {
            padding: 21px;
          }
        }
      `;

      document.head.appendChild(style);
    }


    /* ========================================================
       UI
       ======================================================== */

    function createAccountUI() {
      if (
        document.querySelector(
          "#bondstats-account-trigger"
        )
      ) {
        return;
      }

      injectStyles();

      const trigger =
        document.createElement("button");

      trigger.id =
        "bondstats-account-trigger";

      trigger.type = "button";

      trigger.innerHTML = `
        <span class="status-dot"></span>
        <span id="bondstats-account-trigger-text">
          Sign in
        </span>
      `;

      document.body.appendChild(trigger);


      const backdrop =
        document.createElement("div");

      backdrop.id =
        "bondstats-account-modal-backdrop";

      backdrop.innerHTML = `
        <div
          id="bondstats-account-modal"
          role="dialog"
          aria-modal="true"
          aria-label="BondStats account"
        >
          <button
            class="bondstats-account-close"
            id="bondstats-account-close"
            type="button"
            aria-label="Close"
          >
            ×
          </button>

          <div id="bondstats-signed-out-panel">
            <h2 class="bondstats-account-title">
              Sign in to BondStats
            </h2>

            <p class="bondstats-account-subtitle">
              Keep your conversations and access them
              across devices.
            </p>

            <button
              id="bondstats-google-login"
              type="button"
            >
              <svg
                class="bondstats-google-g"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.614z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.963 10.706A5.42 5.42 0 0 1 3.68 9c0-.592.102-1.167.283-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.507.454 3.44 1.346l2.581-2.581C13.464.893 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58z"
                />
              </svg>

              <span>Continue with Google</span>
            </button>

            <div class="bondstats-divider">
              or
            </div>

            <input
              id="bondstats-email"
              class="bondstats-account-input"
              type="email"
              autocomplete="email"
              placeholder="Email"
            />

            <input
              id="bondstats-password"
              class="bondstats-account-input"
              type="password"
              autocomplete="current-password"
              placeholder="Password"
            />

            <button
              id="bondstats-email-login"
              class="bondstats-email-button"
              type="button"
            >
              Sign in
            </button>

            <button
              id="bondstats-email-signup"
              class="bondstats-account-secondary"
              type="button"
            >
              Create account
            </button>

            <div id="bondstats-account-message"></div>
          </div>


          <div id="bondstats-signed-in-panel">
            <h2 class="bondstats-account-title">
              Your BondStats account
            </h2>

            <p class="bondstats-account-subtitle">
              Your conversations are linked to this account.
            </p>

            <div
              class="bondstats-account-email"
              id="bondstats-current-email"
            ></div>

            <button
              id="bondstats-sign-out"
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);


      trigger.addEventListener(
        "click",
        openAccountModal
      );

      document
        .querySelector(
          "#bondstats-account-close"
        )
        ?.addEventListener(
          "click",
          closeAccountModal
        );

      backdrop.addEventListener(
        "click",
        event => {
          if (event.target === backdrop) {
            closeAccountModal();
          }
        }
      );

      document
        .querySelector(
          "#bondstats-google-login"
        )
        ?.addEventListener(
          "click",
          signInWithGoogle
        );

      document
        .querySelector(
          "#bondstats-email-login"
        )
        ?.addEventListener(
          "click",
          signInWithEmail
        );

      document
        .querySelector(
          "#bondstats-email-signup"
        )
        ?.addEventListener(
          "click",
          signUpWithEmail
        );

      document
        .querySelector(
          "#bondstats-sign-out"
        )
        ?.addEventListener(
          "click",
          signOut
        );
    }


    function openAccountModal() {
      const backdrop =
        document.querySelector(
          "#bondstats-account-modal-backdrop"
        );

      if (backdrop) {
        backdrop.style.display = "flex";
      }
    }


    function closeAccountModal() {
      const backdrop =
        document.querySelector(
          "#bondstats-account-modal-backdrop"
        );

      if (backdrop) {
        backdrop.style.display = "none";
      }
    }


    function setMessage(message) {
      const element =
        document.querySelector(
          "#bondstats-account-message"
        );

      if (element) {
        element.textContent =
          message || "";
      }
    }


    function renderAuthState() {
      const signedOut =
        document.querySelector(
          "#bondstats-signed-out-panel"
        );

      const signedIn =
        document.querySelector(
          "#bondstats-signed-in-panel"
        );

      const email =
        document.querySelector(
          "#bondstats-current-email"
        );

      const triggerText =
        document.querySelector(
          "#bondstats-account-trigger-text"
        );

      if (!signedOut || !signedIn) {
        return;
      }

      if (currentUser) {
        signedOut.style.display = "none";
        signedIn.style.display = "block";

        if (email) {
          email.textContent =
            currentUser.email ||
            "Signed in";
        }

        if (triggerText) {
          triggerText.textContent =
            "Account";
        }
      } else {
        signedOut.style.display = "block";
        signedIn.style.display = "none";

        if (triggerText) {
          triggerText.textContent =
            "Sign in";
        }
      }
    }


    /* ========================================================
       GOOGLE AUTH
       ======================================================== */

    async function signInWithGoogle() {
      try {
        setMessage(
          "Opening Google sign-in…"
        );

        const { error } =
          await db.auth.signInWithOAuth({
            provider: "google",

            options: {
              redirectTo:
                getRedirectURL()
            }
          });

        if (error) {
          throw error;
        }
      } catch (error) {
        console.error(
          "[BondStats Account] Google login:",
          error
        );

        setMessage(
          error?.message ||
          "Google sign-in failed."
        );
      }
    }


    /* ========================================================
       EMAIL AUTH
       ======================================================== */

    function getCredentials() {
      const email =
        safeText(
          document.querySelector(
            "#bondstats-email"
          )?.value
        );

      const password =
        document.querySelector(
          "#bondstats-password"
        )?.value || "";

      return {
        email,
        password
      };
    }


    async function signInWithEmail() {
      const {
        email,
        password
      } = getCredentials();

      if (!email || !password) {
        setMessage(
          "Enter email and password."
        );
        return;
      }

      try {
        setMessage("Signing in…");

        const {
          data,
          error
        } =
          await db.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          throw error;
        }

        currentUser =
          data?.user || null;

        renderAuthState();

        setMessage("");

      } catch (error) {
        console.error(
          "[BondStats Account] Email sign-in:",
          error
        );

        setMessage(
          error?.message ||
          "Sign-in failed."
        );
      }
    }


    async function signUpWithEmail() {
      const {
        email,
        password
      } = getCredentials();

      if (!email || !password) {
        setMessage(
          "Enter email and password."
        );
        return;
      }

      if (password.length < 8) {
        setMessage(
          "Use a password with at least 8 characters."
        );
        return;
      }

      try {
        setMessage(
          "Creating account…"
        );

        const {
          data,
          error
        } =
          await db.auth.signUp({
            email,
            password,

            options: {
              emailRedirectTo:
                getRedirectURL()
            }
          });

        if (error) {
          throw error;
        }

        if (data?.session) {
          currentUser =
            data.user || null;

          renderAuthState();

          setMessage("");
        } else {
          setMessage(
            "Account created. Check your email to confirm your address."
          );
        }

      } catch (error) {
        console.error(
          "[BondStats Account] Signup:",
          error
        );

        setMessage(
          error?.message ||
          "Account creation failed."
        );
      }
    }


    async function signOut() {
      try {
        const { error } =
          await db.auth.signOut();

        if (error) {
          throw error;
        }

        currentUser = null;
        currentConversationId = null;

        renderAuthState();
        closeAccountModal();

      } catch (error) {
        console.error(
          "[BondStats Account] Sign out:",
          error
        );
      }
    }


    /* ========================================================
       SESSION
       ======================================================== */

    async function loadSession() {
      try {
        const {
          data,
          error
        } =
          await db.auth.getSession();

        if (error) {
          throw error;
        }

        currentUser =
          data?.session?.user ||
          null;

        renderAuthState();

        if (currentUser) {
          await loadLatestConversation();
        }

      } catch (error) {
        console.error(
          "[BondStats Account] Session:",
          error
        );
      }
    }


    /* ========================================================
       CONVERSATIONS
       ======================================================== */

    async function createConversation(
      title = "New conversation"
    ) {
      if (!currentUser) {
        return null;
      }

      try {
        const {
          data,
          error
        } =
          await db
            .from("conversations")
            .insert({
              user_id:
                currentUser.id,

              title:
                safeText(title) ||
                "New conversation"
            })
            .select(
              "id,title,created_at,updated_at"
            )
            .single();

        if (error) {
          throw error;
        }

        currentConversationId =
          data.id;

        return data;

      } catch (error) {
        console.error(
          "[BondStats Account] Create conversation:",
          error
        );

        return null;
      }
    }


    async function loadLatestConversation() {
      if (!currentUser) {
        return;
      }

      try {
        const {
          data,
          error
        } =
          await db
            .from("conversations")
            .select(
              "id,title,updated_at"
            )
            .eq(
              "user_id",
              currentUser.id
            )
            .order(
              "updated_at",
              {
                ascending: false
              }
            )
            .limit(1);

        if (error) {
          throw error;
        }

        currentConversationId =
          data?.[0]?.id ||
          null;

      } catch (error) {
        console.error(
          "[BondStats Account] Load conversation:",
          error
        );
      }
    }


    async function startNewConversation() {
      currentConversationId = null;
    }


    /* ========================================================
       MESSAGE STORAGE
       ======================================================== */

    async function saveMessage(
      role,
      content
    ) {
      if (!currentUser) {
        return;
      }

      if (
        role !== "user" &&
        role !== "assistant"
      ) {
        return;
      }

      const clean =
        safeText(content);

      if (!clean) {
        return;
      }

      const key =
        makeMessageKey(
          role,
          clean
        );

      if (
        savedMessageKeys.has(key)
      ) {
        return;
      }

      try {
        if (
          !currentConversationId
        ) {
          const conversation =
            await createConversation(
              role === "user"
                ? clean.slice(0, 70)
                : "New conversation"
            );

          if (!conversation) {
            return;
          }
        }

        const {
          error
        } =
          await db
            .from("messages")
            .insert({
              conversation_id:
                currentConversationId,

              user_id:
                currentUser.id,

              role,

              content:
                clean
            });

        if (error) {
          throw error;
        }

        savedMessageKeys.add(key);

        await db
          .from("conversations")
          .update({
            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            "id",
            currentConversationId
          );

      } catch (error) {
        console.error(
          "[BondStats Account] Save message:",
          error
        );
      }
    }


    /* ========================================================
       ROLE DETECTION
       ======================================================== */

    function detectMessageRole(
      element
    ) {
      if (!element) {
        return null;
      }

      const attributes = [
        element.dataset?.role,
        element.getAttribute?.(
          "data-role"
        ),
        element.className,
        element.id
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        /\buser\b/.test(
          attributes
        )
      ) {
        return "user";
      }

      if (
        /\bassistant\b|\bbondstats-ai\b|\bai-message\b/.test(
          attributes
        )
      ) {
        return "assistant";
      }

      return null;
    }


    /* ========================================================
       SAFE CHAT OBSERVER
       ======================================================== */

    function findMessagesContainer() {
      return (
        document.querySelector(
          "#messages"
        ) ||
        document.querySelector(
          ".messages"
        ) ||
        document.querySelector(
          ".chat-messages"
        )
      );
    }


    function inspectNode(node) {
      if (
        !currentUser ||
        !(node instanceof HTMLElement)
      ) {
        return;
      }

      const candidates = [
        node,

        ...node.querySelectorAll(
          "[data-role], .user-message, .assistant-message, .ai-message"
        )
      ];

      for (
        const candidate
        of candidates
      ) {
        const role =
          detectMessageRole(
            candidate
          );

        if (!role) {
          continue;
        }

        const content =
          safeText(
            candidate.innerText
          );

        if (!content) {
          continue;
        }

        saveMessage(
          role,
          content
        );
      }
    }


    function startChatObserver() {
      const messages =
        findMessagesContainer();

      if (!messages) {
        setTimeout(
          startChatObserver,
          1200
        );

        return;
      }

      const observer =
        new MutationObserver(
          mutations => {
            for (
              const mutation
              of mutations
            ) {
              for (
                const node
                of mutation.addedNodes
              ) {
                inspectNode(node);
              }
            }
          }
        );

      observer.observe(
        messages,
        {
          childList: true,
          subtree: true
        }
      );

      console.log(
        "[BondStats Account] Chat persistence active."
      );
    }


    /* ========================================================
       EXISTING NEW SESSION BUTTON
       ======================================================== */

    function hookNewSessionButton() {
      const selectors = [
        "#newSession",
        "#newSessionBtn",
        ".new-session",
        "[data-action='new-session']"
      ];

      for (
        const selector
        of selectors
      ) {
        const button =
          document.querySelector(
            selector
          );

        if (!button) {
          continue;
        }

        button.addEventListener(
          "click",
          () => {
            startNewConversation();
          }
        );

        return;
      }
    }


    /* ========================================================
       AUTH STATE LISTENER
       ======================================================== */

    db.auth.onAuthStateChange(
      (event, session) => {
        try {
          currentUser =
            session?.user ||
            null;

          renderAuthState();

          if (
            event ===
            "SIGNED_OUT"
          ) {
            currentConversationId =
              null;
          }

          if (
            event ===
              "SIGNED_IN" ||
            event ===
              "INITIAL_SESSION"
          ) {
            window.setTimeout(
              () => {
                loadLatestConversation();
              },
              0
            );
          }

        } catch (error) {
          console.error(
            "[BondStats Account] Auth state:",
            error
          );
        }
      }
    );


    /* ========================================================
       START
       ======================================================== */

    function start() {
      try {
        createAccountUI();

        loadSession();

        startChatObserver();

        hookNewSessionButton();

        console.log(
          "[BondStats Account] Ready."
        );

      } catch (error) {
        console.error(
          "[BondStats Account] Startup failed:",
          error
        );
      }
    }


    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        start,
        {
          once: true
        }
      );
    } else {
      start();
    }

  } catch (fatalError) {
    /*
      Critical safeguard:
      account.js must never break app.js.
    */

    console.error(
      "[BondStats Account] Fatal isolated error:",
      fatalError
    );
  }
})();
