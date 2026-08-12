"use strict";

/* ============================================================
   BONDSTATS ACCOUNT + CHAT PERSISTENCE
   Stable Edition
   ============================================================

   FEATURES
   ------------------------------------------------------------
   ✓ One shared Supabase client
   ✓ Google OAuth
   ✓ Email/password login
   ✓ Email/password signup
   ✓ Persistent browser session
   ✓ iframe-safe Google popup flow
   ✓ Account button beside New Session
   ✓ Automatic chat persistence
   ✓ New Session creates a fresh conversation
   ✓ User + assistant messages stored
   ✓ Conversation titles from first user message
   ✓ Shared client exposed for history.js
   ✓ No submit interception
   ✓ No Enter interception
   ✓ No app.js modification
   ✓ No async Supabase work inside onAuthStateChange
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

    const DIRECT_APP_URL =
      "https://botapi33.github.io/BondStats-AI/";


    /* ========================================================
       HARD FAIL-SAFE
       ======================================================== */

    if (!window.supabase?.createClient) {
      console.warn(
        "[BondStats Account] Supabase JS unavailable. Main AI continues normally."
      );
      return;
    }


    /* ========================================================
       ONE SHARED SUPABASE CLIENT
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

    /*
      CRITICAL:

      history.js must use THIS same client.
      It must not create another one.
    */

    window.BondStatsSupabase = db;


    /* ========================================================
       STATE
       ======================================================== */

    let currentUser = null;

    let currentConversationId = null;

    let observer = null;

    let observerStarted = false;

    let newSessionButtonHooked = false;

    let authInitialized = false;

    /*
      WeakMap prevents the same rendered message element
      from being stored multiple times.
    */

    const savedElements =
      new WeakSet();

    /*
      Timers allow assistant messages to finish rendering
      before they are persisted.
    */

    const elementTimers =
      new WeakMap();


    /* ========================================================
       HELPERS
       ======================================================== */

    function safeText(value) {
      return typeof value === "string"
        ? value.trim()
        : "";
    }


    function isEmbedded() {
      try {
        return window.self !== window.top;
      } catch {
        return true;
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


    function setAccountStatus(message) {
      const el =
        document.getElementById(
          "bondstats-account-status"
        );

      if (el) {
        el.textContent =
          message || "";
      }
    }


    /* ========================================================
       ACCOUNT STYLES
       ======================================================== */

    function injectAccountStyles() {

      if (
        document.getElementById(
          "bondstats-account-styles"
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
          position: relative !important;
          inset: auto !important;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          flex: 0 0 auto;

          min-height: 38px;

          padding:
            0 15px;

          margin:
            0 10px 0 0;

          border-radius:
            999px;

          border:
            1px solid
            rgba(118,255,163,.48);

          background:
            rgba(8,31,20,.84);

          color:
            #effff4;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size:
            13px;

          font-weight:
            600;

          cursor:
            pointer;

          white-space:
            nowrap;

          backdrop-filter:
            blur(12px);

          transition:
            background .16s ease,
            border-color .16s ease,
            transform .16s ease;
        }


        #bondstats-account-trigger:hover {
          background:
            rgba(13,47,30,.95);

          border-color:
            rgba(118,255,163,.78);

          transform:
            translateY(-1px);
        }


        .bondstats-account-dot {
          width:
            7px;

          height:
            7px;

          border-radius:
            50%;

          background:
            #75ff9d;

          box-shadow:
            0 0 9px
            rgba(117,255,157,.9);
        }


        #bondstats-account-fallback {
          position:
            fixed;

          right:
            18px;

          bottom:
            18px;

          z-index:
            9000;
        }


        #bondstats-account-backdrop {
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
            22px;

          background:
            rgba(0,0,0,.72);

          backdrop-filter:
            blur(12px);
        }


        #bondstats-account-modal {
          box-sizing:
            border-box;

          width:
            min(420px, 100%);

          padding:
            27px;

          border-radius:
            22px;

          border:
            1px solid
            rgba(113,255,161,.28);

          background:
            linear-gradient(
              180deg,
              rgba(18,55,36,.995),
              rgba(5,19,13,.998)
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


        #bondstats-account-close {
          float:
            right;

          width:
            32px;

          height:
            32px;

          margin:
            -3px -3px 0 10px;

          border-radius:
            50%;

          border:
            1px solid
            rgba(160,255,190,.18);

          background:
            rgba(255,255,255,.025);

          color:
            white;

          font-size:
            20px;

          cursor:
            pointer;
        }


        .bondstats-account-title {
          margin:
            0 0 6px;

          font-size:
            22px;

          line-height:
            1.2;

          font-weight:
            700;
        }


        .bondstats-account-subtitle {
          margin:
            0 0 22px;

          color:
            rgba(232,255,240,.68);

          font-size:
            13px;

          line-height:
            1.5;
        }


        #bondstats-google-login {
          width:
            100%;

          height:
            44px;

          padding:
            0 16px;

          border-radius:
            22px;

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

          gap:
            11px;

          cursor:
            pointer;

          font-size:
            14px;

          font-weight:
            500;
        }


        #bondstats-google-login:hover {
          background:
            #202124;
        }


        .bondstats-google-logo {
          width:
            18px;

          height:
            18px;

          flex:
            0 0 18px;
        }


        .bondstats-account-divider {
          display:
            flex;

          align-items:
            center;

          gap:
            12px;

          margin:
            19px 0;

          color:
            rgba(230,255,238,.38);

          font-size:
            11px;
        }


        .bondstats-account-divider::before,
        .bondstats-account-divider::after {
          content:
            "";

          flex:
            1;

          height:
            1px;

          background:
            rgba(126,255,167,.14);
        }


        .bondstats-account-input {
          width:
            100%;

          height:
            44px;

          display:
            block;

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


        .bondstats-account-input:focus {
          border-color:
            rgba(116,255,161,.60);
        }


        #bondstats-email-login {
          width:
            100%;

          height:
            44px;

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
          width:
            100%;

          margin-top:
            6px;

          padding:
            11px;

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


        #bondstats-account-status {
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


        #bondstats-account-signed-in {
          display:
            none;
        }


        #bondstats-account-email-display {
          margin:
            14px 0 18px;

          padding:
            12px 14px;

          border-radius:
            12px;

          border:
            1px solid
            rgba(130,255,170,.10);

          background:
            rgba(0,0,0,.23);

          color:
            #e0ffea;

          font-size:
            13px;

          overflow-wrap:
            anywhere;
        }


        #bondstats-account-signout {
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


        @media (max-width:700px) {

          #bondstats-account-trigger {
            min-height:
              34px;

            padding:
              0 11px;

            font-size:
              12px;
          }

        }

      `;


      document.head.appendChild(
        style
      );
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
       ACCOUNT MODAL
       ======================================================== */

    function createAccountModal() {

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

        <section
          id="bondstats-account-modal"
        >

          <button
            id="bondstats-account-close"
            type="button"
          >
            ×
          </button>


          <div
            id="bondstats-account-signed-out"
          >

            <h2
              class="bondstats-account-title"
            >
              Sign in to BondStats
            </h2>


            <p
              class="bondstats-account-subtitle"
            >
              Keep your conversations and analysis
              connected to your account.
            </p>


            <button
              id="bondstats-google-login"
              type="button"
            >
              ${googleLogo()}

              <span>
                Continue with Google
              </span>
            </button>


            <div
              class="bondstats-account-divider"
            >
              or
            </div>


            <input
              id="bondstats-account-email"
              class="bondstats-account-input"
              type="email"
              placeholder="Email"
              autocomplete="email"
            />


            <input
              id="bondstats-account-password"
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
              id="bondstats-account-status"
            ></div>

          </div>


          <div
            id="bondstats-account-signed-in"
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


      document.body.appendChild(
        backdrop
      );


      backdrop.addEventListener(
        "click",
        event => {

          if (
            event.target === backdrop
          ) {
            closeAccountModal();
          }

        }
      );


      document
        .getElementById(
          "bondstats-account-close"
        )
        ?.addEventListener(
          "click",
          closeAccountModal
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
       NEW SESSION BUTTON DETECTION
       ======================================================== */

    function findNewSessionButton() {

      const selectors = [
        "#newSession",
        "#newSessionBtn",
        "#new-session",
        ".new-session",
        ".new-session-btn",
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


        if (button) {
          return button;
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

        if (
          safeText(
            candidate.textContent
          ).toLowerCase() ===
          "new session"
        ) {

          return candidate;

        }
      }


      return null;
    }


    /* ========================================================
       ACCOUNT BUTTON
       ======================================================== */

    function createAccountTrigger() {

      if (
        document.getElementById(
          "bondstats-account-trigger"
        )
      ) {
        return;
      }


      const trigger =
        document.createElement("button");


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
        openAccountModal
      );


      const newSession =
        findNewSessionButton();


      if (
        newSession &&
        newSession.parentElement
      ) {

        newSession.parentElement
          .insertBefore(
            trigger,
            newSession
          );


        return;
      }


      const fallback =
        document.createElement("div");


      fallback.id =
        "bondstats-account-fallback";


      fallback.appendChild(
        trigger
      );


      document.body.appendChild(
        fallback
      );
    }


    function openAccountModal() {

      const backdrop =
        document.getElementById(
          "bondstats-account-backdrop"
        );


      if (backdrop) {

        backdrop.style.display =
          "flex";

      }
    }


    function closeAccountModal() {

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
       AUTH UI
       ======================================================== */

    function renderAuthState() {

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


      const trigger =
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


        if (trigger) {

          trigger.textContent =
            "Account";

        }


      } else {

        signedOut.style.display =
          "block";


        signedIn.style.display =
          "none";


        if (trigger) {

          trigger.textContent =
            "Sign in";

        }

      }
    }


    /* ========================================================
       INITIAL SESSION
       ======================================================== */

    async function loadInitialSession() {

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


        /*
          Load last conversation OUTSIDE
          onAuthStateChange.
        */

        if (currentUser) {

          await loadConversationSelection();

        }


        authInitialized =
          true;


      } catch (error) {

        console.error(
          "[BondStats Account] Initial session failed:",
          error
        );

      }
    }


    /* ========================================================
       AUTH STATE LISTENER
       ======================================================== */

    /*
      IMPORTANT:

      NO async callback.
      NO await inside this listener.
      NO db.from() calls inside this listener.

      Supabase documents an active deadlock issue
      with async work inside onAuthStateChange.
    */

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


            return;
          }


          /*
            Schedule DB work AFTER callback completes.
          */

          if (
            event === "SIGNED_IN" ||
            event === "INITIAL_SESSION"
          ) {

            window.setTimeout(
              () => {

                loadConversationSelection()
                  .catch(
                    error => {

                      console.error(
                        "[BondStats Account] Conversation selection failed:",
                        error
                      );

                    }
                  );

              },
              0
            );

          }


        } catch (error) {

          console.error(
            "[BondStats Account] Auth listener error:",
            error
          );

        }
      }
    );

     /* =========================================================
   PASSWORD RESET
   ========================================================= */

async function sendPasswordReset(email) {
  try {
    const cleanEmail =
      String(email || "").trim();

    if (!cleanEmail) {
      setAccountStatus(
        "Enter your email address first."
      );
      return;
    }

    setAccountStatus(
      "Sending password reset email…"
    );

    const { error } =
      await db.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo:
            DIRECT_APP_URL
        }
      );

    if (error) {
      throw error;
    }

    setAccountStatus(
      "Password reset email sent. Check your inbox."
    );
  } catch (error) {
    console.error(
      "[BondStats Account] Password reset failed:",
      error
    );

    setAccountStatus(
      error?.message ||
      "Password reset failed."
    );
  }
}


    /* ========================================================
       GOOGLE AUTH
       ======================================================== */

    async function googleSignIn() {

      try {

        setAccountStatus(
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


        const authWindow =
          window.open(
            data.url,
            "bondstats-google-auth",
            "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes"
          );


        if (!authWindow) {

          window.open(
            data.url,
            "_blank"
          );

        }


        setAccountStatus(
          "Complete sign-in in the Google window."
        );


      } catch (error) {

        console.error(
          "[BondStats Account] Google sign-in failed:",
          error
        );


        setAccountStatus(
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
      } =
        credentials();


      if (
        !email ||
        !password
      ) {

        setAccountStatus(
          "Enter email and password."
        );


        return;
      }


      try {

        setAccountStatus(
          "Signing in…"
        );


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


        renderAuthState();


        /*
          Safe direct call here.
          We're no longer inside the auth callback.
        */

        if (currentUser) {

          await loadConversationSelection();

        }


        setAccountStatus("");


      } catch (error) {

        console.error(
          "[BondStats Account] Email login failed:",
          error
        );


        setAccountStatus(
          error?.message ||
          "Sign-in failed."
        );

      }
    }


    async function emailSignUp() {

      const {
        email,
        password
      } =
        credentials();


      if (
        !email ||
        !password
      ) {

        setAccountStatus(
          "Enter email and password."
        );


        return;
      }


      if (
        password.length < 8
      ) {

        setAccountStatus(
          "Password must contain at least 8 characters."
        );


        return;
      }


      try {

        setAccountStatus(
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


          await loadConversationSelection();


          setAccountStatus("");


        } else {

          setAccountStatus(
            "Account created. Check your email to confirm your address."
          );

        }


      } catch (error) {

        console.error(
          "[BondStats Account] Sign-up failed:",
          error
        );


        setAccountStatus(
          error?.message ||
          "Account creation failed."
        );

      }
    }


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


        closeAccountModal();


      } catch (error) {

        console.error(
          "[BondStats Account] Sign out failed:",
          error
        );

      }
    }


    /* ========================================================
       POPUP OAUTH SESSION TRANSFER
       ======================================================== */

    async function transferPopupSession() {

      if (!isPopup()) {

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


        window.opener.postMessage(
          {
            type:
              "BONDSTATS_SUPABASE_SESSION",

            accessToken:
              session.access_token,

            refreshToken:
              session.refresh_token
          },

          new URL(
            DIRECT_APP_URL
          ).origin
        );


        window.setTimeout(
          () => {

            try {
              window.close();
            } catch {
              // no-op
            }

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


    function installPopupReceiver() {

      window.addEventListener(
        "message",

        async event => {

          /*
            Only trust GitHub Pages app origin.
          */

          const expectedOrigin =
            new URL(
              DIRECT_APP_URL
            ).origin;


          if (
            event.origin !==
            expectedOrigin
          ) {

            return;

          }


          const payload =
            event?.data;


          if (
            !payload ||
            payload.type !==
            "BONDSTATS_SUPABASE_SESSION"
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


            if (currentUser) {

              await loadConversationSelection();

            }


            setAccountStatus("");


            closeAccountModal();


          } catch (error) {

            console.error(
              "[BondStats Account] Session import failed:",
              error
            );

          }
        }
      );
    }


    /* ========================================================
       CONVERSATION SELECTION
       ======================================================== */

    async function loadConversationSelection() {

      if (!currentUser) {

        currentConversationId =
          null;


        return;
      }


      /*
        First prefer the conversation explicitly
        selected through History -> Open & Continue.
      */

      const selected =
        sessionStorage.getItem(
          "bondstats_continue_conversation_id"
        ) ||
        localStorage.getItem(
          "bondstats_selected_conversation"
        );


      if (selected) {

        const {
          data,
          error
        } =
          await db
            .from("conversations")
            .select(
              "id"
            )
            .eq(
              "id",
              selected
            )
            .eq(
              "user_id",
              currentUser.id
            )
            .maybeSingle();


        if (
          !error &&
          data?.id
        ) {

          currentConversationId =
            data.id;


          sessionStorage.removeItem(
            "bondstats_continue_conversation_id"
          );


          return;

        }
      }


      /*
        Otherwise load newest conversation.
      */

      const {
        data,
        error
      } =
        await db
          .from("conversations")
          .select(
            "id,updated_at"
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

        console.error(
          "[BondStats Account] Load latest conversation failed:",
          error
        );


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


      const cleanTitle =
        safeText(title)
          .slice(0, 120) ||
        "New conversation";


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
                cleanTitle
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


        /*
          Clear "continue" selection once a genuinely
          new conversation has been created.
        */

        localStorage.removeItem(
          "bondstats_selected_conversation"
        );


        localStorage.removeItem(
          "bondstats_selected_conversation_title"
        );


        sessionStorage.removeItem(
          "bondstats_continue_conversation_id"
        );


        return data;


      } catch (error) {

        console.error(
          "[BondStats Account] Conversation creation failed:",
          error
        );


        return null;

      }
    }


    /* ========================================================
       UPDATE CONVERSATION TIMESTAMP
       ======================================================== */

    async function touchConversation() {

      if (
        !currentUser ||
        !currentConversationId
      ) {

        return;
      }


      try {

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
              currentConversationId
            )
            .eq(
              "user_id",
              currentUser.id
            );


        if (error) {

          console.error(
            "[BondStats Account] Conversation update failed:",
            error
          );

        }


      } catch (error) {

        console.error(
          "[BondStats Account] Conversation touch exception:",
          error
        );

      }
    }


    /* ========================================================
       SAVE MESSAGE
       ======================================================== */

    async function saveMessage(
      role,
      content
    ) {

      if (
        !currentUser
      ) {

        return false;

      }


      if (
        role !== "user" &&
        role !== "assistant"
      ) {

        return false;

      }


      const clean =
        safeText(content);


      if (!clean) {

        return false;

      }


      try {

        /*
          IMPORTANT:

          If this is the first message after New Session,
          create a NEW conversation.

          Title comes from first user message.
        */

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
          throw error;
        }


        await touchConversation();


        /*
          Notify other modules without coupling them.
        */

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


      } catch (error) {

        console.error(
          "[BondStats Account] Message save failed:",
          error
        );


        return false;

      }
    }


    /* ========================================================
       NEW SESSION
       ======================================================== */

    function resetConversation() {

      currentConversationId =
        null;


      localStorage.removeItem(
        "bondstats_selected_conversation"
      );


      localStorage.removeItem(
        "bondstats_selected_conversation_title"
      );


      sessionStorage.removeItem(
        "bondstats_continue_conversation_id"
      );


      console.log(
        "[BondStats Account] New conversation armed."
      );
    }


    function hookNewSessionButton() {

      if (newSessionButtonHooked) {

        return;

      }


      const button =
        findNewSessionButton();


      if (!button) {

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


      newSessionButtonHooked =
        true;
    }


    /* ========================================================
       MESSAGE CONTAINER DETECTION
       ======================================================== */

    function findMessagesContainer() {

      const selectors = [
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
        of selectors
      ) {

        const candidate =
          document.querySelector(
            selector
          );


        if (candidate) {

          return candidate;

        }
      }


      return null;
    }


    /* ========================================================
       MESSAGE ROLE DETECTION
       ======================================================== */

    function detectMessageRole(
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
          element.getAttribute?.(
            "data-role"
          ),
          element.getAttribute?.(
            "aria-label"
          )
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


      /*
        User message patterns.
      */

      if (
        descriptor.includes(
          "user-message"
        ) ||
        descriptor.includes(
          "message-user"
        ) ||
        descriptor.includes(
          "chat-user"
        ) ||
        descriptor.includes(
          "user-bubble"
        ) ||
        /\buser\b/.test(
          descriptor
        )
      ) {

        return "user";

      }


      /*
        Assistant message patterns.
      */

      if (
        descriptor.includes(
          "assistant-message"
        ) ||
        descriptor.includes(
          "message-assistant"
        ) ||
        descriptor.includes(
          "ai-message"
        ) ||
        descriptor.includes(
          "ai-response"
        ) ||
        descriptor.includes(
          "assistant"
        )
      ) {

        return "assistant";

      }


      return null;
    }


    /* ========================================================
       FIND MESSAGE ELEMENT
       ======================================================== */

    function nearestMessageElement(
      node
    ) {

      if (
        !(node instanceof HTMLElement)
      ) {

        return null;

      }


      /*
        Test node itself.
      */

      if (
        detectMessageRole(node)
      ) {

        return node;

      }


      /*
        Test descendants.
      */

      const selectors = [
        "[data-role='user']",
        "[data-role='assistant']",
        ".user-message",
        ".assistant-message",
        ".message-user",
        ".message-assistant",
        ".ai-message",
        ".ai-response",
        ".user-bubble"
      ];


      for (
        const selector
        of selectors
      ) {

        const child =
          node.querySelector(
            selector
          );


        if (child) {

          return child;

        }
      }


      /*
        Test parents.
      */

      let parent =
        node.parentElement;


      let depth =
        0;


      while (
        parent &&
        depth < 6
      ) {

        if (
          detectMessageRole(
            parent
          )
        ) {

          return parent;

        }


        parent =
          parent.parentElement;


        depth += 1;
      }


      return null;
    }


    /* ========================================================
       DEBOUNCED MESSAGE PERSISTENCE
       ======================================================== */

    function scheduleMessageSave(
      messageElement
    ) {

      if (
        !messageElement ||
        savedElements.has(
          messageElement
        )
      ) {

        return;

      }


      const existingTimer =
        elementTimers.get(
          messageElement
        );


      if (existingTimer) {

        window.clearTimeout(
          existingTimer
        );

      }


      /*
        Wait for rendering/streaming to settle.
      */

      const timer =
        window.setTimeout(
          async () => {

            elementTimers.delete(
              messageElement
            );


            if (
              savedElements.has(
                messageElement
              )
            ) {

              return;

            }


            const role =
              detectMessageRole(
                messageElement
              );


            if (!role) {

              return;

            }


            const content =
              safeText(
                messageElement.innerText
              );


            if (!content) {

              return;

            }


            /*
              Ignore obvious UI-only controls.
            */

            if (
              content === "New Session" ||
              content === "Analyze" ||
              content === "History" ||
              content === "Account"
            ) {

              return;

            }


            const success =
              await saveMessage(
                role,
                content
              );


            if (success) {

              savedElements.add(
                messageElement
              );

            }

          },
          900
        );


      elementTimers.set(
        messageElement,
        timer
      );
    }


    /* ========================================================
       PROCESS MUTATION NODE
       ======================================================== */

    function processNode(
      node
    ) {

      if (
        !currentUser
      ) {

        return;

      }


      if (
        !(node instanceof HTMLElement)
      ) {

        return;

      }


      /*
        Direct candidate.
      */

      const direct =
        nearestMessageElement(
          node
        );


      if (direct) {

        scheduleMessageSave(
          direct
        );

      }


      /*
        Multiple descendants may have been inserted.
      */

      const descendants =
        node.querySelectorAll(
          [
            "[data-role='user']",
            "[data-role='assistant']",
            ".user-message",
            ".assistant-message",
            ".message-user",
            ".message-assistant",
            ".ai-message",
            ".ai-response",
            ".user-bubble"
          ].join(",")
        );


      descendants.forEach(
        element => {

          scheduleMessageSave(
            element
          );

        }
      );
    }


    /* ========================================================
       OBSERVER
       ======================================================== */

    function startChatObserver(
      attempt = 0
    ) {

      if (observerStarted) {

        return;

      }


      const container =
        findMessagesContainer();


      if (!container) {

        if (
          attempt < 60
        ) {

          window.setTimeout(
            () => {

              startChatObserver(
                attempt + 1
              );

            },
            500
          );

        } else {

          console.warn(
            "[BondStats Account] Chat container not found."
          );

        }


        return;
      }


      observer =
        new MutationObserver(
          mutations => {

            if (!currentUser) {

              return;

            }


            for (
              const mutation
              of mutations
            ) {

              /*
                Added elements.
              */

              mutation.addedNodes
                .forEach(
                  node => {

                    processNode(
                      node
                    );

                  }
                );


              /*
                Existing assistant node may be updated
                while text is streaming/rendering.
              */

              if (
                mutation.type ===
                  "characterData" ||
                mutation.type ===
                  "childList"
              ) {

                const target =
                  mutation.target instanceof HTMLElement
                    ? mutation.target
                    : mutation.target.parentElement;


                if (target) {

                  const messageElement =
                    nearestMessageElement(
                      target
                    );


                  if (
                    messageElement
                  ) {

                    scheduleMessageSave(
                      messageElement
                    );

                  }
                }
              }
            }
          }
        );


      observer.observe(
        container,
        {
          childList:
            true,

          subtree:
            true,

          characterData:
            true
        }
      );


      observerStarted =
        true;


      console.log(
        "[BondStats Account] Chat persistence observer active."
      );
    }


    /* ========================================================
       PROCESS EXISTING MESSAGES
       ======================================================== */

    function scanExistingMessages() {

      if (!currentUser) {

        return;

      }


      const container =
        findMessagesContainer();


      if (!container) {

        return;

      }


      const candidates =
        container.querySelectorAll(
          [
            "[data-role='user']",
            "[data-role='assistant']",
            ".user-message",
            ".assistant-message",
            ".message-user",
            ".message-assistant",
            ".ai-message",
            ".ai-response",
            ".user-bubble"
          ].join(",")
        );


      candidates.forEach(
        candidate => {

          /*
            Existing page content should NOT automatically
            be duplicated into Supabase on every reload.

            Mark it as already handled.
          */

          savedElements.add(
            candidate
          );

        }
      );
    }


    /* ========================================================
       START
       ======================================================== */

    async function start() {

      try {

        injectAccountStyles();


        createAccountModal();


        /*
          OAuth popup return:
          transfer session immediately and stop.
        */

        const transferred =
          await transferPopupSession();


        if (transferred) {

          return;

        }


        installPopupReceiver();


        createAccountTrigger();


        hookNewSessionButton();


        await loadInitialSession();


        /*
          Existing rendered messages should not be
          reinserted into database.
        */

        scanExistingMessages();


        startChatObserver();


        /*
          New Session button may render later.
        */

        if (!newSessionButtonHooked) {

          let attempts = 0;


          const newSessionTimer =
            window.setInterval(
              () => {

                attempts += 1;


                hookNewSessionButton();


                if (
                  newSessionButtonHooked ||
                  attempts >= 40
                ) {

                  window.clearInterval(
                    newSessionTimer
                  );

                }

              },
              500
            );
        }


        console.log(
          "[BondStats Account] Ready.",
          {
            signedIn:
              Boolean(
                currentUser
              ),

            embedded:
              isEmbedded()
          }
        );


      } catch (error) {

        console.error(
          "[BondStats Account] Startup failed:",
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
          once:
            true
        }
      );


    } else {

      start();

    }


  } catch (fatalError) {

    /*
      No account error may escape and affect app.js.
    */

    console.error(
      "[BondStats Account] Fatal isolated error:",
      fatalError
    );

  }
})();
