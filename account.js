"use strict";

/* ============================================================
   BONDSTATS ACCOUNT SYSTEM
   Version: isolated-auth-v3

   - Google OAuth
   - Email/password auth
   - iframe-safe Google popup authentication
   - popup -> iframe session transfer
   - persistent Supabase sessions
   - conversations/messages persistence
   - no modification of app.js
   - no keydown / submit interception
   - mounts beside "New Session"
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

    /*
      IMPORTANT:
      This must be the actual direct GitHub Pages URL
      of BondStats AI.

      Keep the trailing slash.
    */
    const DIRECT_APP_URL =
      "https://botapi33.github.io/BondStats-AI/";


    /* ========================================================
       SAFETY
       ======================================================== */

    if (!window.supabase?.createClient) {
      console.warn(
        "[BondStats Account] Supabase JS unavailable. Main AI remains unaffected."
      );
      return;
    }


    /* ========================================================
       SUPABASE CLIENT
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

    const savedMessageIds = new Set();


    /* ========================================================
       UTILITIES
       ======================================================== */

    function safeText(value) {
      return typeof value === "string"
        ? value.trim()
        : "";
    }


    function normalizeURL(url) {
      return String(url || "").replace(/#.*$/, "");
    }


    function isEmbedded() {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    }


    function isAuthPopup() {
      return Boolean(
        window.opener &&
        window.opener !== window
      );
    }


    function setStatus(message) {
      const el =
        document.getElementById(
          "bondstats-account-message"
        );

      if (el) {
        el.textContent =
          message || "";
      }
    }


    /* ========================================================
       CSS
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

        /* ==========================================
           INLINE ACCOUNT TRIGGER
           ========================================== */

        #bondstats-account-trigger {
          position: relative !important;
          inset: auto !important;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          flex: 0 0 auto;

          min-height: 38px;
          padding: 0 16px;

          margin: 0 10px 0 0;

          border-radius: 999px;
          border:
            1px solid rgba(118,255,163,.48);

          background:
            rgba(8,31,20,.82);

          color: #effff4;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 13px;
          font-weight: 600;

          letter-spacing: .01em;

          cursor: pointer;

          white-space: nowrap;

          backdrop-filter: blur(14px);

          box-shadow:
            inset 0 0 0 1px
              rgba(90,255,140,.04),
            0 5px 22px
              rgba(0,0,0,.18);

          z-index: auto !important;

          transition:
            background .18s ease,
            border-color .18s ease,
            transform .18s ease;
        }

        #bondstats-account-trigger:hover {
          background:
            rgba(13,47,30,.94);

          border-color:
            rgba(118,255,163,.78);

          transform:
            translateY(-1px);
        }

        #bondstats-account-trigger:
        active {
          transform:
            translateY(0);
        }

        .bondstats-account-dot {
          width: 7px;
          height: 7px;

          margin-right: 8px;

          border-radius: 50%;

          background: #75ff9d;

          box-shadow:
            0 0 9px
              rgba(117,255,157,.9);
        }


        /* ==========================================
           FALLBACK HOLDER
           Only used if New Session cannot be found
           ========================================== */

        #bondstats-account-fallback {
          position: fixed;

          right: 20px;
          bottom: 20px;

          z-index: 9000;

          display: flex;
          align-items: center;

          pointer-events: auto;
        }


        /* ==========================================
           MODAL BACKDROP
           ========================================== */

        #bondstats-account-backdrop {
          position: fixed;

          inset: 0;

          z-index: 999999;

          display: none;

          align-items: center;
          justify-content: center;

          padding: 22px;

          background:
            rgba(0,0,0,.70);

          backdrop-filter:
            blur(12px);
        }


        /* ==========================================
           MODAL
           ========================================== */

        #bondstats-account-modal {
          box-sizing: border-box;

          width:
            min(420px, 100%);

          padding: 27px;

          border-radius: 22px;

          border:
            1px solid
            rgba(113,255,161,.28);

          background:
            linear-gradient(
              180deg,
              rgba(18,55,36,.99),
              rgba(5,19,13,.995)
            );

          color:
            #f1fff5;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          box-shadow:
            0 40px 110px
              rgba(0,0,0,.62),
            0 0 80px
              rgba(54,255,124,.07);
        }


        #bondstats-account-modal * {
          box-sizing:
            border-box;
        }


        /* ==========================================
           CLOSE
           ========================================== */

        #bondstats-account-close {
          float: right;

          width: 32px;
          height: 32px;

          margin: -3px -3px 0 10px;

          border-radius: 50%;

          border:
            1px solid
            rgba(160,255,190,.18);

          background:
            rgba(255,255,255,.025);

          color: white;

          font-size: 20px;

          cursor: pointer;
        }


        /* ==========================================
           TEXT
           ========================================== */

        .bondstats-account-title {
          margin:
            0 0 6px;

          font-size: 22px;
          line-height: 1.2;

          font-weight: 700;
        }


        .bondstats-account-subtitle {
          margin:
            0 0 22px;

          max-width: 335px;

          color:
            rgba(232,255,240,.68);

          font-size: 13px;
          line-height: 1.5;
        }


        /* ==========================================
           GOOGLE BUTTON
           ========================================== */

        #bondstats-google-login {
          width: 100%;
          height: 44px;

          padding:
            0 16px;

          border-radius: 22px;

          border:
            1px solid #8e918f;

          background:
            #131314;

          color:
            #e3e3e3;

          display:
            flex;

          align-items:
            center;

          justify-content:
            center;

          gap: 11px;

          cursor: pointer;

          font-size: 14px;
          font-weight: 500;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          transition:
            background .15s ease;
        }


        #bondstats-google-login:hover {
          background:
            #202124;
        }


        .bondstats-google-logo {
          width: 18px;
          height: 18px;

          display:
            block;

          flex:
            0 0 18px;
        }


        /* ==========================================
           DIVIDER
           ========================================== */

        .bondstats-auth-divider {
          display:
            flex;

          align-items:
            center;

          gap: 12px;

          margin:
            19px 0;

          color:
            rgba(230,255,238,.38);

          font-size:
            11px;

          text-transform:
            uppercase;

          letter-spacing:
            .09em;
        }


        .bondstats-auth-divider::before,
        .bondstats-auth-divider::after {
          content: "";

          flex: 1;

          height: 1px;

          background:
            rgba(126,255,167,.14);
        }


        /* ==========================================
           INPUTS
           ========================================== */

        .bondstats-account-input {
          display: block;

          width: 100%;
          height: 44px;

          margin:
            0 0 10px;

          padding:
            0 14px;

          border-radius:
            12px;

          border:
            1px solid
            rgba(132,255,173,.20);

          outline:
            none;

          background:
            rgba(0,0,0,.26);

          color:
            #f3fff6;

          font-size:
            14px;
        }


        .bondstats-account-input:
        focus {
          border-color:
            rgba(116,255,161,.60);
        }


        /* ==========================================
           EMAIL BUTTON
           ========================================== */

        #bondstats-email-login {
          width:
            100%;

          height:
            44px;

          margin-top:
            2px;

          border:
            0;

          border-radius:
            12px;

          background:
            #75ff9b;

          color:
            #06200f;

          cursor:
            pointer;

          font-size:
            14px;

          font-weight:
            700;
        }


        #bondstats-email-signup {
          display:
            block;

          width:
            100%;

          padding:
            11px;

          margin-top:
            6px;

          border:
            0;

          background:
            transparent;

          color:
            rgba(231,255,239,.70);

          cursor:
            pointer;

          font-size:
            12px;
        }


        /* ==========================================
           STATUS
           ========================================== */

        #bondstats-account-message {
          min-height:
            18px;

          margin-top:
            12px;

          color:
            rgba(222,255,233,.72);

          font-size:
            12px;

          line-height:
            1.45;
        }


        /* ==========================================
           SIGNED IN
           ========================================== */

        #bondstats-signed-in {
          display:
            none;
        }


        #bondstats-account-email {
          margin:
            14px 0 18px;

          padding:
            12px 14px;

          border-radius:
            12px;

          background:
            rgba(0,0,0,.23);

          border:
            1px solid
            rgba(130,255,170,.10);

          color:
            #e0ffea;

          font-size:
            13px;

          overflow-wrap:
            anywhere;
        }


        #bondstats-sign-out {
          width:
            100%;

          height:
            42px;

          border-radius:
            12px;

          border:
            1px solid
            rgba(255,255,255,.14);

          background:
            rgba(255,255,255,.045);

          color:
            white;

          cursor:
            pointer;
        }


        /* ==========================================
           MOBILE
           ========================================== */

        @media (max-width: 700px) {

          #bondstats-account-trigger {
            min-height:
              34px;

            padding:
              0 12px;

            font-size:
              12px;

            margin-right:
              6px;
          }

          #bondstats-account-modal {
            padding:
              22px;
          }

        }
      `;

      document.head.appendChild(
        style
      );
    }


    /* ========================================================
       GOOGLE ICON
       ======================================================== */

    function googleLogoSVG() {
      return `
        <svg
          class="bondstats-google-logo"
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
      `;
    }


    /* ========================================================
       CREATE MODAL
       ======================================================== */

    function createModal() {
      if (
        document.getElementById(
          "bondstats-account-backdrop"
        )
      ) {
        return;
      }

      const backdrop =
        document.createElement("div");

      backdrop.id =
        "bondstats-account-backdrop";

      backdrop.innerHTML = `

        <div
          id="bondstats-account-modal"
          role="dialog"
          aria-modal="true"
          aria-label="BondStats account"
        >

          <button
            id="bondstats-account-close"
            type="button"
            aria-label="Close"
          >
            ×
          </button>


          <section
            id="bondstats-signed-out"
          >

            <h2
              class="bondstats-account-title"
            >
              Sign in to BondStats
            </h2>

            <p
              class="bondstats-account-subtitle"
            >
              Keep your financial analysis
              and conversations connected
              to your account.
            </p>


            <button
              id="bondstats-google-login"
              type="button"
            >
              ${googleLogoSVG()}

              <span>
                Continue with Google
              </span>
            </button>


            <div
              class="bondstats-auth-divider"
            >
              or
            </div>


            <input
              id="bondstats-email"
              class="bondstats-account-input"
              type="email"
              placeholder="Email"
              autocomplete="email"
            />


            <input
              id="bondstats-password"
              class="bondstats-account-input"
              type="password"
              placeholder="Password"
              autocomplete="current-password"
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


            <div
              id="bondstats-account-message"
            ></div>

          </section>


          <section
            id="bondstats-signed-in"
          >

            <h2
              class="bondstats-account-title"
            >
              BondStats Account
            </h2>


            <p
              class="bondstats-account-subtitle"
            >
              Your conversations are linked
              to this account.
            </p>


            <div
              id="bondstats-account-email"
            ></div>


            <button
              id="bondstats-sign-out"
              type="button"
            >
              Sign out
            </button>

          </section>

        </div>
      `;

      document.body.appendChild(
        backdrop
      );


      backdrop.addEventListener(
        "click",
        event => {

          if (
            event.target ===
            backdrop
          ) {
            closeModal();
          }

        }
      );


      document
        .getElementById(
          "bondstats-account-close"
        )
        ?.addEventListener(
          "click",
          closeModal
        );


      document
        .getElementById(
          "bondstats-google-login"
        )
        ?.addEventListener(
          "click",
          signInWithGoogle
        );


      document
        .getElementById(
          "bondstats-email-login"
        )
        ?.addEventListener(
          "click",
          signInWithEmail
        );


      document
        .getElementById(
          "bondstats-email-signup"
        )
        ?.addEventListener(
          "click",
          signUpWithEmail
        );


      document
        .getElementById(
          "bondstats-sign-out"
        )
        ?.addEventListener(
          "click",
          signOut
        );
    }


    /* ========================================================
       FIND NEW SESSION BUTTON
       ======================================================== */

    function findNewSessionButton() {

      const explicitSelectors = [
        "#newSession",
        "#newSessionBtn",
        "#new-session",
        ".new-session",
        ".new-session-btn",
        "[data-action='new-session']"
      ];


      for (
        const selector
        of explicitSelectors
      ) {

        const element =
          document.querySelector(
            selector
          );

        if (element) {
          return element;
        }
      }


      const candidates =
        document.querySelectorAll(
          "button, a, [role='button']"
        );


      for (
        const candidate
        of candidates
      ) {

        const text =
          safeText(
            candidate.textContent
          ).toLowerCase();


        if (
          text ===
          "new session"
        ) {
          return candidate;
        }

      }


      return null;
    }


    /* ========================================================
       ACCOUNT TRIGGER
       ======================================================== */

    function createTrigger() {

      if (
        document.getElementById(
          "bondstats-account-trigger"
        )
      ) {
        return;
      }


      const trigger =
        document.createElement(
          "button"
        );


      trigger.id =
        "bondstats-account-trigger";


      trigger.type =
        "button";


      trigger.innerHTML = `
        <span
          class="bondstats-account-dot"
        ></span>

        <span
          id="bondstats-account-trigger-text"
        >
          Sign in
        </span>
      `;


      trigger.addEventListener(
        "click",
        openModal
      );


      const newSession =
        findNewSessionButton();


      if (
        newSession &&
        newSession.parentElement
      ) {

        /*
          BEST CASE:
          Account button becomes a normal sibling
          directly beside New Session.

          No absolute/fixed positioning.
          No overlap with Ready badge.
        */

        newSession.parentElement.insertBefore(
          trigger,
          newSession
        );

        console.log(
          "[BondStats Account] Mounted beside New Session."
        );

        return;
      }


      /*
        FALLBACK:
        Never put it in top-right,
        because that is where the Ready badge lives.
      */

      const holder =
        document.createElement(
          "div"
        );


      holder.id =
        "bondstats-account-fallback";


      holder.appendChild(
        trigger
      );


      document.body.appendChild(
        holder
      );


      console.warn(
        "[BondStats Account] New Session button not found. Using safe bottom-right fallback."
      );
    }


    /* ========================================================
       MODAL
       ======================================================== */

    function openModal() {

      const backdrop =
        document.getElementById(
          "bondstats-account-backdrop"
        );


      if (backdrop) {
        backdrop.style.display =
          "flex";
      }
    }


    function closeModal() {

      const backdrop =
        document.getElementById(
          "bondstats-account-backdrop"
        );


      if (backdrop) {
        backdrop.style.display =
          "none";
      }
    }


    /* ========================================================
       RENDER AUTH
       ======================================================== */

    function renderAuthState() {

      const signedOut =
        document.getElementById(
          "bondstats-signed-out"
        );


      const signedIn =
        document.getElementById(
          "bondstats-signed-in"
        );


      const accountEmail =
        document.getElementById(
          "bondstats-account-email"
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


        if (accountEmail) {
          accountEmail.textContent =
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
       GOOGLE OAUTH
       ======================================================== */

    async function signInWithGoogle() {

      try {

        setStatus(
          "Opening secure Google sign-in…"
        );


        const {
          data,
          error
        } =
          await db.auth.signInWithOAuth({
            provider:
              "google",

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
            "Google authorization URL was not returned."
          );
        }


        /*
          Open OAuth outside the iframe.

          This works both when:
          - GitHub page is opened directly
          - BondStats AI is embedded on bondstats.org
        */

        const popup =
          window.open(
            data.url,
            "bondstats-google-auth",
            [
              "popup=yes",
              "width=520",
              "height=720",
              "resizable=yes",
              "scrollbars=yes"
            ].join(",")
          );


        /*
          Browser blocked popup.
          Fallback to new tab.
        */

        if (!popup) {

          window.open(
            data.url,
            "_blank"
          );

        }


        setStatus(
          "Complete sign-in in the Google window."
        );


      } catch (error) {

        console.error(
          "[BondStats Account] Google OAuth failed:",
          error
        );


        setStatus(
          error?.message ||
          "Google sign-in failed."
        );

      }
    }


    /* ========================================================
       EMAIL CREDENTIALS
       ======================================================== */

    function credentials() {

      return {

        email:
          safeText(
            document
              .getElementById(
                "bondstats-email"
              )
              ?.value
          ),

        password:
          document
            .getElementById(
              "bondstats-password"
            )
            ?.value ||
          ""

      };
    }


    /* ========================================================
       EMAIL LOGIN
       ======================================================== */

    async function signInWithEmail() {

      const {
        email,
        password
      } =
        credentials();


      if (
        !email ||
        !password
      ) {

        setStatus(
          "Enter your email and password."
        );

        return;
      }


      try {

        setStatus(
          "Signing in…"
        );


        const {
          data,
          error
        } =
          await db.auth
            .signInWithPassword({
              email,
              password
            });


        if (error) {
          throw error;
        }


        currentUser =
          data?.user ||
          null;


        renderAuthState();


        setStatus("");


      } catch (error) {

        console.error(
          "[BondStats Account] Email sign-in failed:",
          error
        );


        setStatus(
          error?.message ||
          "Sign-in failed."
        );
      }
    }


    /* ========================================================
       EMAIL SIGNUP
       ======================================================== */

    async function signUpWithEmail() {

      const {
        email,
        password
      } =
        credentials();


      if (
        !email ||
        !password
      ) {

        setStatus(
          "Enter an email and password."
        );

        return;
      }


      if (
        password.length < 8
      ) {

        setStatus(
          "Use at least 8 characters for the password."
        );

        return;
      }


      try {

        setStatus(
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
                DIRECT_APP_URL
            }
          });


        if (error) {
          throw error;
        }


        if (
          data?.session
        ) {

          currentUser =
            data.user ||
            null;


          renderAuthState();


          setStatus("");

        } else {

          setStatus(
            "Account created. Check your email to confirm your address."
          );

        }


      } catch (error) {

        console.error(
          "[BondStats Account] Account creation failed:",
          error
        );


        setStatus(
          error?.message ||
          "Account creation failed."
        );
      }
    }


    /* ========================================================
       LOGOUT
       ======================================================== */

    async function signOut() {

      try {

        const {
          error
        } =
          await db.auth.signOut();


        if (error) {
          throw error;
        }


        currentUser =
          null;


        currentConversationId =
          null;


        renderAuthState();


        closeModal();


      } catch (error) {

        console.error(
          "[BondStats Account] Logout failed:",
          error
        );

      }
    }


    /* ========================================================
       POPUP SESSION BRIDGE
       ======================================================== */

    async function sendPopupSessionToOpener() {

      if (
        !isAuthPopup()
      ) {
        return false;
      }


      try {

        const {
          data,
          error
        } =
          await db.auth.getSession();


        if (error) {
          throw error;
        }


        const session =
          data?.session;


        if (
          !session?.access_token ||
          !session?.refresh_token
        ) {

          return false;
        }


        /*
          Send tokens only to our opener.

          The opener validates the message type
          and then hands the session to Supabase.
        */

        window.opener.postMessage(
          {
            type:
              "BONDSTATS_AUTH_SESSION",

            accessToken:
              session.access_token,

            refreshToken:
              session.refresh_token
          },
          "*"
        );


        window.setTimeout(
          () => {
            window.close();
          },
          350
        );


        return true;


      } catch (error) {

        console.error(
          "[BondStats Account] Popup session transfer failed:",
          error
        );


        return false;
      }
    }


    /* ========================================================
       RECEIVE POPUP SESSION
       ======================================================== */

    function installSessionReceiver() {

      window.addEventListener(
        "message",

        async event => {

          const payload =
            event?.data;


          if (
            !payload ||
            payload.type !==
              "BONDSTATS_AUTH_SESSION"
          ) {
            return;
          }


          if (
            !payload.accessToken ||
            !payload.refreshToken
          ) {
            return;
          }


          try {

            const {
              data,
              error
            } =
              await db.auth.setSession({
                access_token:
                  payload.accessToken,

                refresh_token:
                  payload.refreshToken
              });


            if (error) {
              throw error;
            }


            currentUser =
              data?.session?.user ||
              null;


            renderAuthState();


            if (
              currentUser
            ) {

              await loadLatestConversation();

            }


            setStatus("");


            closeModal();


            console.log(
              "[BondStats Account] OAuth session received."
            );


          } catch (error) {

            console.error(
              "[BondStats Account] Could not import popup session:",
              error
            );

          }
        }
      );
    }


    /* ========================================================
       LOAD CURRENT SESSION
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


        if (
          currentUser
        ) {

          await loadLatestConversation();

        }


      } catch (error) {

        console.error(
          "[BondStats Account] Session load failed:",
          error
        );

      }
    }


    /* ========================================================
       CONVERSATIONS
       ======================================================== */

    async function createConversation(
      title
    ) {

      if (
        !currentUser
      ) {
        return null;
      }


      try {

        const {
          data,
          error
        } =
          await db
            .from(
              "conversations"
            )
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
          "[BondStats Account] Create conversation failed:",
          error
        );


        return null;
      }
    }


    /* ========================================================
       LOAD LATEST CONVERSATION
       ======================================================== */

    async function loadLatestConversation() {

      if (
        !currentUser
      ) {
        return;
      }


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
              "id,title,updated_at"
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
            .limit(1);


        if (error) {
          throw error;
        }


        currentConversationId =
          data?.[0]?.id ||
          null;


      } catch (error) {

        console.error(
          "[BondStats Account] Conversation load failed:",
          error
        );

      }
    }


    /* ========================================================
       NEW CONVERSATION
       ======================================================== */

    function resetConversation() {

      currentConversationId =
        null;


      savedMessageIds.clear();

    }


    /* ========================================================
       MESSAGE SAVE
       ======================================================== */

    async function saveMessage(
      role,
      content
    ) {

      if (
        !currentUser
      ) {
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


      if (
        !clean
      ) {
        return;
      }


      const messageId =
        `${role}:${clean}`;


      if (
        savedMessageIds.has(
          messageId
        )
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


          if (
            !conversation
          ) {
            return;
          }
        }


        const {
          error
        } =
          await db
            .from(
              "messages"
            )
            .insert({
              conversation_id:
                currentConversationId,

              user_id:
                currentUser.id,

              role,

              content:
                clean
            });


        if (
          error
        ) {
          throw error;
        }


        savedMessageIds.add(
          messageId
        );


        await db
          .from(
            "conversations"
          )
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
          "[BondStats Account] Message persistence failed:",
          error
        );

      }
    }


    /* ========================================================
       MESSAGE CONTAINER
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


    /* ========================================================
       ROLE DETECTION
       ======================================================== */

    function detectRole(
      element
    ) {

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
          element.getAttribute(
            "data-role"
          )
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


      if (
        descriptor.includes(
          "user-message"
        ) ||
        descriptor.includes(
          "message-user"
        ) ||
        /\buser\b/.test(
          descriptor
        )
      ) {

        return "user";
      }


      if (
        descriptor.includes(
          "assistant-message"
        ) ||
        descriptor.includes(
          "ai-message"
        ) ||
        descriptor.includes(
          "message-assistant"
        )
      ) {

        return "assistant";
      }


      return null;
    }


    /* ========================================================
       INSPECT MESSAGE NODE
       ======================================================== */

    function inspectNode(node) {

      if (
        !currentUser ||
        !(node instanceof HTMLElement)
      ) {
        return;
      }


      const candidates =
        [
          node,

          ...node.querySelectorAll(
            [
              "[data-role]",
              ".user-message",
              ".assistant-message",
              ".ai-message"
            ].join(",")
          )
        ];


      for (
        const candidate
        of candidates
      ) {

        const role =
          detectRole(
            candidate
          );


        if (
          !role
        ) {
          continue;
        }


        const text =
          safeText(
            candidate.innerText
          );


        if (
          !text
        ) {
          continue;
        }


        saveMessage(
          role,
          text
        );
      }
    }


    /* ========================================================
       CHAT OBSERVER
       ======================================================== */

    function startChatObserver(
      attempt = 0
    ) {

      const container =
        findMessagesContainer();


      if (
        !container
      ) {

        if (
          attempt < 30
        ) {

          window.setTimeout(
            () => {
              startChatObserver(
                attempt + 1
              );
            },
            1000
          );

        }

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

                inspectNode(
                  node
                );

              }
            }
          }
        );


      observer.observe(
        container,
        {
          childList: true,
          subtree: true
        }
      );


      console.log(
        "[BondStats Account] Chat observer active."
      );
    }


    /* ========================================================
       NEW SESSION LISTENER
       ======================================================== */

    function attachNewSessionListener() {

      const button =
        findNewSessionButton();


      if (
        !button
      ) {
        return;
      }


      button.addEventListener(
        "click",
        resetConversation,
        {
          passive:
            true
        }
      );
    }


    /* ========================================================
       AUTH STATE
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
              loadLatestConversation,
              0
            );

          }


        } catch (error) {

          console.error(
            "[BondStats Account] Auth listener failed:",
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

        injectStyles();


        createModal();


        /*
          IMPORTANT:
          OAuth popup returns to this exact GitHub page.

          If this page has an opener and a valid session,
          immediately send the session back to the iframe.
        */

        const popupTransferred =
          await sendPopupSessionToOpener();


        if (
          popupTransferred
        ) {
          return;
        }


        installSessionReceiver();


        createTrigger();


        attachNewSessionListener();


        await loadSession();


        startChatObserver();


        console.log(
          "[BondStats Account] Account system ready.",
          {
            embedded:
              isEmbedded(),

            authenticated:
              Boolean(
                currentUser
              )
          }
        );


      } catch (error) {

        /*
          This entire account layer is isolated.

          app.js continues even if anything here fails.
        */

        console.error(
          "[BondStats Account] Startup error:",
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

    console.error(
      "[BondStats Account] Isolated fatal error:",
      fatalError
    );

  }

})();
