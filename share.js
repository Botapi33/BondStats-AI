document.addEventListener("click", async event => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest(".share-analysis-button");

  if (!button) {
    return;
  }

  const message =
    button.closest(".assistant-message");

  if (!message) {
    return;
  }

  const answer =
    message.querySelector(".assistant-answer")
      ?.textContent
      ?.trim() || "";

  const shareText = [
    "BondStats AI Analysis",
    "",
    answer,
    "",
    window.location.href
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({
        title: "BondStats AI Analysis",
        text: shareText,
        url: window.location.href
      });

      return;
    }

    await navigator.clipboard.writeText(shareText);

    const originalText = button.textContent;

    button.textContent = "Copied";

    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("Sharing failed:", error);
    }
  }
});
