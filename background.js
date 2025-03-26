// Set user to trial status on installation but preserve paid status
chrome.runtime.onInstalled.addListener(() => {
  // Generate a unique user ID if not already present
  chrome.storage.sync.get(['userId', 'userStatus'], (data) => {
    if (!data.userId) {
      const userId = 'user_' + Math.random().toString(36).substring(2, 15);
      chrome.storage.sync.set({ userId });
    }
    
    // Only set to trial if no status exists yet
    if (!data.userStatus) {
      chrome.storage.sync.set({ userStatus: 'trial' });
    }
  });
}); 