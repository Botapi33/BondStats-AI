"use strict";

/* ============================================================
   BONDSTATS CHAT HISTORY
   Version 3.0
   ------------------------------------------------------------

   SAFE / ISOLATED MODULE

   FEATURES
   ✓ User-bound Supabase history
   ✓ Search
   ✓ Sort by newest / oldest / title
   ✓ Open conversations
   ✓ Rename with custom modal
   ✓ Delete with custom confirmation modal
   ✓ Duplicate conversation
   ✓ Copy conversation to clipboard
   ✓ Export conversation as TXT
   ✓ Refresh
   ✓ Open & Continue
   ✓ Persistent selected conversation
   ✓ Toast notifications
   ✓ Responsive drawer
   ✓ Does NOT modify app.js
   ✓ Does NOT intercept Enter
   ✓ Does NOT intercept submit
   ✓ Does NOT alter Analyze button
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
       FAIL SAFE
       ======================================================== */

    !window.supabase?.createClient) {
      console.warn(
        "[BondStats History] Supabase library unavailable."
      );
      return;
    }


    /* ========================================================
       SUPABASE CLIENT
       ======================================================== */

    const db = window.BondStatsSupabase;

!db) {
  console.error(
    "[BondStats History] Shared Supabase client unavailable."
  );
  return;
}


    /* ========================================================
       STATE
       ======================================================== */

    let currentUser = null;

    let conversations = [];
    let filteredConversations = [];

    let activeConversationId = null;
    let activeConversationMessages = [];

    let currentSearch = "";
    let currentSort = "newest";


    /* ========================================================
       HELPERS
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


    function formatDate(value) {
      if (!value) {
        return "";
      }

      try {
        return new Intl.DateTimeFormat(
          undefined,
          {
            dateStyle: "medium",
            timeStyle: "short"
          }
        ).format(
          new Date(value)
        );
      } catch {
        return "";
      }
    }


    function getConversationById(id) {
      return conversations.find(
        item => item.id === id
      ) || null;
    }


    function normalizeFilename(value) {
      return String(value || "BondStats Conversation")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    }


    /* ========================================================
       CSS
       ======================================================== */

    function injectStyles() {

      if (
        document.getElementById(
          "bondstats-history-v3-css"
        )
      ) {
        return;
      }


      const style =
        document.createElement("style");

      style.id =
        "bondstats-history-v3-css";


      style.textContent = `

        /* ==========================================
           HISTORY BUTTON
           ========================================== */

        #bondstats-history-button {
          position: relative !important;
          inset: auto !important;

          display: none;
          align-items: center;
          justify-content: center;

          flex: 0 0 auto;

          min-height: 38px;
          padding: 0 14px;
          margin-right: 8px;

          border-radius: 999px;

          border:
            1px solid rgba(120,255,165,.32);

          background:
            rgba(7,28,19,.74);

          color: #eaffef;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 13px;
          font-weight: 600;

          cursor: pointer;
          white-space: nowrap;

          backdrop-filter:
            blur(12px);

          box-shadow:
            inset 0 0 0 1px rgba(100,255,150,.03),
            0 5px 18px rgba(0,0,0,.16);

          transition:
            border-color .16s ease,
            background .16s ease,
            transform .16s ease;
        }


        #bondstats-history-button:hover {
          border-color:
            rgba(120,255,165,.70);

          background:
            rgba(11,43,28,.94);

          transform:
            translateY(-1px);
        }


        /* ==========================================
           BACKDROP
           ========================================== */

        #bondstats-history-backdrop {
          position: fixed;

          inset: 0;

          z-index: 999998;

          display: none;

          align-items: stretch;
          justify-content: flex-end;

          background:
            rgba(0,0,0,.56);

          backdrop-filter:
            blur(8px);
        }


        /* ==========================================
           DRAWER
           ========================================== */

        #bondstats-history-panel {
          box-sizing: border-box;

          width:
            min(470px, 95vw);

          height: 100%;

          display: flex;
          flex-direction: column;

          overflow: hidden;

          border-left:
            1px solid
            rgba(115,255,158,.25);

          background:
            linear-gradient(
              180deg,
              rgba(14,44,29,.995),
              rgba(5,18,12,.998)
            );

          color: #f0fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          box-shadow:
            -30px 0 90px
            rgba(0,0,0,.50);
        }


        #bondstats-history-panel * {
          box-sizing: border-box;
        }


        /* ==========================================
           HEADER
           ========================================== */

        .bondstats-history-header {
          flex: 0 0 auto;

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          gap: 12px;

          padding:
            22px 20px 16px;

          border-bottom:
            1px solid
            rgba(120,255,165,.12);
        }


        .bondstats-history-heading {
          margin: 0;

          font-size: 21px;

          line-height: 1.2;

          font-weight: 700;
        }


        .bondstats-history-subtitle {
          margin:
            5px 0 0;

          color:
            rgba(230,255,238,.57);

          font-size: 11px;
        }


        .bondstats-history-header-buttons {
          display: flex;
          gap: 7px;
        }


        .bondstats-history-icon-button {
          width: 35px;
          height: 35px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          border:
            1px solid
            rgba(130,255,170,.18);

          background:
            rgba(255,255,255,.035);

          color: #fff;

          cursor: pointer;

          font-size: 16px;
        }


        .bondstats-history-icon-button:hover {
          background:
            rgba(255,255,255,.08);
        }


        /* ==========================================
           SEARCH / SORT TOOLBAR
           ========================================== */

        .bondstats-history-toolbar {
          flex: 0 0 auto;

          display: grid;

          grid-template-columns:
            minmax(0, 1fr) 128px;

          gap: 8px;

          padding:
            12px 12px 6px;
        }


        #bondstats-history-search,
        #bondstats-history-sort {
          width: 100%;
          height: 42px;

          border-radius: 12px;

          border:
            1px solid
            rgba(120,255,165,.17);

          outline: none;

          background:
            rgba(0,0,0,.23);

          color:
            #effff4;

          font-size: 13px;
        }


        #bondstats-history-search {
          padding:
            0 14px;
        }


        #bondstats-history-sort {
          padding:
            0 10px;

          cursor: pointer;
        }


        #bondstats-history-search:focus,
        #bondstats-history-sort:focus {
          border-color:
            rgba(120,255,165,.47);
        }


        #bondstats-history-search::placeholder {
          color:
            rgba(230,255,238,.38);
        }


        /* ==========================================
           LIST
           ========================================== */

        #bondstats-history-list {
          flex: 1;

          overflow-y: auto;

          padding: 10px;
        }


        .bondstats-history-empty {
          padding:
            38px 18px;

          text-align: center;

          color:
            rgba(229,255,237,.50);

          font-size: 13px;

          line-height: 1.65;
        }


        /* ==========================================
           CONVERSATION ITEM
           ========================================== */

        .bondstats-history-item {
          width: 100%;

          display: flex;

          align-items: center;

          gap: 8px;

          margin-bottom: 7px;

          padding:
            13px 10px 13px 14px;

          border-radius: 13px;

          border:
            1px solid
            rgba(126,255,167,.12);

          background:
            rgba(0,0,0,.17);

          color:
            #effff4;

          transition:
            background .15s ease,
            border-color .15s ease;
        }


        .bondstats-history-item:hover {
          background:
            rgba(35,105,65,.22);

          border-color:
            rgba(126,255,167,.28);
        }


        .bondstats-history-item-main {
          min-width: 0;

          flex: 1;

          cursor: pointer;
        }


        .bondstats-history-title {
          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;

          font-size: 13px;

          font-weight: 600;
        }


        .bondstats-history-time {
          margin-top: 5px;

          color:
            rgba(222,255,232,.46);

          font-size: 10px;
        }


        .bondstats-history-item-menu {
          flex: 0 0 auto;

          width: 30px;
          height: 30px;

          border: 0;
          border-radius: 9px;

          background:
            rgba(255,255,255,.035);

          color:
            rgba(235,255,241,.67);

          cursor: pointer;

          font-size: 17px;
        }


        .bondstats-history-item-menu:hover {
          background:
            rgba(255,255,255,.09);

          color: #fff;
        }


        /* ==========================================
           VIEWER
           ========================================== */

        #bondstats-conversation-viewer {
          position: fixed;

          inset: 0;

          z-index: 999999;

          display: none;

          align-items: center;

          justify-content: center;

          padding: 24px;

          background:
            rgba(0,0,0,.74);

          backdrop-filter:
            blur(11px);
        }


        #bondstats-conversation-card {
          width:
            min(820px, 96vw);

          max-height:
            90vh;

          display: flex;

          flex-direction: column;

          overflow: hidden;

          border-radius: 20px;

          border:
            1px solid
            rgba(115,255,158,.24);

          background:
            linear-gradient(
              180deg,
              rgba(13,43,28,.998),
              rgba(5,18,12,.998)
            );

          color: #f1fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          box-shadow:
            0 40px 120px
            rgba(0,0,0,.67);
        }


        #bondstats-conversation-card * {
          box-sizing: border-box;
        }


        /* ==========================================
           VIEWER HEADER
           ========================================== */

        .bondstats-conversation-header {
          display: flex;

          align-items: center;

          justify-content:
            space-between;

          gap: 15px;

          padding:
            18px 20px;

          border-bottom:
            1px solid
            rgba(120,255,165,.12);
        }


        #bondstats-conversation-title {
          min-width: 0;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;

          font-size: 16px;

          font-weight: 700;
        }


        #bondstats-conversation-date {
          flex: 0 0 auto;

          color:
            rgba(225,255,234,.42);

          font-size: 10px;
        }


        /* ==========================================
           MESSAGES
           ========================================== */

        #bondstats-conversation-messages {
          flex: 1;

          overflow-y: auto;

          padding: 20px;
        }


        .bondstats-history-message {
          max-width: 88%;

          margin:
            0 0 14px;

          padding:
            12px 14px;

          border-radius: 14px;

          font-size: 13px;

          line-height: 1.55;

          white-space: pre-wrap;

          overflow-wrap: anywhere;
        }


        .bondstats-history-message-user {
          margin-left: auto;

          background:
            rgba(104,255,153,.16);

          border:
            1px solid
            rgba(112,255,159,.26);
        }


        .bondstats-history-message-assistant {
          margin-right: auto;

          background:
            rgba(0,0,0,.25);

          border:
            1px solid
            rgba(112,255,159,.10);
        }


        .bondstats-message-role {
          margin-bottom: 6px;

          color: #7dffa4;

          font-size: 9px;

          font-weight: 700;

          letter-spacing: .09em;

          text-transform: uppercase;
        }


        /* ==========================================
           VIEWER FOOTER
           ========================================== */

        .bondstats-conversation-footer {
          flex: 0 0 auto;

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          flex-wrap: wrap;

          gap: 9px;

          padding:
            14px 20px;

          border-top:
            1px solid
            rgba(120,255,165,.12);
        }


        .bondstats-history-action-group {
          display: flex;

          align-items: center;

          flex-wrap: wrap;

          gap: 7px;
        }


        .bondstats-history-action {
          min-height: 38px;

          padding:
            0 12px;

          border-radius: 10px;

          border:
            1px solid
            rgba(130,255,170,.20);

          background:
            rgba(255,255,255,.04);

          color: #fff;

          cursor: pointer;

          font-size: 12px;
        }


        .bondstats-history-action:hover {
          background:
            rgba(255,255,255,.09);
        }


        #bondstats-continue-conversation {
          border-color:
            rgba(117,255,155,.48);

          background:
            rgba(63,190,102,.17);

          color:
            #caffd8;

          font-weight: 700;
        }


        #bondstats-delete-conversation {
          border-color:
            rgba(255,110,110,.28);

          background:
            rgba(100,15,15,.16);

          color:
            #ffbcbc;
        }


        /* ==========================================
           ACTION MODAL
           ========================================== */

        #bondstats-history-action-modal {
          position: fixed;

          inset: 0;

          z-index: 10000000;

          display: none;

          align-items: center;

          justify-content: center;

          padding: 20px;

          background:
            rgba(0,0,0,.74);

          backdrop-filter:
            blur(10px);
        }


        #bondstats-history-action-card {
          box-sizing: border-box;

          width:
            min(410px, 94vw);

          padding: 24px;

          border-radius: 20px;

          border:
            1px solid
            rgba(115,255,158,.28);

          background:
            linear-gradient(
              180deg,
              rgba(15,48,31,.998),
              rgba(5,18,12,.998)
            );

          color: #f1fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          box-shadow:
            0 30px 100px
            rgba(0,0,0,.66);
        }


        .bondstats-action-title {
          margin:
            0 0 8px;

          font-size: 19px;
        }


        .bondstats-action-description {
          margin:
            0 0 18px;

          color:
            rgba(230,255,238,.65);

          font-size: 13px;

          line-height: 1.5;
        }


        #bondstats-action-input {
          width: 100%;

          height: 43px;

          margin-bottom: 17px;

          padding:
            0 13px;

          border-radius: 11px;

          border:
            1px solid
            rgba(120,255,165,.25);

          outline: none;

          background:
            rgba(0,0,0,.25);

          color: white;

          font-size: 14px;
        }


        #bondstats-action-input:focus {
          border-color:
            rgba(120,255,165,.55);
        }


        .bondstats-action-buttons {
          display: flex;

          justify-content:
            flex-end;

          gap: 9px;
        }


        .bondstats-action-modal-button {
          height: 39px;

          padding:
            0 14px;

          border-radius: 10px;

          cursor: pointer;

          font-size: 12px;
        }


        #bondstats-action-cancel {
          border:
            1px solid
            rgba(255,255,255,.15);

          background:
            rgba(255,255,255,.04);

          color: white;
        }


        #bondstats-action-confirm {
          border:
            1px solid
            rgba(120,255,165,.35);

          background: #75ff9b;

          color: #06200f;

          font-weight: 700;
        }


        #bondstats-action-error {
          min-height: 16px;

          margin-top: 10px;

          color: #ffb5b5;

          font-size: 11px;
        }


        /* ==========================================
           TOAST
           ========================================== */

        #bondstats-history-toast {
          position: fixed;

          left: 50%;
          bottom: 24px;

          z-index: 10000001;

          max-width:
            min(560px, 90vw);

          transform:
            translateX(-50%)
            translateY(24px);

          opacity: 0;

          pointer-events: none;

          padding:
            11px 17px;

          border-radius: 999px;

          border:
            1px solid
            rgba(117,255,155,.35);

          background:
            rgba(5,27,16,.97);

          color:
            #dcffe6;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 12px;

          text-align: center;

          box-shadow:
            0 15px 50px
            rgba(0,0,0,.42);

          transition:
            opacity .20s ease,
            transform .20s ease;
        }


        #bondstats-history-toast.visible {
          opacity: 1;

          transform:
            translateX(-50%)
            translateY(0);
        }


        /* ==========================================
           MOBILE
           ========================================== */

        @media (max-width: 700px) {

          #bondstats-history-button {
            min-height: 34px;

            padding:
              0 11px;

            font-size: 12px;
          }


          .bondstats-history-toolbar {
            grid-template-columns: 1fr;
          }


          #bondstats-conversation-viewer {
            padding: 10px;
          }


          #bondstats-conversation-card {
            max-height: 95vh;
          }


          .bondstats-conversation-footer {
            align-items: stretch;
          }


          .bondstats-history-action-group {
            width: 100%;
          }


          .bondstats-history-action {
            flex: 1;
          }

        }

      `;


      document.head.appendChild(
        style
      );
    }


    /* ========================================================
       TOAST
       ======================================================== */

    function createToast() {

      if (
        document.getElementById(
          "bondstats-history-toast"
        )
      ) {
        return;
      }


      const toast =
        document.createElement("div");

      toast.id =
        "bondstats-history-toast";

      document.body.appendChild(
        toast
      );
    }


    let toastTimer = null;


    function showToast(message) {

      const toast =
        document.getElementById(
          "bondstats-history-toast"
        );


      if (!toast) {
        return;
      }


      toast.textContent =
        message || "";


      toast.classList.add(
        "visible"
      );


      if (toastTimer) {
        window.clearTimeout(
          toastTimer
        );
      }


      toastTimer =
        window.setTimeout(
          () => {

            toast.classList.remove(
              "visible"
            );

          },
          2600
        );
    }


    /* ========================================================
       CREATE ACTION MODAL
       ======================================================== */

    function createActionModal() {

      if (
        document.getElementById(
          "bondstats-history-action-modal"
        )
      ) {
        return;
      }


      const overlay =
        document.createElement("div");


      overlay.id =
        "bondstats-history-action-modal";


      overlay.innerHTML = `

        <div
          id="bondstats-history-action-card"
        >

          <h3
            id="bondstats-action-title"
            class="bondstats-action-title"
          ></h3>


          <p
            id="bondstats-action-description"
            class="bondstats-action-description"
          ></p>


          <input
            id="bondstats-action-input"
            type="text"
            maxlength="120"
            autocomplete="off"
          />


          <div
            class="bondstats-action-buttons"
          >

            <button
              id="bondstats-action-cancel"
              class="bondstats-action-modal-button"
              type="button"
            >
              Cancel
            </button>


            <button
              id="bondstats-action-confirm"
              class="bondstats-action-modal-button"
              type="button"
            >
              Confirm
            </button>

          </div>


          <div
            id="bondstats-action-error"
          ></div>

        </div>

      `;


      document.body.appendChild(
        overlay
      );


      document
        .getElementById(
          "bondstats-action-cancel"
        )
        ?.addEventListener(
          "click",
          closeActionModal
        );


      overlay.addEventListener(
        "click",
        event => {

          if (
            event.target === overlay
          ) {

            closeActionModal();

          }

        }
      );
    }


    function closeActionModal() {

      const overlay =
        document.getElementById(
          "bondstats-history-action-modal"
        );


      if (overlay) {

        overlay.style.display =
          "none";

      }
    }


    /* ========================================================
        ACTION MODAL
       ======================================================== */

    function openActionModal({
      mode,
      conversationId,
      title = ""
    }) {

      createActionModal();


      const overlay =
        document.getElementById(
          "bondstats-history-action-modal"
        );


      const heading =
        document.getElementById(
          "bondstats-action-title"
        );


      const description =
        document.getElementById(
          "bondstats-action-description"
        );


      const input =
        document.getElementById(
          "bondstats-action-input"
        );


      const confirmButton =
        document.getElementById(
          "bondstats-action-confirm"
        );


      const errorBox =
        document.getElementById(
          "bondstats-action-error"
        );


      if (
        !overlay ||
        !heading ||
        !description ||
        !input ||
        !confirmButton
      ) {
        return;
      }


      if (errorBox) {
        errorBox.textContent = "";
      }


      if (mode === "rename") {

        heading.textContent =
          "Rename conversation";


        description.textContent =
          "Choose a new name for this conversation.";


        input.style.display =
          "block";


        input.value =
          title;


        confirmButton.textContent =
          "Save";


        confirmButton.style.background =
          "#75ff9b";


        confirmButton.style.color =
          "#06200f";


      } else {

        heading.textContent =
          "Delete conversation";


        description.textContent =
          "This permanently deletes this conversation and all of its stored messages.";


        input.style.display =
          "none";


        input.value =
          "";


        confirmButton.textContent =
          "Delete";


        confirmButton.style.background =
          "#ff8080";


        confirmButton.style.color =
          "#2b0505";

      }


      confirmButton.onclick =
        async () => {

          confirmButton.disabled =
            true;


          try {

            if (mode === "rename") {

              await performRename(
                conversationId,
                input.value
              );

            } else {

              await performDelete(
                conversationId
              );

            }

          } finally {

            confirmButton.disabled =
              false;

          }
        };


      overlay.style.display =
        "flex";


      if (mode === "rename") {

        window.setTimeout(
          () => {

            input.focus();
            input.select();

          },
          50
        );
      }
    }


    /* ========================================================
       MAIN UI
       ======================================================== */

    function createHistoryUI() {

      if (
        document.getElementById(
          "bondstats-history-button"
        )
      ) {
        return;
      }


      injectStyles();
      createToast();
      createActionModal();


      /* ------------------------------------------------------
         HISTORY BUTTON
         ------------------------------------------------------ */

      const historyButton =
        document.createElement(
          "button"
        );


      historyButton.id =
        "bondstats-history-button";


      historyButton.type =
        "button";


      historyButton.textContent =
        "History";


      /* ------------------------------------------------------
         MOUNT BUTTON
         ------------------------------------------------------ */

      function mountHistoryButton() {

        const accountButton =
          document.getElementById(
            "bondstats-account-trigger"
          );


        if (
          accountButton &&
          accountButton.parentElement
        ) {

          accountButton.parentElement
            .insertBefore(
              historyButton,
              accountButton
            );


          return true;
        }


        const candidates =
          document.querySelectorAll(
            "button, a, [role='button']"
          );


        for (
          const candidate
          of candidates
        ) {

          if (
            safeText(
              candidate.textContent
            ).toLowerCase() ===
            "new session"
          ) {

            if (
              candidate.parentElement
            ) {

              candidate.parentElement
                .insertBefore(
                  historyButton,
                  candidate
                );


              return true;
            }
          }
        }


        return false;
      }


      if (!mountHistoryButton()) {

        let attempts = 0;


        const timer =
          window.setInterval(
            () => {

              attempts += 1;


              if (
                mountHistoryButton() ||
                attempts >= 60
              ) {

                window.clearInterval(
                  timer
                );

              }

            },
            250
          );
      }


      /* ------------------------------------------------------
         DRAWER
         ------------------------------------------------------ */

      const backdrop =
        document.createElement(
          "div"
        );


      backdrop.id =
        "bondstats-history-backdrop";


      backdrop.innerHTML = `

        <aside
          id="bondstats-history-panel"
          aria-label="Chat history"
        >

          <div
            class="bondstats-history-header"
          >

            <div>

              <h2
                class="bondstats-history-heading"
              >
                Chat History
              </h2>


              <p
                class="bondstats-history-subtitle"
                id="bondstats-history-user"
              ></p>

            </div>


            <div
              class="bondstats-history-header-buttons"
            >

              <button
                class="bondstats-history-icon-button"
                id="bondstats-history-refresh"
                type="button"
                title="Refresh"
              >
                ↻
              </button>


              <button
                class="bondstats-history-icon-button"
                id="bondstats-history-close"
                type="button"
                title="Close"
              >
                ×
              </button>

            </div>

          </div>


          <div
            class="bondstats-history-toolbar"
          >

            <input
              id="bondstats-history-search"
              type="search"
              placeholder="Search conversations…"
              autocomplete="off"
            />


            <select
              id="bondstats-history-sort"
            >

              <option value="newest">
                Newest
              </option>

              <option value="oldest">
                Oldest
              </option>

              <option value="title">
                A–Z
              </option>

            </select>

          </div>


          <div
            id="bondstats-history-list"
          ></div>

        </aside>

      `;


      document.body.appendChild(
        backdrop
      );


      /* ------------------------------------------------------
         VIEWER
         ------------------------------------------------------ */

      const viewer =
        document.createElement(
          "div"
        );


      viewer.id =
        "bondstats-conversation-viewer";


      viewer.innerHTML = `

        <section
          id="bondstats-conversation-card"
        >

          <div
            class="bondstats-conversation-header"
          >

            <div
              id="bondstats-conversation-title"
            >
              Conversation
            </div>


            <div
              id="bondstats-conversation-date"
            ></div>

          </div>


          <div
            id="bondstats-conversation-messages"
          ></div>


          <div
            class="bondstats-conversation-footer"
          >

            <div
              class="bondstats-history-action-group"
            >

              <button
                id="bondstats-rename-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Rename
              </button>


              <button
                id="bondstats-duplicate-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Duplicate
              </button>


              <button
                id="bondstats-copy-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Copy
              </button>


              <button
                id="bondstats-export-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Export
              </button>


              <button
                id="bondstats-delete-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Delete
              </button>

            </div>


            <div
              class="bondstats-history-action-group"
            >

              <button
                id="bondstats-close-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Close
              </button>


              <button
                id="bondstats-continue-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Open & Continue
              </button>

            </div>

          </div>

        </section>

      `;


      document.body.appendChild(
        viewer
      );


      /* ======================================================
         EVENTS
         ====================================================== */

      historyButton.addEventListener(
        "click",
        openHistory
      );


      document
        .getElementById(
          "bondstats-history-close"
        )
        ?.addEventListener(
          "click",
          closeHistory
        );


      document
        .getElementById(
          "bondstats-history-refresh"
        )
        ?.addEventListener(
          "click",
          async () => {

            await loadConversations();

            showToast(
              "History refreshed"
            );

          }
        );


      document
        .getElementById(
          "bondstats-history-search"
        )
        ?.addEventListener(
          "input",
          event => {

            currentSearch =
              safeText(
                event.target.value
              );


            applyFilters();

          }
        );


      document
        .getElementById(
          "bondstats-history-sort"
        )
        ?.addEventListener(
          "change",
          event => {

            currentSort =
              event.target.value ||
              "newest";


            applyFilters();

          }
        );


      document
        .getElementById(
          "bondstats-close-conversation"
        )
        ?.addEventListener(
          "click",
          closeConversation
        );


      document
        .getElementById(
          "bondstats-rename-conversation"
        )
        ?.addEventListener(
          "click",
          renameActiveConversation
        );


      document
        .getElementById(
          "bondstats-delete-conversation"
        )
        ?.addEventListener(
          "click",
          deleteActiveConversation
        );


      document
        .getElementById(
          "bondstats-duplicate-conversation"
        )
        ?.addEventListener(
          "click",
          duplicateActiveConversation
        );


      document
        .getElementById(
          "bondstats-copy-conversation"
        )
        ?.addEventListener(
          "click",
          copyActiveConversation
        );


      document
        .getElementById(
          "bondstats-export-conversation"
        )
        ?.addEventListener(
          "click",
          exportActiveConversation
        );


      document
        .getElementById(
          "bondstats-continue-conversation"
        )
        ?.addEventListener(
          "click",
          continueConversation
        );


      backdrop.addEventListener(
        "click",
        event => {

          if (
            event.target ===
            backdrop
          ) {

            closeHistory();

          }

        }
      );


      viewer.addEventListener(
        "click",
        event => {

          if (
            event.target ===
            viewer
          ) {

            closeConversation();

          }

        }
      );
    }


    /* ========================================================
       AUTH
       ======================================================== */

    async function loadUser() {

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


        updateVisibility();


      } catch (error) {

        console.error(
          "[BondStats History] Session error:",
          error
        );

      }
    }


    function updateVisibility() {

      const button =
        document.getElementById(
          "bondstats-history-button"
        );


      const userLabel =
        document.getElementById(
          "bondstats-history-user"
        );


      if (button) {

        button.style.display =
          currentUser
            ? "inline-flex"
            : "none";

      }


      if (userLabel) {

        userLabel.textContent =
          currentUser?.email ||
          "";

      }


      if (!currentUser) {

        closeHistory();

        closeConversation();

      }
    }


    /* ========================================================
       OPEN HISTORY
       ======================================================== */

    async function openHistory() {

      if (!currentUser) {
        return;
      }


      const backdrop =
        document.getElementById(
          "bondstats-history-backdrop"
        );


      if (backdrop) {

        backdrop.style.display =
          "flex";

      }


      await loadConversations();
    }


    function closeHistory() {

      const backdrop =
        document.getElementById(
          "bondstats-history-backdrop"
        );


      if (backdrop) {

        backdrop.style.display =
          "none";

      }
    }


    /* ========================================================
       LOAD CONVERSATIONS
       ======================================================== */

    async function loadConversations() {

      if (!currentUser) {
        return;
      }


      const list =
        document.getElementById(
          "bondstats-history-list"
        );


      if (!list) {
        return;
      }


      list.innerHTML = `

        <div
          class="bondstats-history-empty"
        >
          Loading conversations…
        </div>

      `;


      try {

        const {
          data,
          error
        } =
          await db
            .from("conversations")
            .select(
              "id,title,created_at,updated_at"
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
            .limit(200);


        if (error) {
          throw error;
        }


        conversations =
          Array.isArray(data)
            ? data
            : [];


        applyFilters();


      } catch (error) {

        console.error(
          "[BondStats History] Conversation query:",
          error
        );


        list.innerHTML = `

          <div
            class="bondstats-history-empty"
          >
            History could not be loaded.
          </div>

        `;

      }
    }


    /* ========================================================
       SEARCH + SORT
       ======================================================== */

    function applyFilters() {

      const query =
        currentSearch
          .toLowerCase();


      filteredConversations =
        conversations.filter(
          conversation => {

            if (!query) {
              return true;
            }


            return safeText(
              conversation.title
            )
              .toLowerCase()
              .includes(query);

          }
        );


      if (
        currentSort === "oldest"
      ) {

        filteredConversations.sort(
          (a, b) =>
            new Date(
              a.updated_at ||
              a.created_at
            ) -
            new Date(
              b.updated_at ||
              b.created_at
            )
        );


      } else if (
        currentSort === "title"
      ) {

        filteredConversations.sort(
          (a, b) =>
            safeText(
              a.title
            ).localeCompare(
              safeText(
                b.title
              )
            )
        );


      } else {

        filteredConversations.sort(
          (a, b) =>
            new Date(
              b.updated_at ||
              b.created_at
            ) -
            new Date(
              a.updated_at ||
              a.created_at
            )
        );

      }


      renderConversationList();
    }


    /* ========================================================
       RENDER LIST
       ======================================================== */

    function renderConversationList() {

      const list =
        document.getElementById(
          "bondstats-history-list"
        );


      if (!list) {
        return;
      }


      if (
        filteredConversations.length ===
        0
      ) {

        list.innerHTML = `

          <div
            class="bondstats-history-empty"
          >
            ${
              currentSearch
                ? "No matching conversations."
                : "No saved conversations yet."
            }
          </div>

        `;

        return;
      }


      list.innerHTML =
        filteredConversations
          .map(
            conversation => `

              <div
                class="bondstats-history-item"
                data-conversation-id="${escapeHTML(
                  conversation.id
                )}"
              >

                <div
                  class="bondstats-history-item-main"
                >

                  <div
                    class="bondstats-history-title"
                  >
                    ${escapeHTML(
                      safeText(
                        conversation.title
                      ) ||
                      "Untitled conversation"
                    )}
                  </div>


                  <div
                    class="bondstats-history-time"
                  >
                    ${escapeHTML(
                      formatDate(
                        conversation.updated_at ||
                        conversation.created_at
                      )
                    )}
                  </div>

                </div>


                <button
                  class="bondstats-history-item-menu"
                  type="button"
                  title="Rename"
                >
                  •••
                </button>

              </div>

            `
          )
          .join("");


      list
        .querySelectorAll(
          ".bondstats-history-item"
        )
        .forEach(
          item => {

            const id =
              item.dataset
                .conversationId;


            item
              .querySelector(
                ".bondstats-history-item-main"
              )
              ?.addEventListener(
                "click",
                () => {

                  if (id) {

                    openConversation(
                      id
                    );

                  }

                }
              );


            item
              .querySelector(
                ".bondstats-history-item-menu"
              )
              ?.addEventListener(
                "click",
                event => {

                  event.stopPropagation();


                  const conversation =
                    getConversationById(
                      id
                    );


                  if (
                    id &&
                    conversation
                  ) {

                    openActionModal({
                      mode:
                        "rename",

                      conversationId:
                        id,

                      title:
                        conversation.title ||
                        ""
                    });

                  }

                }
              );

          }
        );
    }


    /* ========================================================
       OPEN CONVERSATION
       ======================================================== */

    async function openConversation(
      conversationId
    ) {

      if (
        !currentUser ||
        !conversationId
      ) {
        return;
      }


      activeConversationId =
        conversationId;


      const conversation =
        getConversationById(
          conversationId
        );


      const title =
        document.getElementById(
          "bondstats-conversation-title"
        );


      const date =
        document.getElementById(
          "bondstats-conversation-date"
        );


      const messages =
        document.getElementById(
          "bondstats-conversation-messages"
        );


      const viewer =
        document.getElementById(
          "bondstats-conversation-viewer"
        );


      if (
        !messages ||
        !viewer
      ) {
        return;
      }

      if (title) {

        title.textContent =
          safeText(
            conversation?.title
          ) ||
          "Conversation";

      }


      if (date) {

        date.textContent =
          formatDate(
            conversation?.updated_at ||
            conversation?.created_at
          );

      }


      messages.innerHTML = `

        <div
          class="bondstats-history-empty"
        >
          Loading messages…
        </div>

      `;


      viewer.style.display =
        "flex";


      try {

        const {
          data,
          error
        } =
          await db
            .from("messages")
            .select(
              "id,role,content,created_at"
            )
            .eq(
              "conversation_id",
              conversationId
            )
            .eq(
              "user_id",
              currentUser.id
            )
            .order(
              "created_at",
              {
                ascending: true
              }
            );
if (
  !error &&
  window.BondStatsSetConversationHistory
) {
  window.BondStatsSetConversationHistory(
    data || []
  );
}

        if (error) {
          throw error;
        }


        activeConversationMessages =
          Array.isArray(data)
            ? data
            : [];


        renderMessages(
          activeConversationMessages
        );


      } catch (error) {

        console.error(
          "[BondStats History] Message query:",
          error
        );


        messages.innerHTML = `

          <div
            class="bondstats-history-empty"
          >
            Messages could not be loaded.
          </div>

        `;

      }
    }


    /* ========================================================
       RENDER MESSAGES
       ======================================================== */

    function renderMessages(items) {

      const container =
        document.getElementById(
          "bondstats-conversation-messages"
        );


      if (!container) {
        return;
      }


      if (
        items.length === 0
      ) {

        container.innerHTML = `

          <div
            class="bondstats-history-empty"
          >
            No messages stored for this conversation.
          </div>

        `;

        return;
      }


      container.innerHTML =
        items
          .map(
            message => {

              const role =
                message.role ===
                "user"
                  ? "user"
                  : "assistant";


              const roleLabel =
                role === "user"
                  ? "You"
                  : "BondStats AI";


              return `

                <article
                  class="
                    bondstats-history-message
                    bondstats-history-message-${role}
                  "
                >

                  <div
                    class="bondstats-message-role"
                  >
                    ${roleLabel}
                  </div>


                  ${escapeHTML(
                    safeText(
                      message.content
                    )
                  )}

                </article>

              `;

            }
          )
          .join("");


      container.scrollTop =
        container.scrollHeight;
    }


    /* ========================================================
       RENAME
       ======================================================== */

    function renameActiveConversation() {

      if (!activeConversationId) {
        return;
      }


      const conversation =
        getConversationById(
          activeConversationId
        );


      if (!conversation) {
        return;
      }


      openActionModal({
        mode:
          "rename",

        conversationId:
          activeConversationId,

        title:
          conversation.title ||
          ""
      });
    }


    async function performRename(
      conversationId,
      requestedTitle
    ) {

      if (
        !currentUser ||
        !conversationId
      ) {
        return;
      }


      const newTitle =
        safeText(
          requestedTitle
        );


      const errorBox =
        document.getElementById(
          "bondstats-action-error"
        );


      if (!newTitle) {

        if (errorBox) {

          errorBox.textContent =
            "Enter a conversation name.";

        }

        return;
      }


      try {

        const now =
          new Date()
            .toISOString();


        const {
          error
        } =
          await db
            .from("conversations")
            .update({
              title:
                newTitle,

              updated_at:
                now
            })
            .eq(
              "id",
              conversationId
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (error) {
          throw error;
        }


        const conversation =
          getConversationById(
            conversationId
          );


        if (conversation) {

          conversation.title =
            newTitle;


          conversation.updated_at =
            now;

        }


        applyFilters();


        if (
          activeConversationId ===
          conversationId
        ) {

          const title =
            document.getElementById(
              "bondstats-conversation-title"
            );


          if (title) {

            title.textContent =
              newTitle;

          }

        }


        closeActionModal();


        showToast(
          "Conversation renamed"
        );


      } catch (error) {

        console.error(
          "[BondStats History] Rename failed:",
          error
        );


        if (errorBox) {

          errorBox.textContent =
            error?.message ||
            "Conversation could not be renamed.";

        }
      }
    }


    /* ========================================================
       DELETE
       ======================================================== */

    function deleteActiveConversation() {

      if (!activeConversationId) {
        return;
      }


      openActionModal({
        mode:
          "delete",

        conversationId:
          activeConversationId
      });
    }


    async function performDelete(
      conversationId
    ) {

      if (
        !currentUser ||
        !conversationId
      ) {
        return;
      }


      const errorBox =
        document.getElementById(
          "bondstats-action-error"
        );


      try {

        const {
          error:
            messageError
        } =
          await db
            .from("messages")
            .delete()
            .eq(
              "conversation_id",
              conversationId
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (messageError) {
          throw messageError;
        }


        const {
          error:
            conversationError
        } =
          await db
            .from("conversations")
            .delete()
            .eq(
              "id",
              conversationId
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (
          conversationError
        ) {
          throw conversationError;
        }


        conversations =
          conversations.filter(
            item =>
              item.id !==
              conversationId
          );


        activeConversationId =
          null;


        activeConversationMessages =
          [];


        closeActionModal();


        closeConversation();


        applyFilters();


        showToast(
          "Conversation deleted"
        );


      } catch (error) {

        console.error(
          "[BondStats History] Delete failed:",
          error
        );


        if (errorBox) {

          errorBox.textContent =
            error?.message ||
            "Conversation could not be deleted.";

        }
      }
    }


    /* ========================================================
       DUPLICATE
       ======================================================== */

    async function duplicateActiveConversation() {

      if (
        !currentUser ||
        !activeConversationId
      ) {
        return;
      }


      const original =
        getConversationById(
          activeConversationId
        );


      if (!original) {
        return;
      }


      try {

        const {
          data:
            newConversation,
          error:
            conversationError
        } =
          await db
            .from("conversations")
            .insert({
              user_id:
                currentUser.id,

              title:
                `${
                  safeText(
                    original.title
                  ) ||
                  "Conversation"
                } (Copy)`
            })
            .select(
              "id,title,created_at,updated_at"
            )
            .single();


        if (
          conversationError
        ) {
          throw conversationError;
        }


        if (
          activeConversationMessages.length
        ) {

          const clonedMessages =
            activeConversationMessages
              .map(
                message => ({
                  conversation_id:
                    newConversation.id,

                  user_id:
                    currentUser.id,

                  role:
                    message.role,

                  content:
                    message.content
                })
              );


          const {
            error:
              messageError
          } =
            await db
              .from("messages")
              .insert(
                clonedMessages
              );


          if (
            messageError
          ) {
            throw messageError;
          }
        }


        conversations.unshift(
          newConversation
        );


        applyFilters();


        showToast(
          "Conversation duplicated"
        );


      } catch (error) {

        console.error(
          "[BondStats History] Duplicate failed:",
          error
        );


        showToast(
          "Duplicate failed"
        );
      }
    }


    /* ========================================================
       COPY
       ======================================================== */

    function conversationAsText() {

      const conversation =
        getConversationById(
          activeConversationId
        );


      const title =
        safeText(
          conversation?.title
        ) ||
        "BondStats Conversation";


      const lines = [
        title,
        "=".repeat(
          Math.min(
            title.length,
            70
          )
        ),
        ""
      ];


      for (
        const message
        of activeConversationMessages
      ) {

        const role =
          message.role === "user"
            ? "You"
            : "BondStats AI";


        lines.push(
          `${role}:`
        );


        lines.push(
          safeText(
            message.content
          )
        );


        lines.push("");
      }


      return lines.join("\n");
    }


    async function copyActiveConversation() {

      if (!activeConversationId) {
        return;
      }


      const content =
        conversationAsText();


      try {

        await navigator.clipboard
          .writeText(
            content
          );


        showToast(
          "Conversation copied"
        );


      } catch (error) {

        console.error(
          "[BondStats History] Clipboard failed:",
          error
        );


        showToast(
          "Copy failed"
        );
      }
    }


    /* ========================================================
       EXPORT TXT
       ======================================================== */

    function exportActiveConversation() {

      if (!activeConversationId) {
        return;
      }


      const conversation =
        getConversationById(
          activeConversationId
        );


      const content =
        conversationAsText();


      const blob =
        new Blob(
          [content],
          {
            type:
              "text/plain;charset=utf-8"
          }
        );


      const url =
        URL.createObjectURL(
          blob
        );


      const link =
        document.createElement(
          "a"
        );


      link.href =
        url;


      link.download =
        `${
          normalizeFilename(
            conversation?.title
          )
        }.txt`;


      document.body.appendChild(
        link
      );


      link.click();


      link.remove();


      window.setTimeout(
        () => {

          URL.revokeObjectURL(
            url
          );

        },
        500
      );


      showToast(
        "Conversation exported"
      );
    }


    /* ========================================================
       OPEN & CONTINUE
       ======================================================== */

    async function continueConversation() {

      if (
        !currentUser ||
        !activeConversationId
      ) {
        return;
      }


      const conversation =
        getConversationById(
          activeConversationId
        );


      if (!conversation) {
        return;
      }


      try {

        const now =
          new Date()
            .toISOString();


        const {
          error
        } =
          await db
            .from("conversations")
            .update({
              updated_at:
                now
            })
            .eq(
              "id",
              activeConversationId
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (error) {
          throw error;
        }


        localStorage.setItem(
          "bondstats_selected_conversation",
          activeConversationId
        );


        localStorage.setItem(
          "bondstats_selected_conversation_title",
          conversation.title ||
          "Conversation"
        );


        showToast(
          `Continuing: ${
            conversation.title ||
            "Conversation"
          }`
        );


        closeConversation();

        closeHistory();


        /*
          account.js already loads the most recently
          updated conversation after reload.

          We deliberately do NOT manipulate app.js.
        */

        window.setTimeout(
          () => {

            window.location.reload();

          },
          700
        );


      } catch (error) {

        console.error(
          "[BondStats History] Continue failed:",
          error
        );


        showToast(
          "Conversation could not be continued"
        );
      }
    }


    /* ========================================================
       CLOSE VIEWER
       ======================================================== */

    function closeConversation() {

      const viewer =
        document.getElementById(
          "bondstats-conversation-viewer"
        );


      if (viewer) {

        viewer.style.display =
          "none";

      }


      activeConversationId =
        null;


      activeConversationMessages =
        [];
    }


    /* ========================================================
       RESTORE CONTINUE NOTICE
       ======================================================== */

    function restoreContinueNotice() {

      const selectedId =
        localStorage.getItem(
          "bondstats_selected_conversation"
        );


      const title =
        localStorage.getItem(
          "bondstats_selected_conversation_title"
        );


      if (!selectedId) {
        return;
      }


      window.setTimeout(
        () => {

          showToast(
            `Active conversation: ${
              title ||
              "Conversation"
            }`
          );

        },
        700
      );
    }


    /* ========================================================
       AUTH EVENTS
       ======================================================== */


    /* ========================================================
       START
       ======================================================== */

    async function start() {

      try {

        createHistoryUI();


        await loadUser();


        restoreContinueNotice();


        console.log(
          "[BondStats History] V3 ready.",
          {
            authenticated:
              Boolean(
                currentUser
              )
          }
        );


      } catch (error) {

        console.error(
          "[BondStats History] Startup failed:",
          error
        );

      }
    }


    /* ========================================================
       DOM READY
       ======================================================== */

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
      Final isolation layer.

      Even if history.js dies completely,
      BondStats AI itself remains operational.
    */

    console.error(
      "[BondStats History] Fatal isolated error:",
      fatalError
    );

  }

})();
