async function toggle(tabId: number | undefined) {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "toggle" });
  } catch {
    // Pages like chrome:// have no content script. Nothing to do.
  }
}

chrome.action.onClicked.addListener((tab) => toggle(tab.id));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-comment-mode") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggle(tab?.id);
});
