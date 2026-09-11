/**
 * Modern Jenkins Notifier
 *
 * Extra alerting around chrome.notifications.
 *
 * A notification handed to the operating system is shown the way the operating
 * system wants: on many setups it goes straight to the notification centre,
 * without a banner and without a sound. Two things are therefore done by the
 * extension itself, where the behaviour is predictable:
 *
 *  - the sound is played from an offscreen document, because a Manifest V3
 *    service worker has no DOM and cannot play audio on its own;
 *  - an on-screen pop-up window is opened, which does not depend on the
 *    notification settings of the browser or of the system.
 */

const SOUND_FILES = {
  default: 'sounds/notification.wav',
  error: 'sounds/notification-error.wav'
};

const OFFSCREEN_DOCUMENT = 'offscreen.html';
const TOAST_PAGE = 'toast.html';
const TOAST_WIDTH = 380;
const TOAST_HEIGHT = 190;
const TOAST_MARGIN = 24;

let offscreenSetup = null;

function soundFile(kind) {
  return SOUND_FILES[kind] || SOUND_FILES.default;
}

// Statuses worth a more sombre sound.
export function soundKindForStatus(status) {
  return status === 'Failure' || status === 'Unstable' || status === 'Aborted'
    ? 'error'
    : 'default';
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, () => {
        // No receiver is a normal outcome here, not a failure to report.
        resolve(!chrome.runtime.lastError);
      });
    } catch (error) {
      resolve(false);
    }
  });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    return false;
  }

  if (!offscreenSetup) {
    offscreenSetup = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT,
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play a sound together with the build result notification.'
        });
      } catch (error) {
        // A document already exists, which is exactly what is needed.
        if (!/single offscreen/i.test(error.message || '')) {
          offscreenSetup = null;
          throw error;
        }
      }
      return true;
    })();
  }

  return offscreenSetup;
}

export async function playNotificationSound(kind) {
  const url = chrome.runtime.getURL(soundFile(kind));

  // Popup and options pages can play the sound themselves.
  if (typeof Audio !== 'undefined') {
    try {
      const audio = new Audio(url);
      await audio.play();
      return true;
    } catch (error) {
      console.warn('Could not play the notification sound directly:', error.message);
    }
  }

  try {
    if (!(await ensureOffscreenDocument())) {
      console.warn('No way to play a sound in this browser');
      return false;
    }
    return await sendRuntimeMessage({type: 'playNotificationSound', url: url});
  } catch (error) {
    console.warn('Could not play the notification sound:', error.message);
    return false;
  }
}

function toastUrl(alert) {
  const params = new URLSearchParams({
    title: alert.title || '',
    job: alert.job || '',
    message: alert.message || '',
    status: alert.status || '',
    url: alert.url || '',
    note: alert.note || ''
  });
  return chrome.runtime.getURL(TOAST_PAGE) + '?' + params.toString();
}

function getLastFocusedWindow() {
  return new Promise((resolve) => {
    if (!chrome.windows || !chrome.windows.getLastFocused) {
      resolve(null);
      return;
    }
    try {
      chrome.windows.getLastFocused({}, (win) => {
        void chrome.runtime.lastError;
        resolve(win || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function createWindow(createData) {
  return new Promise((resolve, reject) => {
    try {
      chrome.windows.create(createData, (win) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(win);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function sessionStorage() {
  return chrome.storage && chrome.storage.session ? chrome.storage.session : null;
}

function readToastWindowId() {
  const store = sessionStorage();
  if (!store) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    store.get({toastWindowId: null}, (objects) => {
      void chrome.runtime.lastError;
      resolve(objects ? objects.toastWindowId : null);
    });
  });
}

function writeToastWindowId(id) {
  const store = sessionStorage();
  if (!store) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    store.set({toastWindowId: id}, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

// Several jobs can finish within the same refresh, so an open pop-up is reused
// instead of stacking one window per job.
export async function showBuildToast(alert) {
  if (!chrome.windows || !chrome.windows.create) {
    return false;
  }

  const openId = await readToastWindowId();
  if (openId !== null && openId !== undefined) {
    const delivered = await sendRuntimeMessage({type: 'buildToast', alert: alert});
    if (delivered) {
      try {
        chrome.windows.update(openId, {focused: true, drawAttention: true});
      } catch (error) {
        // The window may have been closed in the meantime.
      }
      return true;
    }
    await writeToastWindowId(null);
  }

  const parent = await getLastFocusedWindow();
  const createData = {
    url: toastUrl(alert),
    type: 'popup',
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    focused: true
  };

  if (parent && typeof parent.left === 'number' && typeof parent.width === 'number') {
    createData.left = Math.max(0, parent.left + parent.width - TOAST_WIDTH - TOAST_MARGIN);
    createData.top = Math.max(0, (parent.top || 0) + TOAST_MARGIN);
  }

  try {
    const win = await createWindow(createData);
    await writeToastWindowId(win && win.id);
    return true;
  } catch (error) {
    console.warn('Could not open the notification pop-up:', error.message);
    return false;
  }
}

export async function forgetToastWindow(windowId) {
  const openId = await readToastWindowId();
  if (openId === windowId) {
    await writeToastWindowId(null);
  }
}
