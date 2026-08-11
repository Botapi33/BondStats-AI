"use strict";

/* ============================================================
   BONDSTATS CHAT HISTORY
   ------------------------------------------------------------
   Completely isolated from app.js

   Features:
   - Reads existing Supabase login session
   - Shows user's conversations
   - Opens a conversation in a history viewer
   - Delete conversation
   - Refresh history
   - Does NOT touch Enter / Analyze / submitMessage()
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


    let currentUser = null;
    let conversations = [];


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


    /* ========================================================
       CSS
       ======================================================== */

    function injectStyles() {

      if (
        document.getElementById(
          "bondstats-history-css"
        )
      ) {
        return;
      }


      const style =
        document.createElement("style");


      style.id =
        "bondstats-history-css";


      style.textContent = `

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

          backdrop-filter: blur(12px);
        }


        #bondstats-history-button:hover {
          border-color:
            rgba(120,255,165,.70);

          background:
            rgba(11,43,28,.92);
        }


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


        #bondstats-history-panel {
          width:
            min(440px, 94vw);

          height:
            100%;

          overflow:
            hidden;

          display:
            flex;

          flex-direction:
            column;

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


        .bondstats-history-header {
          flex:
            0 0 auto;

          display:
            flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap:
            12px;

          padding:
            22px 20px 18px;

          border-bottom:
            1px solid
            rgba(120,255,165,.12);
        }


        .bondstats-history-heading {
          margin:
            0;

          font-size:
            19px;

          font-weight:
            700;
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
          display:
            flex;

          gap:
            7px;
        }


        .bondstats-history-icon-button {
          width:
            34px;

          height:
            34px;

          border-radius:
            50%;

          border:
            1px solid
            rgba(130,255,170,.18);

          background:
            rgba(255,255,255,.035);

          color:
            #fff;

          cursor:
            pointer;

          font-size:
            16px;
        }


        #bondstats-history-list {
          flex:
            1;

          overflow-y:
            auto;

          padding:
            10px;
        }


        .bondstats-history-empty {
          padding:
            35px 18px;

          text-align:
            center;

          color:
            rgba(229,255,237,.48);

          font-size:
            13px;

          line-height:
            1.6;
        }


        .bondstats-history-item {
          width:
            100%;

          display:
            block;

          margin-bottom:
            7px;

          padding:
            13px 14px;

          border-radius:
            13px;

          border:
            1px solid
            rgba(126,255,167,.12);

          background:
            rgba(0,0,0,.16);

          text-align:
            left;

          color:
            #effff4;

          cursor:
            pointer;

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


        .bondstats-history-title {
          overflow:
            hidden;

          text-overflow:
            ellipsis;

          white-space:
            nowrap;

          font-size:
            13px;

          font-weight:
            600;
        }


        .bondstats-history-time {
          margin-top:
            5px;

          color:
            rgba(222,255,232,.46);

          font-size:
            10px;
        }


        /* ==========================================
           CONVERSATION VIEWER
           ========================================== */

        #bondstats-conversation-viewer {
          position:
            fixed;

          inset:
            0;

          z-index:
            999999;

          display:
            none;

          align-items:
            center;

          justify-content:
            center;

          padding:
            24px;

          background:
            rgba(0,0,0,.72);

          backdrop-filter:
            blur(11px);
        }


        #bondstats-conversation-card {
          width:
            min(760px, 96vw);

          max-height:
            88vh;

          display:
            flex;

          flex-direction:
            column;

          overflow:
            hidden;

          border-radius:
            20px;

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


        .bondstats-conversation-header {
          display:
            flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap:
            15px;

          padding:
            18px 20px;

          border-bottom:
            1px solid
            rgba(120,255,165,.12);
        }


        #bondstats-conversation-title {
          overflow:
            hidden;

          text-overflow:
            ellipsis;

          white-space:
            nowrap;

          font-size:
            16px;

          font-weight:
            700;
        }


        #bondstats-conversation-messages {
          overflow-y:
            auto;

          flex:
            1;

          padding:
            20px;
        }


        .bondstats-history-message {
          max-width:
            88%;

          margin:
            0 0 14px;

          padding:
            12px 14px;

          border-radius:
            14px;

          font-size:
            13px;

          line-height:
            1.55;

          white-space:
            pre-wrap;

          overflow-wrap:
            anywhere;
        }


        .bondstats-history-message-user {
          margin-left:
            auto;

          background:
            rgba(104,255,153,.16);

          border:
            1px solid
            rgba(112,255,159,.26);
        }


        .bondstats-history-message-assistant {
          margin-right:
            auto;

          background:
            rgba(0,0,0,.24);

          border:
            1px solid
            rgba(112,255,159,.10);
        }


        .bondstats-message-role {
          margin-bottom:
            6px;

          color:
            #7dffa4;

          font-size:
            9px;

          font-weight:
            700;

          letter-spacing:
            .09em;

          text-transform:
            uppercase;
        }


        .bondstats-conversation-footer {
          flex:
            0 0 auto;

          display:
            flex;

          justify-content:
            space-between;

          gap:
            10px;

          padding:
            14px 20px;

          border-top:
            1px solid
            rgba(120,255,165,.12);
        }


        #bondstats-delete-conversation {
          padding:
            9px 13px;

          border-radius:
            10px;

          border:
            1px solid
            rgba(255,110,110,.28);

          background:
            rgba(100,15,15,.15);

          color:
            #ffbcbc;

          cursor:
            pointer;
        }


        #bondstats-close-conversation {
          padding:
            9px 14px;

          border-radius:
            10px;

          border:
            1px solid
            rgba(130,255,170,.20);

          background:
            rgba(255,255,255,.04);

          color:
            #fff;

          cursor:
            pointer;
        }


        @media (max-width: 700px) {

          #bondstats-history-button {
            min-height:
              34px;

            padding:
              0 11px;

            font-size:
              12px;
          }


          #bondstats-conversation-viewer {
            padding:
              10px;
          }


          #bondstats-conversation-card {
            max-height:
              94vh;
          }

        }
      `;


      document.head.appendChild(
        style
      );
    }


    /* ========================================================
       CREATE UI
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


      /*
        Place beside Account / New Session.
      */

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

      } else {

        /*
          Safe fallback:
          append only after account UI exists.
        */

        const timer =
          window.setInterval(
            () => {

              const account =
                document.getElementById(
                  "bondstats-account-trigger"
                );


              if (
                account &&
                account.parentElement
              ) {

                window.clearInterval(
                  timer
                );


                account.parentElement.insertBefore(
                  historyButton,
                  account
                );

              }

            },
            500
          );

      }


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
            id="bondstats-history-list"
          ></div>

        </aside>
      `;


      document.body.appendChild(
        backdrop
      );


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

            <button
              id="bondstats-delete-conversation"
              type="button"
            >
              Delete
            </button>


            <button
              id="bondstats-close-conversation"
              type="button"
            >
              Close
            </button>

          </div>

        </section>
      `;


      document.body.appendChild(
        viewer
      );


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
       HISTORY DRAWER
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
                ascending:
                  false
              }
            )
            .limit(100);


        if (error) {
          throw error;
        }


        conversations =
          Array.isArray(data)
            ? data
            : [];


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
       RENDER CONVERSATIONS
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
        conversations.length === 0
      ) {

        list.innerHTML = `
          <div
            class="bondstats-history-empty"
          >
            No saved conversations yet.<br>
            Your new BondStats chats will appear here.
          </div>
        `;

        return;
      }


      list.innerHTML =
        conversations
          .map(
            conversation => `
              <button
                class="bondstats-history-item"
                type="button"
                data-conversation-id="${escapeHTML(
                  conversation.id
                )}"
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

              </button>
            `
          )
          .join("");


      list
        .querySelectorAll(
          ".bondstats-history-item"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () => {

                const id =
                  button.dataset
                    .conversationId;


                if (id) {

                  openConversation(
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


      const conversation =
        conversations.find(
          item =>
            item.id ===
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
                ascending:
                  true
              }
            );


        if (error) {
          throw error;
        }


        renderMessages(
          Array.isArray(data)
            ? data
            : []
        );


        const deleteButton =
          document.getElementById(
            "bondstats-delete-conversation"
          );


        if (deleteButton) {

          deleteButton.onclick =
            () => {

              deleteConversation(
                conversationId
              );

            };

        }


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
       DELETE CONVERSATION
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

        /*
          Delete messages first.
          This also works if no ON DELETE CASCADE
          was configured.
        */

        const {
          error: messageError
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


        closeConversation();


        await loadConversations();


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
       CLOSE CONVERSATION
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


        console.log(
          "[BondStats History] Ready."
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
      "[BondStats History] Isolated fatal error:",
      fatalError
    );

  }

})();
