// Set user to trial status on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ userStatus: 'trial' }, () => {
    console.log('User status set to trial');
  });
}); 