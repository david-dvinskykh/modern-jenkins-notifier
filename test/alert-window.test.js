/**
 * The pop-up window shown when a build finishes.
 */

import { showBuildToast, soundKindForStatus, forgetToastWindow } from '../js/alerts.js';

describe('Build pop-up window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.windows.create = jest.fn((createData, callback) => callback({id: 7}));
    chrome.windows.getLastFocused = jest.fn((options, callback) =>
      callback({id: 2, left: 100, top: 50, width: 1200, height: 800}));
  });

  test('opens a pop-up window next to the browser window', async () => {
    const opened = await showBuildToast({
      title: 'Build Failure!',
      job: 'my-job',
      message: 'http://jenkins/job/my-job/42',
      status: 'Failure',
      url: 'http://jenkins/job/my-job/42'
    });

    expect(opened).toBe(true);
    const createData = chrome.windows.create.mock.calls[0][0];
    expect(createData.type).toBe('popup');
    expect(createData.focused).toBe(true);
    expect(createData.url).toContain('toast.html');
    expect(createData.url).toContain('status=Failure');
    expect(createData.url).toContain('job=my-job');
    // Top right corner of the 1200px wide window at left 100.
    expect(createData.left).toBe(100 + 1200 - 380 - 24);
    expect(createData.top).toBe(50 + 24);
  });

  test('reports the failure instead of throwing when the window cannot open', async () => {
    chrome.windows.create = jest.fn((createData, callback) => {
      chrome.runtime.lastError = {message: 'No window available'};
      callback();
    });

    await expect(showBuildToast({title: 'Build Success!'})).resolves.toBe(false);
    chrome.runtime.lastError = null;
  });

  test('picks the sound by build status', () => {
    expect(soundKindForStatus('Failure')).toBe('error');
    expect(soundKindForStatus('Unstable')).toBe('error');
    expect(soundKindForStatus('Aborted')).toBe('error');
    expect(soundKindForStatus('Success')).toBe('default');
    expect(soundKindForStatus(undefined)).toBe('default');
  });

  test('forgetting a window id works without session storage', async () => {
    await expect(forgetToastWindow(7)).resolves.toBeUndefined();
  });
});
