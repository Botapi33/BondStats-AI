"use strict";

/* =========================================================
   BONDSTATS ACCOUNT + CHAT PERSISTENCE
   Completely isolated from app.js
   ========================================================= */

(() => {
  const SUPABASE_URL =
    "https://kiyuawmnmzffqlgvntbv.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "DEIN_SB_PUBLISHABLE_KEY";

  if (!window.supabase?.createClient) {
    console.warn("[BondStats Account] Supabase library unavailable.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let currentUser = null;
  let currentConversationId = null;

  /* ---------------------------------------------------------
     AUTH
  --------------------------------------------------------- */

  async function signInGoogle() {
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.href.split("#")[0]
        }
      });

      if (error) throw error;
    } catch (error) {
      console.error("[BondStats Account] Google login failed:", error);
    }
  }

  async function signOut() {
    try {
      await db.auth.signOut();
    } catch (error) {
      console.error("[BondStats Account] Logout failed:", error);
    }
  }

  async function getSession() {
    try {
      const {
        data: { session },
        error
      } = await db.auth.getSession();

      if (error) throw error;

      currentUser = session?.user || null;

      renderAccountState();

      if (currentUser) {
        await loadLatestConversation();
      }
    } catch (error) {
      console.error("[BondStats Account] Session error:", error);
    }
  }

  /* ---------------------------------------------------------
     CONVERSATIONS
  --------------------------------------------------------- */

  async function createConversation(title) {
    if (!currentUser) return null;

    try {
      const { data, error } = await db
        .from("conversations")
        .insert({
          user_id: currentUser.id,
          title: title || "New conversation"
        })
        .select("id,title")
        .single();

      if (error) throw error;

      currentConversationId = data.id;

      return data;
    } catch (error) {
      console.error("[BondStats Account] Create conversation failed:", error);
      return null;
    }
  }

  async function loadLatestConversation() {
    if (!currentUser) return;

    try {
      const { data, error } = await db
        .from("conversations")
        .select("id,title,updated_at")
        .eq("user_id", currentUser.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      currentConversationId =
        data?.length
          ? data[0].id
          : null;

    } catch (error) {
      console.error("[BondStats Account] Conversation load failed:", error);
    }
  }

  /* ---------------------------------------------------------
     MESSAGE STORAGE
  --------------------------------------------------------- */

  async function saveMessage(role, content) {
    if (!currentUser) return;
    if (typeof content !== "string") return;

    const cleanContent = content.trim();

    if (!cleanContent) return;

    try {
      if (!currentConversationId) {
        const conversation = await createConversation(
          role === "user"
            ? cleanContent.slice(0, 70)
            : "New conversation"
        );

        if (!conversation) return;
      }

      const { error } = await db
        .from("messages")
        .insert({
          conversation_id: currentConversationId,
          user_id: currentUser.id,
          role,
          content: cleanContent
        });

      if (error) throw error;

      await db
        .from("conversations")
        .update({
          updated_at: new Date().toISOString()
        })
        .eq("id", currentConversationId);

    } catch (error) {
      console.error("[BondStats Account] Save message failed:", error);
    }
  }

  /* ---------------------------------------------------------
     LOGIN UI
  --------------------------------------------------------- */

  function createAccountUI() {
    if (document.querySelector("#bondstats-account")) return;

    const box = document.createElement("div");

    box.id = "bondstats-account";

    box.style.cssText = `
      position:fixed;
      top:18px;
      right:18px;
      z-index:99999;
      display:flex;
      gap:8px;
      align-items:center;
      font-family:Arial,sans-serif;
    `;

    box.innerHTML = `
      <button
        id="bondstats-google-login"
        type="button"
        style="
          padding:9px 15px;
          border-radius:999px;
          border:1px solid rgba(120,255,165,.55);
          background:rgba(5,30,20,.92);
          color:#eaffef;
          cursor:pointer;
        "
      >
        Continue with Google
      </button>

      <button
        id="bondstats-logout"
        type="button"
        style="
          display:none;
          padding:9px 15px;
          border-radius:999px;
          border:1px solid rgba(120,255,165,.35);
          background:rgba(5,30,20,.75);
          color:#eaffef;
          cursor:pointer;
        "
      >
        Sign out
      </button>

      <span
        id="bondstats-user"
        style="
          display:none;
          color:#bfffd2;
          font-size:12px;
        "
      ></span>
    `;

    document.body.appendChild(box);

    document
      .querySelector("#bondstats-google-login")
      ?.addEventListener("click", signInGoogle);

    document
      .querySelector("#bondstats-logout")
      ?.addEventListener("click", signOut);
  }

  function renderAccountState() {
    const login =
      document.querySelector("#bondstats-google-login");

    const logout =
      document.querySelector("#bondstats-logout");

    const user =
      document.querySelector("#bondstats-user");

    if (!login || !logout || !user) return;

    if (currentUser) {
      login.style.display = "none";
      logout.style.display = "inline-block";

      user.style.display = "inline-block";
      user.textContent =
        currentUser.email || "Signed in";
    } else {
      login.style.display = "inline-block";
      logout.style.display = "none";
      user.style.display = "none";
      user.textContent = "";
    }
  }

  /* ---------------------------------------------------------
     SAFE MESSAGE OBSERVER

     Important:
     We observe the existing UI.
     We do NOT modify submitMessage(),
     addUserMessage(),
     addAssistantMessage(),
     keydown handlers or app.js.
  --------------------------------------------------------- */

  let lastObservedText = "";

  function observeChat() {
    const messages =
      document.querySelector("#messages") ||
      document.querySelector(".messages") ||
      document.querySelector(".chat-messages");

    if (!messages) {
      setTimeout(observeChat, 1000);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!currentUser) return;

      const children = [...messages.children];

      if (!children.length) return;

      const latest = children[children.length - 1];

      const text =
        latest?.innerText?.trim() || "";

      if (!text) return;
      if (text === lastObservedText) return;

      lastObservedText = text;

      const classText =
        String(latest.className || "").toLowerCase();

      const role =
        classText.includes("user")
          ? "user"
          : classText.includes("assistant") ||
            classText.includes("ai")
          ? "assistant"
          : null;

      if (!role) return;

      saveMessage(role, text);
    });

    observer.observe(messages, {
      childList: true,
      subtree: true
    });

    console.log("[BondStats Account] Chat observer active.");
  }

  /* ---------------------------------------------------------
     AUTH EVENT LISTENER

     Keep callback synchronous.
  --------------------------------------------------------- */

  db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;

    renderAccountState();

    if (event === "SIGNED_OUT") {
      currentConversationId = null;
    }

    if (
      event === "SIGNED_IN" ||
      event === "INITIAL_SESSION"
    ) {
      setTimeout(() => {
        loadLatestConversation();
      }, 0);
    }
  });

  /* ---------------------------------------------------------
     START
  --------------------------------------------------------- */

  window.addEventListener("DOMContentLoaded", () => {
    createAccountUI();

    getSession();

    observeChat();
  });

})();
