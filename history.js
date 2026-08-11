"use strict";

/* ============================================================
   BONDSTATS CHAT HISTORY
   Version 2
   ============================================================

   Features
   ------------------------------------------------------------
   ✓ User-bound Supabase history
   ✓ Search conversations
   ✓ Open conversation
   ✓ Rename conversation
   ✓ Delete conversation
   ✓ Continue conversation
   ✓ Refresh
   ✓ Persistent selected conversation
   ✓ Completely isolated from app.js
   ✓ No keyboard listeners
   ✓ No submit interception
   ✓ No changes to BondStats AI core
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

    if (!window.supabase?.createClient) {
      console.warn(
        "[BondStats History] Supabase library unavailable."
      );
      return;
    }


    /* ========================================================
       SUPABASE CLIENT
       ======================================================== */

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

    let conversations = [];

    let filteredConversations = [];

    let activeConversationId = null;

    let activeConversationMessages = [];


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


    /* ========================================================
       CSS
       ======================================================== */

    function injectStyles() {

      if (
        document.getElementById(
          "bondstats-history-v2-css"
        )
      ) {
        return;
      }


      const style =
        document.createElement("style");


      style.id =
        "bondstats-history-v2-css";


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

          min-height: 38px;

          padding: 0 14px;

          margin-right: 8px;

          border-radius: 999px;

          border:
            1px solid rgba(120,255,165,.32);

          background:
            rgba(7,28,19,.72);

          color:
            #eaffef;

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
            border-color .16s ease,
            background .16s ease,
            transform .16s ease;
        }


        #bondstats-history-button:hover {
          border-color:
            rgba(120,255,165,.70);

          background:
            rgba(11,43,28,.92);

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
            rgba(0,0,0,.55);

          backdrop-filter:
            blur(7px);
        }


        /* ==========================================
           DRAWER
           ========================================== */

        #bondstats-history-panel {
          width:
            min(450px, 94vw);

          height: 100%;

          overflow: hidden;

          display: flex;

          flex-direction: column;

          border-left:
            1px solid
            rgba(115,255,158,.24);

          background:
            linear-gradient(
              180deg,
              rgba(13,42,28,.995),
              rgba(5,18,12,.995)
            );

          box-shadow:
            -30px 0 80px
            rgba(0,0,0,.46);

          color:
            #f0fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;
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

          font-size: 20px;

          font-weight: 700;
        }


        .bondstats-history-subtitle {
          margin:
            4px 0 0;

          color:
            rgba(230,255,238,.56);

          font-size:
            11px;
        }


        .bondstats-history-header-buttons {
          display: flex;

          gap: 7px;
        }


        .bondstats-history-icon-button {
          width: 34px;

          height: 34px;

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


        /* ==========================================
           SEARCH
           ========================================== */

        .bondstats-history-search-wrap {
          flex: 0 0 auto;

          padding:
            12px 12px 6px;
        }


        #bondstats-history-search {
          box-sizing: border-box;

          width: 100%;

          height: 42px;

          padding:
            0 14px;

          border-radius: 12px;

          border:
            1px solid
            rgba(120,255,165,.16);

          outline: none;

          background:
            rgba(0,0,0,.22);

          color:
            #effff4;

          font-size: 13px;
        }


        #bondstats-history-search:focus {
          border-color:
            rgba(120,255,165,.45);
        }


        #bondstats-history-search::placeholder {
          color:
            rgba(230,255,238,.40);
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
            35px 18px;

          text-align: center;

          color:
            rgba(229,255,237,.48);

          font-size: 13px;

          line-height: 1.6;
        }


        /* ==========================================
           CONVERSATION ITEM
           ========================================== */

        .bondstats-history-item {
          width: 100%;

          position: relative;

          display: flex;

          align-items: center;

          gap: 8px;

          margin-bottom: 7px;

          padding:
            13px 11px 13px 14px;

          border-radius: 13px;

          border:
            1px solid
            rgba(126,255,167,.12);

          background:
            rgba(0,0,0,.16);

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
            rgba(235,255,241,.65);

          cursor: pointer;

          font-size: 18px;
        }


        .bondstats-history-item-menu:hover {
          background:
            rgba(255,255,255,.08);

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
            rgba(0,0,0,.72);

          backdrop-filter:
            blur(11px);
        }


        #bondstats-conversation-card {
          width:
            min(780px, 96vw);

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
              rgba(13,43,28,.995),
              rgba(5,18,12,.995)
            );

          color:
            #f1fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          box-shadow:
            0 40px 120px
            rgba(0,0,0,.65);
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


        /* ==========================================
           MESSAGES
           ========================================== */

        #bondstats-conversation-messages {
          overflow-y: auto;

          flex: 1;

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
            rgba(0,0,0,.24);

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
           FOOTER
           ========================================== */

        .bondstats-conversation-footer {
          flex: 0 0 auto;

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          flex-wrap: wrap;

          gap: 8px;

          padding:
            14px 20px;

          border-top:
            1px solid
            rgba(120,255,165,.12);
        }


        .bondstats-conversation-left-actions,
        .bondstats-conversation-right-actions {
          display: flex;

          align-items: center;

          gap: 8px;
        }


        .bondstats-history-action {
          min-height: 38px;

          padding:
            0 13px;

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
            rgba(255,255,255,.08);
        }


        #bondstats-continue-conversation {
          border-color:
            rgba(117,255,155,.45);

          background:
            rgba(63,190,102,.16);

          color:
            #caffd8;

          font-weight: 700;
        }


        #bondstats-delete-conversation {
          border-color:
            rgba(255,110,110,.28);

          background:
            rgba(100,15,15,.15);

          color:
            #ffbcbc;
        }


        /* ==========================================
           CONTINUE NOTICE
           ========================================== */

        #bondstats-history-resume-notice {
          position: fixed;

          left: 50%;

          bottom: 24px;

          z-index: 9999999;

          transform:
            translateX(-50%)
            translateY(30px);

          opacity: 0;

          pointer-events: none;

          padding:
            11px 17px;

          border-radius: 999px;

          border:
            1px solid
            rgba(117,255,155,.35);

          background:
            rgba(5,27,16,.96);

          color:
            #dcffe6;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 12px;

          box-shadow:
            0 15px 50px
            rgba(0,0,0,.40);

          transition:
            opacity .20s ease,
            transform .20s ease;
        }


        #bondstats-history-resume-notice.visible {
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


          #bondstats-conversation-viewer {
            padding: 10px;
          }


          #bondstats-conversation-card {
            max-height: 94vh;
          }


          .bondstats-conversation-footer {
            align-items: stretch;
          }


          .bondstats-conversation-left-actions,
          .bondstats-conversation-right-actions {
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
       CREATE HISTORY UI
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
         PLACE BESIDE ACCOUNT
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

          accountButton.parentElement.insertBefore(
            historyButton,
            accountButton
          );

          return true;
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
                attempts > 40
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
            class="bondstats-history-search-wrap"
          >

            <input
              id="bondstats-history-search"
              type="search"
              placeholder="Search conversations…"
              autocomplete="off"
            />

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

          </div>


          <div
            id="bondstats-conversation-messages"
          ></div>


          <div
            class="bondstats-conversation-footer"
          >

            <div
              class="bondstats-conversation-left-actions"
            >

              <button
                id="bondstats-rename-conversation"
                class="bondstats-history-action"
                type="button"
              >
                Rename
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
              class="bondstats-conversation-right-actions"
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


      /* ------------------------------------------------------
         RESUME NOTICE
         ------------------------------------------------------ */

      const resumeNotice =
        document.createElement(
          "div"
        );


      resumeNotice.id =
        "bondstats-history-resume-notice";


      resumeNotice.textContent =
        "Conversation selected";


      document.body.appendChild(
        resumeNotice
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
          loadConversations
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
          "bondstats-delete-conversation"
        )
        ?.addEventListener(
          "click",
          () => {

            if (activeConversationId) {

              deleteConversation(
                activeConversationId
              );

            }

          }
        );


      document
        .getElementById(
          "bondstats-rename-conversation"
        )
        ?.addEventListener(
          "click",
          () => {

            if (activeConversationId) {

              renameConversation(
                activeConversationId
              );

            }

          }
        );


      document
        .getElementById(
          "bondstats-continue-conversation"
        )
        ?.addEventListener(
          "click",
          continueConversation
        );


      document
        .getElementById(
          "bondstats-history-search"
        )
        ?.addEventListener(
          "input",
          event => {

            searchConversations(
              event.target.value
            );

          }
        );


      backdrop.addEventListener(
        "click",
        event => {

          if (
            event.target === backdrop
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
       OPEN / CLOSE HISTORY
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
            .from(
              "conversations"
            )
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
            .limit(150);


        if (error) {
          throw error;
        }


        conversations =
          Array.isArray(data)
            ? data
            : [];


        filteredConversations =
          [...conversations];


        renderConversationList();


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
       SEARCH
       ======================================================== */

    function searchConversations(
      value
    ) {

      const query =
        safeText(value)
          .toLowerCase();


      if (!query) {

        filteredConversations =
          [...conversations];

      } else {

        filteredConversations =
          conversations.filter(
            conversation => {

              return safeText(
                conversation.title
              )
                .toLowerCase()
                .includes(query);

            }
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
        filteredConversations.length === 0
      ) {

        list.innerHTML = `

          <div
            class="bondstats-history-empty"
          >
            No conversations found.
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


                  if (id) {

                    renameConversation(
                      id
                    );

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
            .from(
              "messages"
            )
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

    function renderMessages(
      items
    ) {

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

    async function renameConversation(
      conversationId
    ) {

      if (
        !currentUser ||
        !conversationId
      ) {
        return;
      }


      const conversation =
        getConversationById(
          conversationId
        );


      if (!conversation) {
        return;
      }


      const requestedTitle =
        window.prompt(
          "Rename conversation:",
          conversation.title ||
          ""
        );


      if (
        requestedTitle === null
      ) {
        return;
      }


      const newTitle =
        safeText(
          requestedTitle
        );


      if (!newTitle) {
        return;
      }


      try {

        const {
          error
        } =
          await db
            .from(
              "conversations"
            )
            .update({
              title:
                newTitle
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


        conversation.title =
          newTitle;


        renderConversationList();


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


      } catch (error) {

        console.error(
          "[BondStats History] Rename:",
          error
        );


        window.alert(
          "The conversation could not be renamed."
        );

      }

    }


    /* ========================================================
       DELETE
       ======================================================== */

    async function deleteConversation(
      conversationId
    ) {

      if (
        !currentUser ||
        !conversationId
      ) {
        return;
      }


      const confirmed =
        window.confirm(
          "Delete this conversation permanently?"
        );


      if (!confirmed) {
        return;
      }


      try {

        const {
          error:
            messageError
        } =
          await db
            .from(
              "messages"
            )
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
            .from(
              "conversations"
            )
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
            conversation =>
              conversation.id !==
              conversationId
          );


        filteredConversations =
          filteredConversations.filter(
            conversation =>
              conversation.id !==
              conversationId
          );


        activeConversationId =
          null;


        activeConversationMessages =
          [];


        closeConversation();


        renderConversationList();


      } catch (error) {

        console.error(
          "[BondStats History] Delete:",
          error
        );


        window.alert(
          "The conversation could not be deleted."
        );

      }

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

        /*
          Move this conversation to the top.

          account.js loads the newest conversation
          after a fresh page load, so this makes the
          chosen conversation become the active one.
        */

        const now =
          new Date()
            .toISOString();


        const {
          error
        } =
          await db
            .from(
              "conversations"
            )
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


        /*
          Remember selected conversation.

          This allows us to build a deeper context
          bridge later without changing the database.
        */

        localStorage.setItem(
          "bondstats_selected_conversation",
          activeConversationId
        );


        localStorage.setItem(
          "bondstats_selected_conversation_title",
          conversation.title ||
          "Conversation"
        );


        showResumeNotice(
          `Continuing: ${
            conversation.title ||
            "Conversation"
          }`
        );


        closeConversation();

        closeHistory();


        /*
          IMPORTANT:
          Reload safely.

          The account layer will now resolve this
          conversation as the latest conversation.
        */

        window.setTimeout(
          () => {

            window.location.reload();

          },
          650
        );


      } catch (error) {

        console.error(
          "[BondStats History] Continue:",
          error
        );


        window.alert(
          "The conversation could not be continued."
        );

      }

    }


    /* ========================================================
       RESUME NOTICE
       ======================================================== */

    function showResumeNotice(
      message
    ) {

      const notice =
        document.getElementById(
          "bondstats-history-resume-notice"
        );


      if (!notice) {
        return;
      }


      notice.textContent =
        message;


      notice.classList.add(
        "visible"
      );


      window.setTimeout(
        () => {

          notice.classList.remove(
            "visible"
          );

        },
        2600
      );

    }


    /* ========================================================
       RESTORE NOTICE AFTER RELOAD
       ======================================================== */

    function restoreResumeNotice() {

      const conversationId =
        localStorage.getItem(
          "bondstats_selected_conversation"
        );


      const title =
        localStorage.getItem(
          "bondstats_selected_conversation_title"
        );


      if (!conversationId) {
        return;
      }


      window.setTimeout(
        () => {

          showResumeNotice(
            `Continuing: ${
              title ||
              "Conversation"
            }`
          );

        },
        600
      );

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
       AUTH EVENTS
       ======================================================== */

    db.auth.onAuthStateChange(
      (
        event,
        session
      ) => {

        try {

          currentUser =
            session?.user ||
            null;


          updateVisibility();


          if (
            event ===
              "SIGNED_IN" ||
            event ===
              "INITIAL_SESSION"
          ) {

            window.setTimeout(
              loadConversations,
              0
            );

          }


          if (
            event ===
            "SIGNED_OUT"
          ) {

            conversations = [];

            filteredConversations = [];

            activeConversationId =
              null;

            localStorage.removeItem(
              "bondstats_selected_conversation"
            );

            localStorage.removeItem(
              "bondstats_selected_conversation_title"
            );

          }


        } catch (error) {

          console.error(
            "[BondStats History] Auth event:",
            error
          );

        }

      }
    );


    /* ========================================================
       START
       ======================================================== */

    async function start() {

      try {

        createHistoryUI();


        await loadUser();


        restoreResumeNotice();


        console.log(
          "[BondStats History] Version 2 ready."
        );


      } catch (error) {

        console.error(
          "[BondStats History] Startup:",
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
      "[BondStats History] Fatal isolated error:",
      fatalError
    );

  }

})();
