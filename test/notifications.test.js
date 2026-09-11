/**
 * Tests for system notification delivery and one-time job watches.
 */

import { Notification, Jobs, buildNotifier, $rootScope } from '../js/services.js';

const RICH_KEYS = ['requireInteraction', 'silent', 'priority'];

// jsdom timers are stubbed in the test setup, so pending work is drained
// through the microtask queue instead of a timeout.
async function flushPromises() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

function chromeLikeCreate() {
  return jest.fn((id, options, callback) => callback(id));
}

// Firefox rejects options it does not know about, and it throws synchronously.
function firefoxLikeCreate() {
  return jest.fn((id, options, callback) => {
    const unsupported = RICH_KEYS.find(key => key in options);
    if (unsupported) {
      throw new TypeError(`Type error for parameter options: Unexpected property "${unsupported}"`);
    }
    callback(id);
  });
}

describe('System notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.notifications.clear = jest.fn((id, callback) => callback(true));
    chrome.storage.local.set = jest.fn((data, callback) => {
      if (callback) callback();
    });
  });

  test('sends the rich option set when the browser accepts it', async () => {
    chrome.notifications.create = chromeLikeCreate();

    await Notification.create('jenkins-1', {
      type: 'basic',
      title: 'Build Success!',
      message: 'http://jenkins/job/test/1',
      iconUrl: 'icon.png'
    });

    const options = chrome.notifications.create.mock.calls[0][1];
    expect(options.requireInteraction).toBe(true);
    expect(options.silent).toBe(false);
    expect(options.priority).toBe(2);
  });

  test('retries without the unsupported options instead of dropping the notification', async () => {
    chrome.notifications.create = firefoxLikeCreate();

    const id = await Notification.create('jenkins-2', {
      type: 'basic',
      title: 'Build Failure!',
      message: 'http://jenkins/job/test/2',
      iconUrl: 'icon.png'
    });

    expect(id).toBe('jenkins-2');
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    const retried = chrome.notifications.create.mock.calls[1][1];
    RICH_KEYS.forEach(key => expect(retried[key]).toBeUndefined());
    expect(retried.title).toBe('Build Failure!');
  });

  test('clears a notification with the same id before showing it again', async () => {
    chrome.notifications.create = chromeLikeCreate();

    await Notification.create('jenkins-3', {title: 'Build Success!', message: 'http://jenkins/'});

    expect(chrome.notifications.clear).toHaveBeenCalledWith('jenkins-3', expect.any(Function));
  });

  test('reports the failure reason when the notification cannot be shown', async () => {
    chrome.notifications.create = jest.fn((id, options, callback) => {
      chrome.runtime.lastError = {message: 'Notifications are blocked'};
      callback();
    });

    await expect(
      Notification.create('jenkins-4', {title: 'Build Failure!', message: 'http://jenkins/'})
    ).rejects.toThrow('Notifications are blocked');

    chrome.runtime.lastError = null;
  });
});

describe('One-time job watch', () => {
  const url = 'http://jenkins/job/one-shot/';

  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.notifications.create = chromeLikeCreate();
    chrome.notifications.clear = jest.fn((id, callback) => callback(true));
    chrome.storage.local.set = jest.fn((data, callback) => {
      if (callback) callback();
    });
    Jobs.jobs = {};
    $rootScope.options = {refreshTime: 60, notification: 'all'};
  });

  function statusChange(temporary) {
    return Promise.resolve({
      url: url,
      oldValue: {name: 'one-shot', url: url, status: 'Success', lastBuildNumber: 41},
      newValue: {name: 'one-shot', url: url, status: 'Failure', lastBuildNumber: 42, temporary: temporary}
    });
  }

  test('keeps the flag when a status refresh replaces the job data', async () => {
    await Jobs.add(url, null, {temporary: true});
    await Jobs.add(url, {name: 'one-shot', url: url, status: 'Success', lastBuildNumber: 42});

    expect(Jobs.jobs[url].temporary).toBe(true);
  });

  test('notifies even when notifications are globally turned off', async () => {
    $rootScope.options.notification = 'none';
    await Jobs.add(url, null, {temporary: true});

    buildNotifier([statusChange(true)]);
    await flushPromises();

    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
    const options = chrome.notifications.create.mock.calls[0][1];
    expect(options.contextMessage).toContain('One-time watch');
  });

  test('stops watching the job once it has been reported', async () => {
    await Jobs.add(url, null, {temporary: true});

    buildNotifier([statusChange(true)]);
    await flushPromises();

    expect(Jobs.jobs[url]).toBeUndefined();
  });

  test('leaves regular jobs silent when notifications are turned off', async () => {
    $rootScope.options.notification = 'none';
    await Jobs.add(url);

    buildNotifier([statusChange(false)]);
    await flushPromises();

    expect(chrome.notifications.create).not.toHaveBeenCalled();
    expect(Jobs.jobs[url]).toBeDefined();
  });

  test('keeps watching a job that has no temporary flag', async () => {
    await Jobs.add(url);

    buildNotifier([statusChange(false)]);
    await flushPromises();

    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
    expect(Jobs.jobs[url]).toBeDefined();
  });
});
