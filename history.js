"use strict";

/* ============================================================
   BONDSTATS AI — CHAT HISTORY
   Stable isolated edition
   ============================================================

   DESIGN RULES

   - Uses the SAME Supabase client as account.js
   - Creates NO second Supabase client
   - Creates NO auth listener
   - Does NOT save normal chat messages
   - Does NOT intercept forms
   - Does NOT intercept Enter
   - Does NOT touch Analyze
   - Does NOT modify app.js
   - Does NOT modify account.js state
   - History failures cannot stop BondStats AI

   FEATURES

   ✓ History drawer
   ✓ Search
   ✓ Sort
   ✓ Refresh
   ✓ View conversation
   ✓ Rename
   ✓ Delete
   ✓ Duplicate
   ✓ Copy
   ✓ TXT export
   ✓ Continue selection
   ✓ Automatic refresh whenever History opens
   ============================================================ */

(() => {
  "use strict";

  try {

    /* ========================================================
       INTERNAL STATE
       ======================================================== */

    let db = null;

    let currentUser = null;

    let conversations = [];

    let visibleConversations = [];

    let activeConversationId = null;

    let activeMessages = [];

    let searchQuery = "";

    let sortMode = "newest";

    let toastTimer = null;


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function text(value) {
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

      if (!value) return "";

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


    function getConversation(id) {

      return conversations.find(
        conversation =>
          conversation.id === id
      ) || null;

    }


    function safeFilename(value) {

      return String(
        value || "BondStats Conversation"
      )
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90);

    }


    /* ========================================================
       SHARED SUPABASE CLIENT
       ======================================================== */

    function resolveDatabaseClient() {

      /*
        IMPORTANT:

        history.js MUST NOT call createClient().

        account.js owns the only Supabase client and exposes it:

        window.BondStatsSupabase = supabaseClient;
      */

      db =
        window.BondStatsSupabase ||
        null;


      if (!db) {

        console.warn(
          "[BondStats History] Shared Supabase client is not available."
        );

        return false;

      }


      return true;
    }


    /* ========================================================
       LOAD CURRENT USER
       ======================================================== */

    async function loadCurrentUser() {

      if (!db) return null;


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


        updateHistoryButton();


        return currentUser;


      } catch (error) {

        console.error(
          "[BondStats History] getSession failed:",
          error
        );


        currentUser = null;

        updateHistoryButton();

        return null;

      }
    }


    /* ========================================================
       STYLES
       ======================================================== */

    function installStyles() {

      if (
        document.getElementById(
          "bondstats-history-styles"
        )
      ) {
        return;
      }


      const style =
        document.createElement("style");


      style.id =
        "bondstats-history-styles";


      style.textContent = `

        /* ==========================================
           HISTORY BUTTON
           ========================================== */

        #bondstats-history-trigger {
          position: relative !important;
          inset: auto !important;

          display: none;
          align-items: center;
          justify-content: center;

          min-height: 38px;

          padding: 0 14px;
          margin-right: 8px;

          flex: 0 0 auto;

          border-radius: 999px;

          border:
            1px solid rgba(116,255,157,.32);

          background:
            rgba(7,29,18,.78);

          color: #ecfff1;

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

          transition:
            .16s ease;
        }


        #bondstats-history-trigger:hover {
          background:
            rgba(16,55,34,.94);

          border-color:
            rgba(116,255,157,.67);

          transform:
            translateY(-1px);
        }


        /* ==========================================
           HISTORY OVERLAY
           ========================================== */

        #bondstats-history-overlay {
          position: fixed;

          inset: 0;

          display: none;

          justify-content: flex-end;

          z-index: 999998;

          background:
            rgba(0,0,0,.57);

          backdrop-filter:
            blur(7px);
        }


        #bondstats-history-drawer {
          width:
            min(470px, 95vw);

          height: 100%;

          display: flex;
          flex-direction: column;

          overflow: hidden;

          color: #effff4;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          background:
            linear-gradient(
              180deg,
              rgba(15,47,31,.995),
              rgba(5,18,12,.998)
            );

          border-left:
            1px solid rgba(119,255,160,.25);

          box-shadow:
            -30px 0 90px rgba(0,0,0,.48);
        }


        #bondstats-history-drawer * {
          box-sizing: border-box;
        }


        /* ==========================================
           HEADER
           ========================================== */

        .bsh-header {
          flex: 0 0 auto;

          display: flex;

          justify-content: space-between;
          align-items: center;

          gap: 12px;

          padding:
            21px 20px 16px;

          border-bottom:
            1px solid rgba(120,255,165,.12);
        }


        .bsh-heading {
          margin: 0;

          font-size: 21px;
          font-weight: 700;
        }


        #bsh-user {
          margin: 5px 0 0;

          color:
            rgba(225,255,234,.55);

          font-size: 11px;
        }


        .bsh-header-buttons {
          display: flex;

          gap: 7px;
        }


        .bsh-circle-button {
          width: 35px;
          height: 35px;

          display: flex;

          align-items: center;
          justify-content: center;

          border-radius: 50%;

          border:
            1px solid rgba(130,255,170,.18);

          background:
            rgba(255,255,255,.04);

          color: white;

          cursor: pointer;

          font-size: 16px;
        }


        .bsh-circle-button:hover {
          background:
            rgba(255,255,255,.09);
        }


        /* ==========================================
           TOOLBAR
           ========================================== */

        .bsh-toolbar {
          flex: 0 0 auto;

          display: grid;

          grid-template-columns:
            minmax(0,1fr) 125px;

          gap: 8px;

          padding:
            12px 12px 6px;
        }


        #bsh-search,
        #bsh-sort {
          width: 100%;
          height: 42px;

          outline: none;

          border-radius: 12px;

          border:
            1px solid rgba(120,255,165,.17);

          background:
            rgba(0,0,0,.23);

          color: #effff4;

          font-size: 13px;
        }


        #bsh-search {
          padding:
            0 13px;
        }


        #bsh-sort {
          padding:
            0 10px;

          cursor: pointer;
        }


        #bsh-search:focus,
        #bsh-sort:focus {
          border-color:
            rgba(120,255,165,.50);
        }


        /* ==========================================
           LIST
           ========================================== */

        #bsh-list {
          flex: 1;

          overflow-y: auto;

          padding: 10px;
        }


        .bsh-empty {
          padding:
            40px 18px;

          text-align: center;

          color:
            rgba(225,255,234,.48);

          font-size: 13px;

          line-height: 1.65;
        }


        .bsh-item {
          width: 100%;

          display: flex;

          align-items: center;

          gap: 9px;

          margin-bottom: 7px;

          padding:
            13px 11px 13px 14px;

          border-radius: 13px;

          border:
            1px solid rgba(126,255,167,.12);

          background:
            rgba(0,0,0,.17);

          transition:
            .15s ease;
        }


        .bsh-item:hover {
          background:
            rgba(34,105,64,.23);

          border-color:
            rgba(126,255,167,.29);
        }


        .bsh-item-body {
          min-width: 0;

          flex: 1;

          cursor: pointer;
        }


        .bsh-item-title {
          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;

          color: #effff4;

          font-size: 13px;
          font-weight: 600;
        }


        .bsh-item-date {
          margin-top: 5px;

          color:
            rgba(222,255,232,.45);

          font-size: 10px;
        }


        .bsh-item-rename {
          width: 31px;
          height: 31px;

          border: 0;

          border-radius: 9px;

          background:
            rgba(255,255,255,.04);

          color:
            rgba(235,255,241,.7);

          cursor: pointer;

          font-size: 17px;
        }


        .bsh-item-rename:hover {
          background:
            rgba(255,255,255,.09);

          color: white;
        }


        /* ==========================================
           CONVERSATION VIEWER
           ========================================== */

        #bsh-viewer {
          position: fixed;

          inset: 0;

          z-index: 999999;

          display: none;

          align-items: center;
          justify-content: center;

          padding: 22px;

          background:
            rgba(0,0,0,.74);

          backdrop-filter:
            blur(11px);
        }


        #bsh-viewer-card {
          width:
            min(820px, 96vw);

          max-height:
            90vh;

          display: flex;

          flex-direction: column;

          overflow: hidden;

          border-radius: 20px;

          border:
            1px solid rgba(115,255,158,.24);

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
            0 40px 120px rgba(0,0,0,.67);
        }


        #bsh-viewer-card * {
          box-sizing: border-box;
        }


        .bsh-viewer-header {
          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 15px;

          padding:
            18px 20px;

          border-bottom:
            1px solid rgba(120,255,165,.12);
        }


        #bsh-viewer-title {
          min-width: 0;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;

          font-size: 16px;
          font-weight: 700;
        }


        #bsh-viewer-date {
          flex: 0 0 auto;

          color:
            rgba(225,255,234,.42);

          font-size: 10px;
        }


        #bsh-messages {
          flex: 1;

          overflow-y: auto;

          padding: 20px;
        }


        .bsh-message {
          max-width: 88%;

          margin-bottom: 14px;

          padding:
            12px 14px;

          border-radius: 14px;

          font-size: 13px;

          line-height: 1.55;

          white-space: pre-wrap;

          overflow-wrap: anywhere;
        }


        .bsh-message-user {
          margin-left: auto;

          background:
            rgba(104,255,153,.16);

          border:
            1px solid rgba(112,255,159,.26);
        }


        .bsh-message-assistant {
          margin-right: auto;

          background:
            rgba(0,0,0,.25);

          border:
            1px solid rgba(112,255,159,.10);
        }


        .bsh-message-role {
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

        .bsh-viewer-footer {
          flex: 0 0 auto;

          display: flex;

          justify-content: space-between;

          align-items: center;

          flex-wrap: wrap;

          gap: 9px;

          padding:
            14px 20px;

          border-top:
            1px solid rgba(120,255,165,.12);
        }


        .bsh-actions {
          display: flex;

          align-items: center;

          flex-wrap: wrap;

          gap: 7px;
        }


        .bsh-action {
          min-height: 38px;

          padding:
            0 12px;

          border-radius: 10px;

          border:
            1px solid rgba(130,255,170,.20);

          background:
            rgba(255,255,255,.04);

          color: white;

          cursor: pointer;

          font-size: 12px;
        }


        .bsh-action:hover {
          background:
            rgba(255,255,255,.09);
        }


        #bsh-delete {
          color: #ffbcbc;

          border-color:
            rgba(255,110,110,.28);

          background:
            rgba(100,15,15,.16);
        }


        #bsh-continue {
          color: #caffd8;

          font-weight: 700;

          border-color:
            rgba(117,255,155,.48);

          background:
            rgba(63,190,102,.17);
        }


        /* ==========================================
           CUSTOM MODAL
           ========================================== */

        #bsh-modal {
          position: fixed;

          inset: 0;

          z-index: 10000000;

          display: none;

          align-items: center;
          justify-content: center;

          padding: 20px;

          background:
            rgba(0,0,0,.75);

          backdrop-filter:
            blur(10px);
        }


        #bsh-modal-card {
          width:
            min(410px,94vw);

          padding: 24px;

          border-radius: 20px;

          border:
            1px solid rgba(115,255,158,.28);

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
            0 30px 100px rgba(0,0,0,.66);
        }


        #bsh-modal-title {
          margin:
            0 0 8px;

          font-size: 19px;
        }


        #bsh-modal-description {
          margin:
            0 0 18px;

          color:
            rgba(230,255,238,.65);

          font-size: 13px;

          line-height: 1.5;
        }


        #bsh-modal-input {
          width: 100%;

          height: 43px;

          margin-bottom: 17px;

          padding:
            0 13px;

          border-radius: 11px;

          border:
            1px solid rgba(120,255,165,.25);

          outline: none;

          background:
            rgba(0,0,0,.25);

          color: white;

          font-size: 14px;
        }


        .bsh-modal-buttons {
          display: flex;

          justify-content: flex-end;

          gap: 9px;
        }


        .bsh-modal-button {
          height: 39px;

          padding:
            0 14px;

          border-radius: 10px;

          cursor: pointer;
        }


        #bsh-modal-cancel {
          border:
            1px solid rgba(255,255,255,.15);

          background:
            rgba(255,255,255,.04);

          color: white;
        }


        #bsh-modal-confirm {
          border:
            1px solid rgba(120,255,165,.35);

          background: #75ff9b;

          color: #06200f;

          font-weight: 700;
        }


        #bsh-modal-error {
          min-height: 16px;

          margin-top: 10px;

          color: #ffb5b5;

          font-size: 11px;
        }


        /* ==========================================
           TOAST
           ========================================== */

        #bsh-toast {
          position: fixed;

          left: 50%;
          bottom: 24px;

          z-index: 10000001;

          max-width: 90vw;

          opacity: 0;

          pointer-events: none;

          transform:
            translateX(-50%)
            translateY(25px);

          padding:
            11px 17px;

          border-radius: 999px;

          border:
            1px solid rgba(117,255,155,.35);

          background:
            rgba(5,27,16,.97);

          color: #dcffe6;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 12px;

          transition:
            .2s ease;
        }


        #bsh-toast.visible {
          opacity: 1;

          transform:
            translateX(-50%)
            translateY(0);
        }


        @media (max-width:700px) {

          .bsh-toolbar {
            grid-template-columns: 1fr;
          }


          #bsh-viewer {
            padding: 10px;
          }


          #bsh-viewer-card {
            max-height: 95vh;
          }


          .bsh-actions {
            width: 100%;
          }


          .bsh-action {
            flex: 1;
          }

        }

      `;


      document.head.appendChild(
        style
      );
    }


    /* ========================================================
       UI CREATION
       ======================================================== */

    function createUI() {

      if (
        document.getElementById(
          "bondstats-history-trigger"
        )
      ) {
        return;
      }


      installStyles();


      /* ------------------------------------------------------
         HISTORY BUTTON
         ------------------------------------------------------ */

      const historyButton =
        document.createElement("button");


      historyButton.id =
        "bondstats-history-trigger";


      historyButton.type =
        "button";


      historyButton.textContent =
        "History";


      /* ------------------------------------------------------
         ATTACH BUTTON SAFELY
         ------------------------------------------------------ */

      function attachHistoryButton() {

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


        return false;
      }


      if (!attachHistoryButton()) {

        let attempts = 0;


        const timer =
          window.setInterval(
            () => {

              attempts += 1;


              if (
                attachHistoryButton() ||
                attempts >= 80
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

      const overlay =
        document.createElement("div");


      overlay.id =
        "bondstats-history-overlay";


      overlay.innerHTML = `

        <aside
          id="bondstats-history-drawer"
        >

          <header
            class="bsh-header"
          >

            <div>

              <h2
                class="bsh-heading"
              >
                Chat History
              </h2>

              <p
                id="bsh-user"
              ></p>

            </div>


            <div
              class="bsh-header-buttons"
            >

              <button
                id="bsh-refresh"
                class="bsh-circle-button"
                type="button"
                title="Refresh"
              >
                ↻
              </button>

              <button
                id="bsh-close"
                class="bsh-circle-button"
                type="button"
                title="Close"
              >
                ×
              </button>

            </div>

          </header>


          <div
            class="bsh-toolbar"
          >

            <input
              id="bsh-search"
              type="search"
              placeholder="Search conversations…"
              autocomplete="off"
            />


            <select
              id="bsh-sort"
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
            id="bsh-list"
          ></div>

        </aside>

      `;


      document.body.appendChild(
        overlay
      );


      /* ------------------------------------------------------
         VIEWER
         ------------------------------------------------------ */

      const viewer =
        document.createElement("div");


      viewer.id =
        "bsh-viewer";


      viewer.innerHTML = `

        <section
          id="bsh-viewer-card"
        >

          <header
            class="bsh-viewer-header"
          >

            <div
              id="bsh-viewer-title"
            >
              Conversation
            </div>


            <div
              id="bsh-viewer-date"
            ></div>

          </header>


          <div
            id="bsh-messages"
          ></div>


          <footer
            class="bsh-viewer-footer"
          >

            <div
              class="bsh-actions"
            >

              <button
                id="bsh-rename"
                class="bsh-action"
                type="button"
              >
                Rename
              </button>


              <button
                id="bsh-duplicate"
                class="bsh-action"
                type="button"
              >
                Duplicate
              </button>


              <button
                id="bsh-copy"
                class="bsh-action"
                type="button"
              >
                Copy
              </button>


              <button
                id="bsh-export"
                class="bsh-action"
                type="button"
              >
                Export
              </button>


              <button
                id="bsh-delete"
                class="bsh-action"
                type="button"
              >
                Delete
              </button>

            </div>


            <div
              class="bsh-actions"
            >

              <button
                id="bsh-viewer-close"
                class="bsh-action"
                type="button"
              >
                Close
              </button>


              <button
                id="bsh-continue"
                class="bsh-action"
                type="button"
              >
                Open & Continue
              </button>

            </div>

          </footer>

        </section>

      `;


      document.body.appendChild(
        viewer
      );


      /* ------------------------------------------------------
         MODAL
         ------------------------------------------------------ */

      const modal =
        document.createElement("div");


      modal.id =
        "bsh-modal";


      modal.innerHTML = `

        <section
          id="bsh-modal-card"
        >

          <h3
            id="bsh-modal-title"
          ></h3>


          <p
            id="bsh-modal-description"
          ></p>


          <input
            id="bsh-modal-input"
            type="text"
            maxlength="120"
            autocomplete="off"
          />


          <div
            class="bsh-modal-buttons"
          >

            <button
              id="bsh-modal-cancel"
              class="bsh-modal-button"
              type="button"
            >
              Cancel
            </button>


            <button
              id="bsh-modal-confirm"
              class="bsh-modal-button"
              type="button"
            >
              Confirm
            </button>

          </div>


          <div
            id="bsh-modal-error"
          ></div>

        </section>

      `;


      document.body.appendChild(
        modal
      );


      /* ------------------------------------------------------
         TOAST
         ------------------------------------------------------ */

      const toast =
        document.createElement("div");


      toast.id =
        "bsh-toast";


      document.body.appendChild(
        toast
      );


      installEvents(
        historyButton,
        overlay,
        viewer,
        modal
      );
    }


    /* ========================================================
       EVENTS
       ======================================================== */

    function installEvents(
      historyButton,
      overlay,
      viewer,
      modal
    ) {

      historyButton.addEventListener(
        "click",
        openHistory
      );


      document
        .getElementById("bsh-close")
        ?.addEventListener(
          "click",
          closeHistory
        );


      document
        .getElementById("bsh-refresh")
        ?.addEventListener(
          "click",
          async () => {

            await refreshHistory();

            showToast(
              "History refreshed"
            );

          }
        );


      document
        .getElementById("bsh-search")
        ?.addEventListener(
          "input",
          event => {

            searchQuery =
              text(
                event.target.value
              );


            applyFilters();

          }
        );


      document
        .getElementById("bsh-sort")
        ?.addEventListener(
          "change",
          event => {

            sortMode =
              event.target.value ||
              "newest";


            applyFilters();

          }
        );


      document
        .getElementById(
          "bsh-viewer-close"
        )
        ?.addEventListener(
          "click",
          closeViewer
        );


      document
        .getElementById(
          "bsh-rename"
        )
        ?.addEventListener(
          "click",
          openRenameForActive
        );


      document
        .getElementById(
          "bsh-delete"
        )
        ?.addEventListener(
          "click",
          openDeleteForActive
        );


      document
        .getElementById(
          "bsh-duplicate"
        )
        ?.addEventListener(
          "click",
          duplicateConversation
        );


      document
        .getElementById(
          "bsh-copy"
        )
        ?.addEventListener(
          "click",
          copyConversation
        );


      document
        .getElementById(
          "bsh-export"
        )
        ?.addEventListener(
          "click",
          exportConversation
        );


      document
        .getElementById(
          "bsh-continue"
        )
        ?.addEventListener(
          "click",
          continueConversation
        );


      document
        .getElementById(
          "bsh-modal-cancel"
        )
        ?.addEventListener(
          "click",
          closeModal
        );


      overlay.addEventListener(
        "click",
        event => {

          if (
            event.target === overlay
          ) {
            closeHistory();
          }

        }
      );


      viewer.addEventListener(
        "click",
        event => {

          if (
            event.target === viewer
          ) {
            closeViewer();
          }

        }
      );


      modal.addEventListener(
        "click",
        event => {

          if (
            event.target === modal
          ) {
            closeModal();
          }

        }
      );
    }


    /* ========================================================
       BUTTON VISIBILITY
       ======================================================== */

    function updateHistoryButton() {

      const button =
        document.getElementById(
          "bondstats-history-trigger"
        );


      const label =
        document.getElementById(
          "bsh-user"
        );


      if (button) {

        button.style.display =
          currentUser
            ? "inline-flex"
            : "none";

      }


      if (label) {

        label.textContent =
          currentUser?.email ||
          "";

      }
    }


    /* ========================================================
       OPEN HISTORY
       ======================================================== */

    async function openHistory() {

      /*
        Always refresh auth directly.

        No onAuthStateChange listener.
      */

      await loadCurrentUser();


      if (!currentUser) {

        showToast(
          "Sign in to view chat history"
        );

        return;

      }


      const overlay =
        document.getElementById(
          "bondstats-history-overlay"
        );


      if (overlay) {

        overlay.style.display =
          "flex";

      }


      /*
        IMPORTANT:

        Every opening performs a fresh database query.

        Therefore newly saved chats cannot be hidden by
        stale history.js state.
      */

      await refreshHistory();
    }


    function closeHistory() {

      const overlay =
        document.getElementById(
          "bondstats-history-overlay"
        );


      if (overlay) {

        overlay.style.display =
          "none";

      }
    }


    /* ========================================================
       LOAD CONVERSATIONS
       ======================================================== */

    async function refreshHistory() {

      if (
        !db ||
        !currentUser
      ) {
        return;
      }


      const list =
        document.getElementById(
          "bsh-list"
        );


      if (!list) return;


      list.innerHTML = `

        <div
          class="bsh-empty"
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
            .limit(250);


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
          "[BondStats History] refresh failed:",
          error
        );


        list.innerHTML = `

          <div
            class="bsh-empty"
          >
            History could not be loaded.
          </div>

        `;

      }
    }


    /* ========================================================
       SEARCH / SORT
       ======================================================== */

    function applyFilters() {

      const query =
        searchQuery.toLowerCase();


      visibleConversations =
        conversations.filter(
          conversation => {

            if (!query) {
              return true;
            }


            return text(
              conversation.title
            )
              .toLowerCase()
              .includes(query);

          }
        );


      if (
        sortMode === "oldest"
      ) {

        visibleConversations.sort(
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
        sortMode === "title"
      ) {

        visibleConversations.sort(
          (a, b) =>
            text(
              a.title
            ).localeCompare(
              text(
                b.title
              )
            )
        );


      } else {

        visibleConversations.sort(
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


      renderList();
    }


    /* ========================================================
       RENDER LIST
       ======================================================== */

    function renderList() {

      const list =
        document.getElementById(
          "bsh-list"
        );


      if (!list) return;


      if (
        visibleConversations.length === 0
      ) {

        list.innerHTML = `

          <div
            class="bsh-empty"
          >

            ${
              searchQuery
                ? "No matching conversations."
                : "No saved conversations yet."
            }

          </div>

        `;


        return;
      }


      list.innerHTML =
        visibleConversations
          .map(
            conversation => `

              <div
                class="bsh-item"
                data-id="${escapeHTML(
                  conversation.id
                )}"
              >

                <div
                  class="bsh-item-body"
                >

                  <div
                    class="bsh-item-title"
                  >
                    ${escapeHTML(
                      text(
                        conversation.title
                      ) ||
                      "Untitled conversation"
                    )}
                  </div>


                  <div
                    class="bsh-item-date"
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
                  class="bsh-item-rename"
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
          ".bsh-item"
        )
        .forEach(
          item => {

            const id =
              item.dataset.id;


            item
              .querySelector(
                ".bsh-item-body"
              )
              ?.addEventListener(
                "click",
                () => {

                  openConversation(
                    id
                  );

                }
              );


            item
              .querySelector(
                ".bsh-item-rename"
              )
              ?.addEventListener(
                "click",
                event => {

                  event.stopPropagation();


                  openRenameModal(
                    id
                  );

                }
              );

          }
        );
    }


    /* ========================================================
       OPEN CONVERSATION
       ======================================================== */

    async function openConversation(id) {

      if (
        !db ||
        !currentUser ||
        !id
      ) {
        return;
      }


      activeConversationId = id;

      activeMessages = [];


      const conversation =
        getConversation(id);


      const title =
        document.getElementById(
          "bsh-viewer-title"
        );


      const date =
        document.getElementById(
          "bsh-viewer-date"
        );


      const container =
        document.getElementById(
          "bsh-messages"
        );


      const viewer =
        document.getElementById(
          "bsh-viewer"
        );


      if (
        !container ||
        !viewer
      ) {
        return;
      }


      if (title) {

        title.textContent =
          text(
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


      container.innerHTML = `

        <div
          class="bsh-empty"
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
              id
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


        if (error) {
          throw error;
        }


        activeMessages =
          Array.isArray(data)
            ? data
            : [];


        renderMessages();


      } catch (error) {

        console.error(
          "[BondStats History] messages failed:",
          error
        );


        container.innerHTML = `

          <div
            class="bsh-empty"
          >
            Messages could not be loaded.
          </div>

        `;

      }
    }


    /* ========================================================
       RENDER MESSAGES
       ======================================================== */

    function renderMessages() {

      const container =
        document.getElementById(
          "bsh-messages"
        );


      if (!container) return;


      if (
        activeMessages.length === 0
      ) {

        container.innerHTML = `

          <div
            class="bsh-empty"
          >
            No messages stored.
          </div>

        `;


        return;
      }


      container.innerHTML =
        activeMessages
          .map(
            message => {

              const user =
                message.role ===
                "user";


              return `

                <article
                  class="
                    bsh-message
                    ${
                      user
                        ? "bsh-message-user"
                        : "bsh-message-assistant"
                    }
                  "
                >

                  <div
                    class="bsh-message-role"
                  >

                    ${
                      user
                        ? "You"
                        : "BondStats AI"
                    }

                  </div>


                  ${escapeHTML(
                    text(
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
       CUSTOM MODAL
       ======================================================== */

    function openRenameForActive() {

      if (!activeConversationId) {
        return;
      }


      openRenameModal(
        activeConversationId
      );
    }


    function openRenameModal(id) {

      const conversation =
        getConversation(id);


      if (!conversation) {
        return;
      }


      openModal({
        mode: "rename",
        id,
        value:
          conversation.title ||
          ""
      });
    }


    function openDeleteForActive() {

      if (!activeConversationId) {
        return;
      }


      openModal({
        mode: "delete",
        id:
          activeConversationId
      });
    }


    function openModal({
      mode,
      id,
      value = ""
    }) {

      const modal =
        document.getElementById(
          "bsh-modal"
        );


      const heading =
        document.getElementById(
          "bsh-modal-title"
        );


      const description =
        document.getElementById(
          "bsh-modal-description"
        );


      const input =
        document.getElementById(
          "bsh-modal-input"
        );


      const confirm =
        document.getElementById(
          "bsh-modal-confirm"
        );


      const error =
        document.getElementById(
          "bsh-modal-error"
        );


      if (
        !modal ||
        !heading ||
        !description ||
        !input ||
        !confirm
      ) {
        return;
      }


      if (error) {
        error.textContent = "";
      }


      if (
        mode === "rename"
      ) {

        heading.textContent =
          "Rename conversation";


        description.textContent =
          "Choose a new name for this conversation.";


        input.style.display =
          "block";


        input.value =
          value;


        confirm.textContent =
          "Save";


        confirm.style.background =
          "#75ff9b";


        confirm.style.color =
          "#06200f";


      } else {

        heading.textContent =
          "Delete conversation";


        description.textContent =
          "This permanently deletes the conversation and all stored messages.";


        input.style.display =
          "none";


        input.value =
          "";


        confirm.textContent =
          "Delete";


        confirm.style.background =
          "#ff8080";


        confirm.style.color =
          "#2b0505";

      }


      confirm.onclick =
        async () => {

          confirm.disabled =
            true;


          try {

            if (
              mode === "rename"
            ) {

              await renameConversation(
                id,
                input.value
              );


            } else {

              await deleteConversation(
                id
              );

            }


          } finally {

            confirm.disabled =
              false;

          }
        };


      modal.style.display =
        "flex";


      if (
        mode === "rename"
      ) {

        window.setTimeout(
          () => {

            input.focus();

            input.select();

          },
          50
        );
      }
    }


    function closeModal() {

      const modal =
        document.getElementById(
          "bsh-modal"
        );


      if (modal) {

        modal.style.display =
          "none";

      }
    }


    /* ========================================================
       RENAME
       ======================================================== */

    async function renameConversation(
      id,
      requestedTitle
    ) {

      if (
        !db ||
        !currentUser ||
        !id
      ) {
        return;
      }


      const newTitle =
        text(
          requestedTitle
        );


      const errorBox =
        document.getElementById(
          "bsh-modal-error"
        );


      if (!newTitle) {

        if (errorBox) {

          errorBox.textContent =
            "Enter a conversation name.";

        }

        return;
      }


      try {

        const {
          error
        } =
          await db
            .from("conversations")
            .update({
              title:
                newTitle
            })
            .eq(
              "id",
              id
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (error) {
          throw error;
        }


        const conversation =
          getConversation(id);


        if (conversation) {

          conversation.title =
            newTitle;

        }


        closeModal();


        applyFilters();


        if (
          activeConversationId === id
        ) {

          const heading =
            document.getElementById(
              "bsh-viewer-title"
            );


          if (heading) {

            heading.textContent =
              newTitle;

          }
        }


        showToast(
          "Conversation renamed"
        );


      } catch (error) {

        console.error(
          "[BondStats History] rename failed:",
          error
        );


        if (errorBox) {

          errorBox.textContent =
            error?.message ||
            "Rename failed.";

        }
      }
    }


    /* ========================================================
       DELETE
       ======================================================== */

    async function deleteConversation(id) {

      if (
        !db ||
        !currentUser ||
        !id
      ) {
        return;
      }


      const errorBox =
        document.getElementById(
          "bsh-modal-error"
        );


      try {

        /*
          Messages first.

          This works even without
          ON DELETE CASCADE.
        */

        const {
          error:
            messageError
        } =
          await db
            .from("messages")
            .delete()
            .eq(
              "conversation_id",
              id
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
              id
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
            conversation =>
              conversation.id !== id
          );


        closeModal();


        closeViewer();


        applyFilters();


        showToast(
          "Conversation deleted"
        );


      } catch (error) {

        console.error(
          "[BondStats History] delete failed:",
          error
        );


        if (errorBox) {

          errorBox.textContent =
            error?.message ||
            "Delete failed.";

        }
      }
    }


    /* ========================================================
       DUPLICATE
       ======================================================== */

    async function duplicateConversation() {

      if (
        !db ||
        !currentUser ||
        !activeConversationId
      ) {
        return;
      }


      const original =
        getConversation(
          activeConversationId
        );


      if (!original) {
        return;
      }


      try {

        const {
          data:
            created,
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
                  text(
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
          activeMessages.length >
          0
        ) {

          const copies =
            activeMessages.map(
              message => ({
                conversation_id:
                  created.id,

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
                copies
              );


          if (
            messageError
          ) {
            throw messageError;
          }
        }


        await refreshHistory();


        showToast(
          "Conversation duplicated"
        );


      } catch (error) {

        console.error(
          "[BondStats History] duplicate failed:",
          error
        );


        showToast(
          "Duplicate failed"
        );
      }
    }


    /* ========================================================
       TEXT REPRESENTATION
       ======================================================== */

    function conversationToText() {

      const conversation =
        getConversation(
          activeConversationId
        );


      const title =
        text(
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
        of activeMessages
      ) {

        lines.push(
          message.role === "user"
            ? "You:"
            : "BondStats AI:"
        );


        lines.push(
          text(
            message.content
          )
        );


        lines.push("");

      }


      return lines.join("\n");
    }


    /* ========================================================
       COPY
       ======================================================== */

    async function copyConversation() {

      if (!activeConversationId) {
        return;
      }


      try {

        await navigator.clipboard
          .writeText(
            conversationToText()
          );


        showToast(
          "Conversation copied"
        );


      } catch (error) {

        console.error(
          "[BondStats History] copy failed:",
          error
        );


        showToast(
          "Copy failed"
        );
      }
    }


    /* ========================================================
       EXPORT
       ======================================================== */

    function exportConversation() {

      if (!activeConversationId) {
        return;
      }


      const conversation =
        getConversation(
          activeConversationId
        );


      const blob =
        new Blob(
          [
            conversationToText()
          ],
          {
            type:
              "text/plain;charset=utf-8"
          }
        );


      const url =
        URL.createObjectURL(
          blob
        );


      const anchor =
        document.createElement("a");


      anchor.href =
        url;


      anchor.download =
        `${
          safeFilename(
            conversation?.title
          )
        }.txt`;


      document.body.appendChild(
        anchor
      );


      anchor.click();


      anchor.remove();


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
        !db ||
        !currentUser ||
        !activeConversationId
      ) {
        return;
      }


      const conversation =
        getConversation(
          activeConversationId
        );


      if (!conversation) {
        return;
      }


      try {

        /*
          Do NOT touch app.js.

          We only make this conversation the newest
          database conversation.

          account.js can then resolve it as the latest.
        */

        const {
          error
        } =
          await db
            .from("conversations")
            .update({
              updated_at:
                new Date()
                  .toISOString()
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


        sessionStorage.setItem(
          "bondstats_continue_conversation_id",
          activeConversationId
        );


        sessionStorage.setItem(
          "bondstats_continue_conversation_title",
          conversation.title ||
          "Conversation"
        );


        showToast(
          `Continuing: ${
            conversation.title ||
            "Conversation"
          }`
        );


        closeViewer();

        closeHistory();


        window.setTimeout(
          () => {

            window.location.reload();

          },
          650
        );


      } catch (error) {

        console.error(
          "[BondStats History] continue failed:",
          error
        );


        showToast(
          "Could not continue conversation"
        );
      }
    }


    /* ========================================================
       CLOSE VIEWER
       ======================================================== */

    function closeViewer() {

      const viewer =
        document.getElementById(
          "bsh-viewer"
        );


      if (viewer) {

        viewer.style.display =
          "none";

      }


      activeConversationId =
        null;


      activeMessages = [];
    }


    /* ========================================================
       TOAST
       ======================================================== */

    function showToast(message) {

      const toast =
        document.getElementById(
          "bsh-toast"
        );


      if (!toast) return;


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
          2500
        );
    }


    /* ========================================================
       SAFE STARTUP
       ======================================================== */

    async function startHistory() {

      try {

        /*
          Wait for account.js to create and expose
          the shared Supabase client.

          No new client is created here.
        */

        let attempts = 0;


        while (
          !window.BondStatsSupabase &&
          attempts < 40
        ) {

          await new Promise(
            resolve =>
              window.setTimeout(
                resolve,
                100
              )
          );


          attempts += 1;
        }


        if (
          !resolveDatabaseClient()
        ) {

          console.warn(
            "[BondStats History] Disabled because shared database client was unavailable."
          );


          return;
        }


        createUI();


        /*
          Read session only once at startup.

          No auth subscription.
        */

        await loadCurrentUser();


        console.log(
          "[BondStats History] Stable module ready."
        );


      } catch (error) {

        /*
          History failure MUST NOT escape into
          the main BondStats AI application.
        */

        console.error(
          "[BondStats History] startup failed:",
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
        startHistory,
        {
          once: true
        }
      );


    } else {

      startHistory();

    }


  } catch (fatalError) {

    console.error(
      "[BondStats History] isolated fatal error:",
      fatalError
    );

  }

})();
