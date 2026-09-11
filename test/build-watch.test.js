/**
 * Watching one specific build until it finishes.
 */

import { BuildWatches, buildWatchNotifier, buildUrlParts, $rootScope } from '../js/services.js';

async function flushPromises() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

const BUILD_URL = 'http://jenkins/job/payments/42/';

function finished(status) {
  return {
    url: BUILD_URL,
    name: 'payments #42',
    number: 42,
    building: false,
    status: status,
    statusClass: status === 'Success' ? 'success' : 'danger'
  };
}

describe('Build url parsing', () => {
  test('reads the job and the build number', () => {
    expect(buildUrlParts('http://jenkins/job/payments/42/')).toEqual({
      jobUrl: 'http://jenkins/job/payments/',
      number: 42,
      url: 'http://jenkins/job/payments/42/'
    });
  });

  test('accepts a url without a trailing slash and with a query', () => {
    expect(buildUrlParts('http://jenkins/job/a/job/main/7?x=1').number).toBe(7);
  });

  test('rejects a job page', () => {
    expect(buildUrlParts('http://jenkins/job/payments/')).toBeNull();
  });
});

describe('Watched builds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.notifications.create = jest.fn((id, options, callback) => callback(id));
    chrome.notifications.clear = jest.fn((id, callback) => callback(true));
    chrome.storage.local.set = jest.fn((data, callback) => {
      if (callback) callback();
    });
    BuildWatches.builds = {};
    $rootScope.options = {refreshTime: 60, notification: 'all', sound: true, popupWindow: true};
  });

  test('stores a build and drops it again', async () => {
    await BuildWatches.add(BUILD_URL);
    expect(BuildWatches.builds[BUILD_URL].number).toBe(42);

    await BuildWatches.remove(BUILD_URL);
    expect(BuildWatches.builds[BUILD_URL]).toBeUndefined();
  });

  test('refuses a url that is not a build', async () => {
    await expect(BuildWatches.add('http://jenkins/job/payments/')).rejects.toThrow('not a Jenkins build url');
  });

  test('reports a finished build and stops watching it', async () => {
    await BuildWatches.add(BUILD_URL);

    buildWatchNotifier([Promise.resolve({
      url: BUILD_URL,
      oldValue: BuildWatches.builds[BUILD_URL],
      newValue: finished('Failure')
    })]);
    await flushPromises();

    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
    const options = chrome.notifications.create.mock.calls[0][1];
    expect(options.title).toContain('Build Failure!');
    expect(options.message).toBe(BUILD_URL);
    expect(BuildWatches.builds[BUILD_URL]).toBeUndefined();
  });

  test('keeps waiting while the build is still running', async () => {
    await BuildWatches.add(BUILD_URL);

    buildWatchNotifier([Promise.resolve({
      url: BUILD_URL,
      oldValue: BuildWatches.builds[BUILD_URL],
      newValue: {url: BUILD_URL, name: 'payments #42', building: true, status: 'Building'}
    })]);
    await flushPromises();

    expect(chrome.notifications.create).not.toHaveBeenCalled();
    expect(BuildWatches.builds[BUILD_URL]).toBeDefined();
  });

  test('keeps waiting when the server cannot be reached', async () => {
    await BuildWatches.add(BUILD_URL);

    buildWatchNotifier([Promise.resolve({
      url: BUILD_URL,
      oldValue: BuildWatches.builds[BUILD_URL],
      newValue: Object.assign(finished('Success'), {error: 'Unreachable'})
    })]);
    await flushPromises();

    expect(chrome.notifications.create).not.toHaveBeenCalled();
    expect(BuildWatches.builds[BUILD_URL]).toBeDefined();
  });
});
