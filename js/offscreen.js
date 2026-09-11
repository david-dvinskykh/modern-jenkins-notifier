/**
 * Plays notification sounds on behalf of the service worker.
 */

let playing = 0;
let closeTimer = null;

function closeWhenIdle() {
  if (closeTimer) {
    clearTimeout(closeTimer);
  }
  // A short grace period keeps the document around for a burst of results.
  closeTimer = setTimeout(() => {
    if (playing === 0) {
      window.close();
    }
  }, 5000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'playNotificationSound') {
    return false;
  }

  playing++;
  const audio = new Audio(message.url);

  const done = () => {
    playing = Math.max(0, playing - 1);
    closeWhenIdle();
  };

  audio.addEventListener('ended', done);
  audio.addEventListener('error', done);

  audio.play().then(() => {
    sendResponse({played: true});
  }).catch((error) => {
    console.error('Failed to play the notification sound:', error);
    done();
    sendResponse({played: false, error: error.message});
  });

  return true;
});
