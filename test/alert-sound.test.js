/**
 * The sound that goes with a notification.
 */

jest.mock('../js/alerts.js', () => ({
  playNotificationSound: jest.fn(() => Promise.resolve(true)),
  showBuildToast: jest.fn(() => Promise.resolve(true)),
  forgetToastWindow: jest.fn(() => Promise.resolve()),
  soundKindForStatus: (status) =>
    status === 'Failure' || status === 'Unstable' || status === 'Aborted' ? 'error' : 'default'
}));

import { Notification, buildNotifier, Jobs, $rootScope } from '../js/services.js';
import { playNotificationSound } from '../js/alerts.js';

async function flushPromises() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

describe('Notification sound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.notifications.create = jest.fn((id, options, callback) => callback(id));
    chrome.notifications.clear = jest.fn((id, callback) => callback(true));
    chrome.storage.local.set = jest.fn((data, callback) => {
      if (callback) callback();
    });
    Jobs.jobs = {};
    $rootScope.options = {refreshTime: 60, notification: 'all', sound: true, popupWindow: true};
  });

  test('plays a sound for every notification', async () => {
    await Notification.create('jenkins-1', {title: 'Build Success!', message: 'http://jenkins/'});

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  test('stays silent when the sound is switched off', async () => {
    $rootScope.options.sound = false;

    await Notification.create('jenkins-2', {title: 'Build Success!', message: 'http://jenkins/'});

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  test('stays silent for a notification that asks for no sound', async () => {
    await Notification.create('jenkins-3', {
      title: 'Build Success!',
      message: 'http://jenkins/',
      soundKind: false
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  test('uses the sombre sound for a failed build', async () => {
    buildNotifier([Promise.resolve({
      url: 'http://jenkins/job/a/',
      oldValue: {lastBuildNumber: 1, status: 'Success'},
      newValue: {name: 'a', url: 'http://jenkins/job/a/', status: 'Failure', lastBuildNumber: 2}
    })]);
    await flushPromises();

    expect(playNotificationSound).toHaveBeenCalledWith('error');
  });

  test('uses the plain sound for a successful build', async () => {
    buildNotifier([Promise.resolve({
      url: 'http://jenkins/job/a/',
      oldValue: {lastBuildNumber: 1, status: 'Failure'},
      newValue: {name: 'a', url: 'http://jenkins/job/a/', status: 'Success', lastBuildNumber: 2}
    })]);
    await flushPromises();

    expect(playNotificationSound).toHaveBeenCalledWith('default');
  });
});
