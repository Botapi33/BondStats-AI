"use strict";

/* ============================================================
   BONDSTATS ACCOUNT + PERSISTENCE
   Robust DOM-independent edition
   ============================================================ */

(() => {
  try {

    /* ========================================================
       CONFIG
       ======================================================== */

    const SUPABASE_URL =
      "https://kiyuawmnmzffqlgvntbv.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
      "DEIN_SB_PUBLISHABLE_KEY_HIER";

    const DIRECT_APP_URL =
      "https://botapi33.github.io/BondStats-AI/";


    /* ========================================================
       FAIL SAFE
       ======================================================== */

    if (!window.supabase?.createClient) {
      console.warn(
        "[BondStats Account] Supabase JS unavailable."
      );
      return;
    }


    /* ========================================================
       SHARED SUPABASE CLIENT
       ======================================================== */

    const db =
      window.BondStatsSupabase ||
      window.supabase.createClient(
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

    window.BondStatsSupabase = db;


    /* ========================================================
       STATE
       ======================================================== */

    let currentUser = null;
    let currentConversationId = null;

    let chatObserver = null;

    let knownMessageElements =
      new WeakSet();

    let pendingTimers =
      new WeakMap();

    let newSessionHooked = false;

    let lastSavedUserText = "";
    let lastSavedAssistantText = "";


    /* ========================================================
       HELPERS
       ======================================================== */

    function safeText(value) {
      return typeof value === "string"
        ? value.trim()
        : "";
    }


    function normalizeText(value) {
      return safeText(value)
        .replace(/\s+/g, " ")
        .trim();
    }


    function setStatus(message) {
      const el =
        document.getElementById(
          "bondstats-account-status"
        );

      if (el) {
        el.textContent =
          message || "";
      }
    }


    function isPopup() {
      try {
        return Boolean(
          window.opener &&
          window.opener !== window
        );
      } catch {
        return false;
      }
    }


    /* ========================================================
       ACCOUNT UI CSS
       ======================================================== */

    function injectStyles() {
      if (
        document.getElementById(
          "bondstats-account-css"
        )
      ) {
        return;
      }

      const style =
        document.createElement("style");

      style.id =
        "bondstats-account-css";

      style.textContent = `
        #bondstats-account-trigger {
          position: relative !important;
          inset: auto !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 15px;
          margin-right: 10px;
          border-radius: 999px;
          border: 1px solid rgba(118,255,163,.48);
          background: rgba(8,31,20,.84);
          color: #effff4;
          font-family: Arial,Helvetica,sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          backdrop-filter: blur(12px);
        }

        #bondstats-account-trigger:hover {
          background: rgba(13,47,30,.95);
          border-color: rgba(118,255,163,.78);
        }

        .bondstats-account-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #75ff9d;
          box-shadow: 0 0 9px rgba(117,255,157,.9);
        }

        #bondstats-account-backdrop {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 22px;
          background: rgba(0,0,0,.72);
          backdrop-filter: blur(12px);
        }

        #bondstats-account-modal {
          box-sizing: border-box;
          width: min(420px,100%);
          padding: 27px;
          border-radius: 22px;
          border: 1px solid rgba(113,255,161,.28);
          background: linear-gradient(
            180deg,
            rgba(18,55,36,.995),
            rgba(5,19,13,.998)
          );
          color: #f1fff5;
          font-family: Arial,Helvetica,sans-serif;
          box-shadow: 0 40px 110px rgba(0,0,0,.62);
        }

        #bondstats-account-modal * {
          box-sizing: border-box;
        }

        #bondstats-account-close {
          float: right;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid rgba(160,255,190,.18);
          background: rgba(255,255,255,.025);
          color: white;
          font-size: 20px;
          cursor: pointer;
        }

        .bondstats-account-title {
          margin: 0 0 6px;
          font-size: 22px;
          font-weight: 700;
        }

        .bondstats-account-subtitle {
          margin: 0 0 22px;
          color: rgba(232,255,240,.68);
          font-size: 13px;
          line-height: 1.5;
        }

        #bondstats-google-login {
          width: 100%;
          height: 44px;
          border-radius: 22px;
          border: 1px solid #8e918f;
          background: #131314;
          color: #e3e3e3;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        #bondstats-google-login:hover {
          background: #202124;
        }

        .bondstats-google-logo {
          width: 18px;
          height: 18px;
        }

        .bondstats-account-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 19px 0;
          color: rgba(230,255,238,.38);
          font-size: 11px;
        }

        .bondstats-account-divider::before,
        .bondstats-account-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: rgba(126,255,167,.14);
        }

        .bondstats-account-input {
          width: 100%;
          height: 44px;
          margin-bottom: 10px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(132,255,173,.20);
          outline: none;
          background: rgba(0,0,0,.26);
          color: #f3fff6;
          font-size: 14px;
        }

        #bondstats-email-login {
          width: 100%;
          height: 44px;
          border: 0;
          border-radius: 12px;
          background: #75ff9b;
          color: #06200f;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
        }

        #bondstats-email-signup {
          width: 100%;
          margin-top: 6px;
          padding: 11px;
          border: 0;
          background: transparent;
          color: rgba(231,255,239,.70);
          cursor: pointer;
          font-size: 12px;
        }

        #bondstats-account-status {
          min-height: 18px;
          margin-top: 12px;
          color: rgba(222,255,233,.72);
          font-size: 12px;
        }

        #bondstats-account-signed-in {
          display: none;
        }

        #bondstats-account-email-display {
          margin: 14px 0 18px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(130,255,170,.10);
          background: rgba(0,0,0,.23);
          color: #e0ffea;
          font-size: 13px;
        }

        #bondstats-account-signout {
          width: 100%;
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.045);
          color: white;
          cursor: pointer;
        }
      `;

      document.head.appendChild(style);
    }


    /* ========================================================
       GOOGLE LOGO
       ======================================================== */

    function googleLogo() {
      return `
        <svg
          class="bondstats-google-logo"
          viewBox="0 0 18 18"
          aria-hidden="true"
        >
          <path fill="#4285F4"
            d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.614z"/>
          <path fill="#34A853"
            d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05"
            d="M3.963 10.706A5.42 5.42 0 0 1 3.68 9c0-.592.102-1.167.283-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332z"/>
          <path fill="#EA4335"
            d="M9 3.58c1.321 0 2.507.454 3.44 1.346l2.581-2.581C13.464.893 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58z"/>
        </svg>
      `;
    }


    /* ========================================================
       CREATE ACCOUNT UI
       ======================================================== */

    function createAccountUI() {
      if (
        document.getElementById(
          "bondstats-account-trigger"
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
        <span class="bondstats-account-dot"></span>
        <span id="bondstats-account-trigger-text">
          Sign in
        </span>
      `;

      const newSession =
        findNewSessionButton();

      if (
        newSession &&
        newSession.parentElement
      ) {
        newSession.parentElement.insertBefore(
          trigger,
          newSession
        );
      } else {
        document.body.appendChild(trigger);
      }

      const backdrop =
        document.createElement("div");

      backdrop.id =
        "bondstats-account-backdrop";

      backdrop.innerHTML = `
        <section id="bondstats-account-modal">

          <button
            id="bondstats-account-close"
            type="button"
          >
            ×
          </button>

          <div id="bondstats-account-signed-out">

            <h2 class="bondstats-account-title">
              Sign in to BondStats
            </h2>

            <p class="bondstats-account-subtitle">
              Keep your conversations and analysis connected
              to your account.
            </p>

            <button
              id="bondstats-google-login"
              type="button"
            >
              ${googleLogo()}
              <span>Continue with Google</span>
            </button>

            <div class="bondstats-account-divider">
              or
            </div>

            <input
              id="bondstats-account-email"
              class="bondstats-account-input"
              type="email"
              placeholder="Email"
            />

            <input
              id="bondstats-account-password"
              class="bondstats-account-input"
              type="password"
              placeholder="Password"
            />

            <button
              id="bondstats-email-login"
              type="button"
            >
              Sign in
            </button>

            <button
              id="bondstats-email-signup"
              type="button"
            >
              Create account
            </button>

            <div id="bondstats-account-status"></div>

          </div>

          <div id="bondstats-account-signed-in">

            <h2 class="bondstats-account-title">
              BondStats Account
            </h2>

            <p class="bondstats-account-subtitle">
              Your conversations are linked to this account.
            </p>

            <div
              id="bondstats-account-email-display"
            ></div>

            <button
              id="bondstats-account-signout"
              type="button"
            >
              Sign out
            </button>

          </div>

        </section>
      `;

      document.body.appendChild(backdrop);

      trigger.addEventListener(
        "click",
        () => {
          backdrop.style.display = "flex";
        }
      );

      document
        .getElementById(
          "bondstats-account-close"
        )
        ?.addEventListener(
          "click",
          () => {
            backdrop.style.display = "none";
          }
        );

      document
        .getElementById(
          "bondstats-google-login"
        )
        ?.addEventListener(
          "click",
          googleSignIn
        );

      document
        .getElementById(
          "bondstats-email-login"
        )
        ?.addEventListener(
          "click",
          emailSignIn
        );

      document
        .getElementById(
          "bondstats-email-signup"
        )
        ?.addEventListener(
          "click",
          emailSignUp
        );

      document
        .getElementById(
          "bondstats-account-signout"
        )
        ?.addEventListener(
          "click",
          signOut
        );
    }


    /* ========================================================
       AUTH UI STATE
       ======================================================== */

    function renderAuth() {
      const signedOut =
        document.getElementById(
          "bondstats-account-signed-out"
        );

      const signedIn =
        document.getElementById(
          "bondstats-account-signed-in"
        );

      const email =
        document.getElementById(
          "bondstats-account-email-display"
        );

      const triggerText =
        document.getElementById(
          "bondstats-account-trigger-text"
        );

      if (
        !signedOut ||
        !signedIn
      ) {
        return;
      }

      if (currentUser) {
        signedOut.style.display =
          "none";

        signedIn.style.display =
          "block";

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
        signedOut.style.display =
          "block";

        signedIn.style.display =
          "none";

        if (triggerText) {
          triggerText.textContent =
            "Sign in";
        }
      }
    }


    /* ========================================================
       LOAD SESSION
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

        renderAuth();

        if (currentUser) {
          await loadSelectedConversation();
        }

      } catch (error) {
        console.error(
          "[BondStats Account] Session load failed:",
          error
        );
      }
    }


    /* ========================================================
       AUTH LISTENER
       ======================================================== */

    db.auth.onAuthStateChange(
      (event, session) => {

        currentUser =
          session?.user ||
          null;

        renderAuth();

        if (
          event === "SIGNED_OUT"
        ) {
          currentConversationId =
            null;

          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION"
        ) {
          setTimeout(() => {
            loadSelectedConversation()
              .catch(error => {
                console.error(
                  "[BondStats Account] Conversation load:",
                  error
                );
              });
          }, 0);
        }
      }
    );


    /* ========================================================
       GOOGLE AUTH
       ======================================================== */

    async function googleSignIn() {
      try {
        setStatus(
          "Opening Google sign-in…"
        );

        const {
          data,
          error
        } =
          await db.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo:
                DIRECT_APP_URL,
              skipBrowserRedirect:
                true
            }
          });

        if (error) {
          throw error;
        }

        if (!data?.url) {
          throw new Error(
            "No Google authorization URL returned."
          );
        }

        window.open(
          data.url,
          "bondstats-google-auth",
          "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes"
        );

      } catch (error) {
        console.error(
          "[BondStats Account] Google login failed:",
          error
        );

        setStatus(
          error?.message ||
          "Google sign-in failed."
        );
      }
    }


    /* ========================================================
       EMAIL AUTH
       ======================================================== */

    function credentials() {
      return {
        email:
          safeText(
            document
              .getElementById(
                "bondstats-account-email"
              )
              ?.value
          ),

        password:
          document
            .getElementById(
              "bondstats-account-password"
            )
            ?.value ||
          ""
      };
    }


    async function emailSignIn() {
      const {
        email,
        password
      } = credentials();

      if (!email || !password) {
        setStatus(
          "Enter email and password."
        );
        return;
      }

      try {
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
          data?.user ||
          null;

        renderAuth();

        await loadSelectedConversation();

      } catch (error) {
        setStatus(
          error?.message ||
          "Sign-in failed."
        );
      }
    }


    async function emailSignUp() {
      const {
        email,
        password
      } = credentials();

      if (!email || !password) {
        setStatus(
          "Enter email and password."
        );
        return;
      }

      try {
        const {
          data,
          error
        } =
          await db.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo:
                DIRECT_APP_URL
            }
          });

        if (error) {
          throw error;
        }

        if (data?.session) {
          currentUser =
            data.user ||
            null;

          renderAuth();

          await loadSelectedConversation();

        } else {
          setStatus(
            "Account created. Check your email."
          );
        }

      } catch (error) {
        setStatus(
          error?.message ||
          "Account creation failed."
        );
      }
    }


    async function signOut() {
      try {
        await db.auth.signOut();

        currentUser = null;
        currentConversationId = null;

        renderAuth();

      } catch (error) {
        console.error(
          "[BondStats Account] Logout failed:",
          error
        );
      }
    }


    /* ========================================================
       LOAD ACTIVE CONVERSATION
       ======================================================== */

    async function loadSelectedConversation() {
      if (!currentUser) {
        currentConversationId = null;
        return;
      }

      const selected =
        sessionStorage.getItem(
          "bondstats_continue_conversation_id"
        ) ||
        localStorage.getItem(
          "bondstats_selected_conversation"
        );

      if (selected) {
        const {
          data
        } =
          await db
            .from("conversations")
            .select("id")
            .eq(
              "id",
              selected
            )
            .eq(
              "user_id",
              currentUser.id
            )
            .maybeSingle();

        if (data?.id) {
          currentConversationId =
            data.id;

          return;
        }
      }

      const {
        data,
        error
      } =
        await db
          .from("conversations")
          .select("id")
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
        currentConversationId =
          null;

        return;
      }

      currentConversationId =
        data?.[0]?.id ||
        null;
    }


    /* ========================================================
       CREATE CONVERSATION
       ======================================================== */

    async function createConversation(
      title
    ) {
      if (!currentUser) {
        return null;
      }

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
              safeText(title)
                .slice(0, 120) ||
              "New conversation"
          })
          .select(
            "id,title,created_at,updated_at"
          )
          .single();

      if (error) {
        console.error(
          "[BondStats Account] Conversation insert failed:",
          error
        );

        return null;
      }

      currentConversationId =
        data.id;

      return data;
    }


    /* ========================================================
       SAVE MESSAGE
       ======================================================== */

    async function saveMessage(
      role,
      content
    ) {
      if (!currentUser) {
        return false;
      }

      const clean =
        safeText(content);

      if (!clean) {
        return false;
      }

      if (
        role !== "user" &&
        role !== "assistant"
      ) {
        return false;
      }

      if (!currentConversationId) {
        const conversation =
          await createConversation(
            role === "user"
              ? clean.slice(0, 70)
              : "New conversation"
          );

        if (!conversation) {
          return false;
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
        console.error(
          "[BondStats Account] Message insert failed:",
          error
        );

        return false;
      }

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
        )
        .eq(
          "user_id",
          currentUser.id
        );

      window.dispatchEvent(
        new CustomEvent(
          "bondstats:message-saved",
          {
            detail: {
              conversationId:
                currentConversationId,
              role
            }
          }
        )
      );

      return true;
    }


    /* ========================================================
       NEW SESSION
       ======================================================== */

    function findNewSessionButton() {
      const candidates =
        document.querySelectorAll(
          "button, a, [role='button']"
        );

      for (
        const element
        of candidates
      ) {
        if (
          normalizeText(
            element.textContent
          ).toLowerCase() ===
          "new session"
        ) {
          return element;
        }
      }

      return null;
    }


    function hookNewSession() {
      if (newSessionHooked) {
        return;
      }

      const button =
        findNewSessionButton();

      if (!button) {
        return;
      }

      button.addEventListener(
        "click",
        () => {
          currentConversationId =
            null;

          lastSavedUserText = "";
          lastSavedAssistantText = "";

          sessionStorage.removeItem(
            "bondstats_continue_conversation_id"
          );

          localStorage.removeItem(
            "bondstats_selected_conversation"
          );
        },
        {
          passive: true
        }
      );

      newSessionHooked = true;
    }


    /* ========================================================
       CHAT CONTAINER DETECTION
       ======================================================== */

    function findChatContainer() {

      const explicit = [
        "#messages",
        "#chatMessages",
        "#chat-messages",
        ".messages",
        ".chat-messages",
        ".conversation",
        ".conversation-messages"
      ];

      for (
        const selector
        of explicit
      ) {
        const found =
          document.querySelector(
            selector
          );

        if (found) {
          return found;
        }
      }


      /*
        Generic fallback:
        choose large scrolling container
        containing visible conversation-like text.
      */

      const all =
        [...document.querySelectorAll(
          "main, section, div"
        )];

      const candidates =
        all.filter(element => {
          const rect =
            element.getBoundingClientRect();

          const value =
            normalizeText(
              element.innerText
            );

          return (
            rect.height > 250 &&
            rect.width > 250 &&
            value.length > 30
          );
        });

      return candidates
        .sort(
          (a, b) =>
            b.innerText.length -
            a.innerText.length
        )[0] || null;
    }


    /* ========================================================
       ROLE DETECTION — MULTI SIGNAL
       ======================================================== */

    function detectRole(element) {
      if (
        !(element instanceof HTMLElement)
      ) {
        return null;
      }

      const descriptor =
        [
          element.id,
          element.className,
          element.dataset?.role,
          element.dataset?.author,
          element.getAttribute?.(
            "data-role"
          ),
          element.getAttribute?.(
            "data-author"
          ),
          element.getAttribute?.(
            "aria-label"
          )
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


      if (
        descriptor.includes(
          "assistant"
        ) ||
        descriptor.includes(
          "ai-message"
        ) ||
        descriptor.includes(
          "ai-response"
        ) ||
        descriptor.includes(
          "bondstats-ai"
        )
      ) {
        return "assistant";
      }


      if (
        descriptor.includes(
          "user-message"
        ) ||
        descriptor.includes(
          "message-user"
        ) ||
        descriptor.includes(
          "user-bubble"
        ) ||
        descriptor.includes(
          "chat-user"
        )
      ) {
        return "user";
      }


      const visible =
        normalizeText(
          element.innerText
        ).toLowerCase();


      if (
        visible.startsWith(
          "bondstats ai"
        ) ||
        visible.startsWith(
          "assistant"
        )
      ) {
        return "assistant";
      }


      if (
        visible.startsWith(
          "you"
        ) ||
        visible.startsWith(
          "user"
        )
      ) {
        return "user";
      }


      return null;
    }


    /* ========================================================
       FIND MESSAGE ROOT
       ======================================================== */

    function findMessageRoot(node) {
      if (
        !(node instanceof HTMLElement)
      ) {
        return null;
      }

      let current = node;

      for (
        let depth = 0;
        depth < 8;
        depth += 1
      ) {

        if (
          detectRole(current)
        ) {
          return current;
        }

        current =
          current.parentElement;

        if (!current) {
          break;
        }
      }

      return null;
    }


    /* ========================================================
       GENERIC MESSAGE CANDIDATES
       ======================================================== */

    function collectMessageCandidates(
      container
    ) {
      const selectors = [
        "[data-role]",
        "[data-author]",
        ".user-message",
        ".assistant-message",
        ".message-user",
        ".message-assistant",
        ".ai-message",
        ".ai-response",
        ".user-bubble",
        "article"
      ];

      const set =
        new Set();

      for (
        const selector
        of selectors
      ) {
        container
          .querySelectorAll(
            selector
          )
          .forEach(
            element => {
              set.add(element);
            }
          );
      }

      return [...set];
    }


    /* ========================================================
       FALLBACK MESSAGE INFERENCE
       ======================================================== */

    function inferRoleFromOrder(
      element,
      container
    ) {
      const children =
        [...container.children]
          .filter(child => {
            const txt =
              normalizeText(
                child.innerText
              );

            return txt.length > 3;
          });

      const index =
        children.indexOf(
          element
        );

      if (index === -1) {
        return null;
      }

      /*
        Fallback only:
        in a normal chat, messages alternate.
      */

      return index % 2 === 0
        ? "user"
        : "assistant";
    }


    /* ========================================================
       SCHEDULE SAVE
       ======================================================== */

    function scheduleElement(
      element,
      container
    ) {
      if (
        !element ||
        knownMessageElements.has(
          element
        )
      ) {
        return;
      }

      const existingTimer =
        pendingTimers.get(
          element
        );

      if (existingTimer) {
        clearTimeout(
          existingTimer
        );
      }

      const timer =
        setTimeout(
          async () => {

            pendingTimers.delete(
              element
            );

            if (
              knownMessageElements.has(
                element
              )
            ) {
              return;
            }

            const content =
              normalizeText(
                element.innerText
              );

            if (
              !content ||
              content.length < 2
            ) {
              return;
            }

            let role =
              detectRole(
                element
              );

            if (!role) {
              role =
                inferRoleFromOrder(
                  element,
                  container
                );
            }

            if (!role) {
              return;
            }

            /*
              Ignore UI noise.
            */

            const lower =
              content.toLowerCase();

            if (
              lower === "analyze" ||
              lower === "new session" ||
              lower === "history" ||
              lower === "account" ||
              lower === "sign in"
            ) {
              return;
            }


            /*
              Duplicate text protection.
            */

            if (
              role === "user" &&
              content ===
                lastSavedUserText
            ) {
              knownMessageElements.add(
                element
              );
              return;
            }

            if (
              role === "assistant" &&
              content ===
                lastSavedAssistantText
            ) {
              knownMessageElements.add(
                element
              );
              return;
            }


            const success =
              await saveMessage(
                role,
                content
              );

            if (success) {
              knownMessageElements.add(
                element
              );

              if (
                role === "user"
              ) {
                lastSavedUserText =
                  content;
              } else {
                lastSavedAssistantText =
                  content;
              }
            }

          },
          1000
        );

      pendingTimers.set(
        element,
        timer
      );
    }


    /* ========================================================
       PROCESS MUTATION
       ======================================================== */

    function processMutationNode(
      node,
      container
    ) {
      if (
        !currentUser ||
        !(node instanceof HTMLElement)
      ) {
        return;
      }

      const root =
        findMessageRoot(
          node
        );

      if (root) {
        scheduleElement(
          root,
          container
        );
      }


      collectMessageCandidates(
        node
      )
        .forEach(
          candidate => {
            scheduleElement(
              candidate,
              container
            );
          }
        );


      /*
        Generic fallback:
        if a direct new child has substantial text,
        consider it a possible message.
      */

      if (
        node.parentElement ===
          container &&
        normalizeText(
          node.innerText
        ).length > 5
      ) {
        scheduleElement(
          node,
          container
        );
      }
    }


    /* ========================================================
       START OBSERVER
       ======================================================== */

    function startObserver(
      attempt = 0
    ) {
      const container =
        findChatContainer();

      if (!container) {
        if (attempt < 80) {
          setTimeout(
            () => {
              startObserver(
                attempt + 1
              );
            },
            500
          );
        }

        return;
      }

      /*
        Existing content is considered historical,
        so don't save it again.
      */

      collectMessageCandidates(
        container
      ).forEach(
        element => {
          knownMessageElements.add(
            element
          );
        }
      );


      chatObserver =
        new MutationObserver(
          mutations => {

            if (!currentUser) {
              return;
            }

            for (
              const mutation
              of mutations
            ) {

              mutation.addedNodes
                .forEach(
                  node => {
                    processMutationNode(
                      node,
                      container
                    );
                  }
                );


              const target =
                mutation.target instanceof HTMLElement
                  ? mutation.target
                  : mutation.target.parentElement;

              if (target) {
                const root =
                  findMessageRoot(
                    target
                  );

                if (root) {
                  scheduleElement(
                    root,
                    container
                  );
                }
              }
            }
          }
        );


      chatObserver.observe(
        container,
        {
          childList: true,
          subtree: true,
          characterData: true
        }
      );

      console.log(
        "[BondStats Account] Robust persistence observer active."
      );
    }


    /* ========================================================
       START
       ======================================================== */

    async function start() {
      try {
        createAccountUI();

        await loadSession();

        hookNewSession();

        if (!newSessionHooked) {
          let attempts = 0;

          const interval =
            setInterval(
              () => {
                attempts += 1;

                hookNewSession();

                if (
                  newSessionHooked ||
                  attempts > 40
                ) {
                  clearInterval(
                    interval
                  );
                }
              },
              500
            );
        }

        startObserver();

        console.log(
          "[BondStats Account] Robust account layer ready."
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
    console.error(
      "[BondStats Account] Fatal isolated error:",
      fatalError
    );
  }
})();
