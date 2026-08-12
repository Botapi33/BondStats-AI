/* =========================================================
   BondStats AI — Conversation Memory
   ========================================================= */

(() => {
  "use strict";

  async function getConversationMemory(
    conversationId,
    limit = 12
  ) {
    try {
      if (!conversationId) {
        return "";
      }

      if (!window.supabase) {
        console.error(
          "[BondStats Memory] Supabase library not available."
        );
        return "";
      }

      /*
       * We intentionally look for the existing BondStats
       * Supabase client instead of changing auth/history.
       */
      const db =
  window.BondStatsSupabase ||
  null;

      if (!db) {
        console.warn(
          "[BondStats Memory] Existing Supabase client not found."
        );
        return "";
      }

      const {
        data,
        error
      } = await db.rpc(
        "get_conversation_memory",
        {
          p_conversation_id:
            conversationId,
          p_limit:
            limit
        }
      );

      if (error) {
        console.error(
          "[BondStats Memory] RPC failed:",
          error
        );
        return "";
      }

      if (
        !Array.isArray(data) ||
        data.length === 0
      ) {
        return "";
      }

      return [...data]
        .reverse()
        .map((item) => {
          const role =
            item.role === "assistant"
              ? "Assistant"
              : "User";

          return `${role}: ${item.content}`;
        })
        .join("\n\n");

    } catch (error) {
      console.error(
        "[BondStats Memory] Failed:",
        error
      );

      return "";
    }
  }

  async function buildMessage(
    conversationId,
    currentMessage
  ) {
    const memory =
      await getConversationMemory(
        conversationId,
        12
      );

    if (!memory) {
      return currentMessage;
    }

    return `Previous conversation context:

${memory}

Current user question:

${currentMessage}`;
  }

  window.BondStatsMemory = {
    get:
      getConversationMemory,

    buildMessage:
      buildMessage
  };

  console.log(
    "[BondStats Memory] Ready"
  );
})();
