/**
 * Yet Another Jenkins Notifier
 * Copyright (C) 2016 Guillaume Girou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { init, Jobs, Notification, $rootScope } from './services.js';
import { showBuildToast } from './alerts.js';

init();

const urlsTextarea = document.querySelector('#urls');
const urlPattern = /^https?:\/\/.+/;

$rootScope.$on('Jobs::jobs.initialized', function (event, jobs) {
  showJobUrls(jobs);
  refreshHostAccessStatus();
});

NodeList.prototype.forEach = Array.prototype.forEach;

const refreshTimeInput = document.getElementById('refreshTime');
const refreshTimeSpan = document.getElementById('refreshTimeSpan');
const optionsStatusElement = document.getElementById('optionStatus');
const urlsStatusElement = document.getElementById('urlsStatus');
const shortcutInput = document.getElementById('addJobShortcut');
const resetShortcutButton = document.getElementById('resetShortcut');
const shortcutStatusElement = document.getElementById('shortcutStatus');
const notificationStatusElement = document.getElementById('notificationStatus');
const notificationHintElement = document.getElementById('notificationHint');
const notificationTestButton = document.getElementById('testNotification');
const notificationTestResultElement = document.getElementById('notificationTestResult');
const hostAccessStatusElement = document.getElementById('hostAccessStatus');
const grantHostAccessButton = document.getElementById('grantHostAccess');

const soundInput = document.getElementById('sound');
const popupWindowInput = document.getElementById('popupWindow');

const defaultOptions = {
  refreshTime: 60,
  notification: 'all',
  sound: true,
  popupWindow: true,
  addJobShortcut: {
    key: 'j',
    shiftKey: true,
    ctrlKey: false,
    altKey: false
  }
};

function showSavedNotification(statusElement) {
  statusElement.style.visibility = "";
  setTimeout(function () {
    statusElement.style.visibility = "hidden";
  }, 2000);
}

function validateUrls(urls) {
  const isValid = urls.every(url => url.trim() === '' || urlPattern.test(url.trim()));
  urlsTextarea.classList.toggle('invalid', !isValid);
  return isValid;
}

function showJobUrls(jobs) {
  urlsTextarea.value = Object.keys(jobs).join("\n");
}

// Format shortcut for display
function formatShortcut(shortcut) {
  const parts = [];
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}

// Handle shortcut input
function handleShortcutInput(e) {
  e.preventDefault();
  
  // Only allow certain modifier keys
  if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
    return;
  }

  // Only allow regular keys
  if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') {
    return;
  }

  const shortcut = {
    key: e.key.toLowerCase(),
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey
  };

  shortcutInput.value = formatShortcut(shortcut);
  saveShortcut(shortcut);
}

// Save shortcut to storage
function saveShortcut(shortcut) {
  chrome.storage.local.get({options: defaultOptions}, function(objects) {
    const options = objects.options;
    options.addJobShortcut = shortcut;
    
    chrome.storage.local.set({options: options}, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving shortcut:', chrome.runtime.lastError);
      } else {
        showSavedNotification(shortcutStatusElement);
      }
    });
  });
}

// Reset shortcut to default
function resetShortcut() {
  const defaultShortcut = defaultOptions.addJobShortcut;
  shortcutInput.value = formatShortcut(defaultShortcut);
  saveShortcut(defaultShortcut);
}


// --- System notifications ------------------------------------------------
//
// A notification is only useful when the operating system shows it, and that
// depends on settings outside of this extension. Report what is known and give
// the user a way to check the whole path end to end.

function setStatus(element, text, ok) {
  element.textContent = text;
  element.classList.toggle('status-ok', ok === true);
  element.classList.toggle('status-error', ok === false);
}

function describeLastError(health) {
  if (!health || !health.lastError) {
    return '';
  }
  const when = health.lastErrorAt ? new Date(health.lastErrorAt).toLocaleString() : '';
  return ' Last failure: ' + health.lastError + (when ? ' (' + when + ')' : '') + '.';
}

function refreshNotificationStatus() {
  Notification.getPermissionLevel().then(function (level) {
    chrome.storage.local.get({notificationHealth: {}}, function (objects) {
      const health = objects.notificationHealth || {};

      if (level === 'granted') {
        setStatus(
          notificationStatusElement,
          'The browser is allowed to show notifications.' + describeLastError(health),
          !health.lastError
        );
        notificationHintElement.classList.toggle('hidden', !health.lastError);
        notificationHintElement.textContent = health.lastError
          ? 'Notifications were refused by the browser. Send a test notification to check the current state.'
          : '';
      } else {
        setStatus(notificationStatusElement, 'Notifications are turned off for this browser.', false);
        notificationHintElement.classList.remove('hidden');
        notificationHintElement.textContent =
          'Allow notifications for your browser in the notification settings of the ' +
          'operating system, then send a test notification.';
      }
    });
  });
}

function sendTestNotification() {
  notificationTestResultElement.textContent = 'Sending...';
  notificationTestResultElement.classList.remove('status-ok', 'status-error');

  Notification.create('jenkins-test-' + Date.now(), {
    type: 'basic',
    title: 'Modern Jenkins Notifier',
    message: 'Test notification. If you can see this, build results will be shown the same way.',
    iconUrl: chrome.runtime.getURL('img/icon48.png'),
    soundKind: soundInput.checked ? 'default' : false
  }).then(function () {
    setStatus(notificationTestResultElement, 'Sent. Check your notification centre.', true);
    refreshNotificationStatus();
    // Check the same alerts a real build would produce.
    if (popupWindowInput.checked) {
      showBuildToast({
        title: 'Test notification',
        job: 'Modern Jenkins Notifier',
        message: 'This is how a build result will appear.',
        status: 'Success',
        url: '',
        note: 'Nothing was built, this is only a check.'
      });
    }
  }).catch(function (error) {
    setStatus(notificationTestResultElement, 'Failed: ' + error.message, false);
    refreshNotificationStatus();
  });
}

// --- Access to Jenkins servers -------------------------------------------
//
// Without access to the server origin the status requests fail, no build change
// is ever detected and no notification is ever produced.

function jobOrigins() {
  const origins = new Set();
  Object.keys(Jobs.jobs || {}).forEach(function (url) {
    try {
      origins.add(new URL(url).origin + '/*');
    } catch (error) {
      console.warn('Ignoring invalid job url:', url);
    }
  });
  return Array.from(origins);
}

function refreshHostAccessStatus() {
  const origins = jobOrigins();

  if (!origins.length) {
    setStatus(hostAccessStatusElement, 'No Jenkins server configured yet.');
    grantHostAccessButton.disabled = true;
    return;
  }

  chrome.permissions.contains({origins: origins}, function (granted) {
    if (chrome.runtime.lastError) {
      setStatus(hostAccessStatusElement, 'Could not read the granted permissions.', false);
      return;
    }
    grantHostAccessButton.disabled = granted;
    setStatus(
      hostAccessStatusElement,
      granted
        ? 'Access granted for: ' + origins.join(', ')
        : 'Access is missing for: ' + origins.join(', '),
      granted
    );
  });
}

function grantHostAccess() {
  const origins = jobOrigins();
  if (!origins.length) {
    return;
  }

  chrome.permissions.request({origins: origins}, function (granted) {
    if (chrome.runtime.lastError) {
      setStatus(hostAccessStatusElement, 'Request failed: ' + chrome.runtime.lastError.message, false);
      return;
    }
    refreshHostAccessStatus();
    if (granted) {
      Jobs.updateAllStatus();
    }
  });
}

// Saves options to chrome.storage.local.
function saveOptions() {
  const options = {
    refreshTime: refreshTimeInput.value,
    notification: document.querySelector('[name=notification]:checked').value,
    sound: soundInput.checked,
    popupWindow: popupWindowInput.checked
  };
  
  chrome.storage.local.get({options: defaultOptions}, function(objects) {
    options.addJobShortcut = objects.options.addJobShortcut;
    
    chrome.storage.local.set({options: options}, function () {
      if (chrome.runtime.lastError) {
        console.error('Error saving options:', chrome.runtime.lastError);
      } else {
        showSavedNotification(optionsStatusElement);
      }
    });
  });
}

// Saves urls to chrome.storage.local.
function saveUrls() {
  const value = urlsTextarea.value.trim();
  const newUrls = value ? value.replace(/[\r\n]+/g, "\n").split("\n") : [];
  
  if (!validateUrls(newUrls)) {
    return;
  }

  Jobs.setUrls(newUrls)
    .then(showJobUrls)
    .then(() => {
      showSavedNotification(urlsStatusElement);
      // The click is a user gesture, so the origins of the freshly saved urls
      // can be requested right away.
      grantHostAccess();
    })
    .catch(error => {
      console.error('Error saving URLs:', error);
      urlsStatusElement.textContent = 'Error saving URLs: ' + error.message;
      urlsStatusElement.style.color = '#d9534f';
      urlsStatusElement.style.visibility = '';
    });
}

// Restores the preferences stored in chrome.storage.
function restoreOptions() {
  chrome.storage.local.get({options: defaultOptions}, function (objects) {
    if (chrome.runtime.lastError) {
      console.error('Error restoring options:', chrome.runtime.lastError);
      return;
    }
    
    const options = objects.options;
    document.querySelector('[name=notification]:checked').checked = false;
    document.querySelector('[name=notification][value="' + options.notification + '"]').checked = true;
    refreshTimeSpan.textContent = refreshTimeInput.value = options.refreshTime;
    // Options stored before these settings existed default to enabled.
    soundInput.checked = options.sound !== false;
    popupWindowInput.checked = options.popupWindow !== false;
    
    // Restore shortcut
    if (options.addJobShortcut) {
      shortcutInput.value = formatShortcut(options.addJobShortcut);
    }
  });
}

function updateRefreshTimeSpan() {
  refreshTimeSpan.textContent = refreshTimeInput.value;
}

// URL validation on input
urlsTextarea.addEventListener('input', function() {
  const urls = this.value.trim().split('\n');
  validateUrls(urls);
});

// Shortcut input handling
shortcutInput.addEventListener('keydown', handleShortcutInput);
shortcutInput.addEventListener('click', function() {
  this.value = 'Press keys...';
});

// Reset shortcut button
resetShortcutButton.addEventListener('click', resetShortcut);

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  refreshNotificationStatus();
  refreshHostAccessStatus();
});

notificationTestButton.addEventListener('click', sendTestNotification);
grantHostAccessButton.addEventListener('click', grantHostAccess);

document.querySelectorAll('input[type=radio], input[type=checkbox], #refreshTime').forEach(function (element) {
  element.addEventListener('change', saveOptions);
});

document.querySelector('#saveUrls').addEventListener('click', saveUrls);
refreshTimeInput.addEventListener('input', updateRefreshTimeSpan);
