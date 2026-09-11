/**
 * The pop-up window shown when a build finishes.
 *
 * System notifications are often delivered without a banner, so this window is
 * the part of the alert that is guaranteed to appear on screen. It closes on its
 * own, and a click opens the build.
 */

const LIFETIME_MS = 10000;

const STATUS_COLORS = {
  Success: '#3fa45b',
  Failure: '#c9302c',
  Unstable: '#e0a30c',
  Aborted: '#8a8a8f',
  Disabled: '#8a8a8f'
};

const elements = {
  accent: document.getElementById('accent'),
  status: document.getElementById('status'),
  job: document.getElementById('job'),
  url: document.getElementById('url'),
  note: document.getElementById('note'),
  count: document.getElementById('count'),
  bar: document.getElementById('bar')
};

let buildUrl = '';
let deadline = 0;
let queued = 0;
let ticker = null;

function accentFor(status) {
  return STATUS_COLORS[status] || '#337ab7';
}

function render(alert) {
  buildUrl = alert.url || '';
  const accent = accentFor(alert.status);
  document.documentElement.style.setProperty('--accent', accent);

  elements.status.textContent = alert.title || 'Build';
  elements.job.textContent = alert.job || '';
  elements.url.textContent = alert.message || buildUrl;
  elements.note.textContent = alert.note || '';
  elements.count.textContent = queued > 0 ? '+' + queued + ' more' : '';
  document.title = alert.title || 'Jenkins build';
}

function restartCountdown() {
  deadline = Date.now() + LIFETIME_MS;
  if (ticker) {
    return;
  }
  ticker = setInterval(() => {
    const left = deadline - Date.now();
    elements.bar.style.width = Math.max(0, (left / LIFETIME_MS) * 100) + '%';
    if (left <= 0) {
      window.close();
    }
  }, 250);
}

function readFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    title: params.get('title') || 'Build',
    message: params.get('message') || '',
    status: params.get('status') || '',
    url: params.get('url') || '',
    note: params.get('note') || '',
    job: params.get('job') || ''
  };
}

const extensionApi = typeof chrome !== 'undefined' ? chrome : null;

document.addEventListener('click', () => {
  if (buildUrl && extensionApi && extensionApi.tabs) {
    extensionApi.tabs.create({url: buildUrl});
  }
  window.close();
});

// Another job finished while this window was open.
if (extensionApi && extensionApi.runtime && extensionApi.runtime.onMessage) {
  extensionApi.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'buildToast') {
      return false;
    }
    queued++;
    render(message.alert || {});
    restartCountdown();
    return false;
  });
}

render(readFromLocation());
restartCountdown();
