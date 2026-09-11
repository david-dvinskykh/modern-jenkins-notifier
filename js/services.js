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

// Utility functions
export const _ = {
  forEach: function (obj, iterator) {
    if (obj) {
      if (obj.forEach) {
        obj.forEach(iterator);
      } else if ('length' in obj && obj.length > 0) {
        for (var i = 0; i < obj.length; i++) {
          iterator(obj[i], i);
        }
      } else {
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            iterator(obj[key], key);
          }
        }
      }
    }
    return obj;
  },
  clone: function (obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

// Promise-like implementation
export const $q = {
  defer: function () {
    var defer = {};
    defer.promise = new Promise(function (resolve, reject) {
      defer.resolve = resolve;
      defer.reject = reject;
    });
    return defer;
  },
  when: function (value) {
    return Promise.resolve(value);
  },
  all: function (iterable) {
    return Promise.all(iterable);
  }
};

// Event system
const eventListeners = new Map();

export const $rootScope = {
  $broadcast: function (name, detail) {
    const listeners = eventListeners.get(name) || [];
    listeners.forEach(callback => {
      try {
        callback(null, detail);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  },
  $on: function (name, callback) {
    if (!eventListeners.has(name)) {
      eventListeners.set(name, []);
    }
    eventListeners.get(name).push(callback);
  }
};

// Storage Service
function StorageService($q) {
  const storage = chrome.storage.local;

  function promisedCallback(deferred) {
    return function (data) {
      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      } else {
        deferred.resolve(data);
      }
    };
  }

  return {
    onChanged: chrome.storage.onChanged,
    get: function (keys) {
      var deferred = $q.defer();
      storage.get(keys, promisedCallback(deferred));
      return deferred.promise;
    },
    set: function (objects) {
      var deferred = $q.defer();
      storage.set(objects, promisedCallback(deferred));
      return deferred.promise;
    }
  };
}

// Notification Service
//
// Notifications must reach the operating system notification centre, so every
// failure mode of chrome.notifications is handled explicitly here:
//
//  - Chrome and Firefox accept different option sets. Firefox rejects the whole
//    call when it sees an option it does not know (requireInteraction, silent,
//    priority), which used to silently disable every notification there. The
//    rich option set is tried once and the browser is downgraded to the plain
//    one as soon as it is refused.
//  - When chrome.notifications is unusable, the service worker registration is
//    used as a last resort: showNotification goes through the same OS channel.
//  - The outcome of the last attempt is persisted so the options page can tell
//    the user whether notifications actually reach the system.
const NOTIFICATION_HEALTH_KEY = 'notificationHealth';

function NotificationService($q) {
  var BASE_OPTION_KEYS = ['type', 'title', 'message', 'contextMessage', 'iconUrl'];
  var RICH_OPTIONS = {requireInteraction: true, silent: false, priority: 2};
  var richOptionsSupported = true;

  function baseOptions(options) {
    var result = {};
    BASE_OPTION_KEYS.forEach(function (key) {
      if (options[key] !== undefined) {
        result[key] = options[key];
      }
    });
    result.type = result.type || 'basic';
    return result;
  }

  function saveHealth(patch) {
    try {
      chrome.storage.local.get({[NOTIFICATION_HEALTH_KEY]: {}}, function (objects) {
        if (chrome.runtime.lastError) {
          return;
        }
        var health = Object.assign({}, objects[NOTIFICATION_HEALTH_KEY], patch);
        chrome.storage.local.set({[NOTIFICATION_HEALTH_KEY]: health});
      });
    } catch (error) {
      console.error('Failed to record notification health:', error);
    }
  }

  function clear(notificationId) {
    return new Promise(function (resolve) {
      try {
        chrome.notifications.clear(notificationId, function () {
          // lastError is meaningless here: an unknown id is not a failure.
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (error) {
        resolve();
      }
    });
  }

  function createOnce(notificationId, options) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.notifications.create(notificationId, options, function (id) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!id) {
            reject(new Error('Notification was not created'));
          } else {
            resolve(id);
          }
        });
      } catch (error) {
        // Firefox throws synchronously on an unknown option.
        reject(error);
      }
    });
  }

  function createViaServiceWorker(options) {
    if (typeof self === 'undefined' || !self.registration || !self.registration.showNotification) {
      return Promise.reject(new Error('No service worker registration available'));
    }
    return self.registration.showNotification(options.title, {
      body: options.message,
      icon: options.iconUrl,
      requireInteraction: true
    }).then(function () {
      return 'service-worker-notification';
    });
  }

  function getPermissionLevel() {
    return new Promise(function (resolve) {
      if (!chrome.notifications || !chrome.notifications.getPermissionLevel) {
        resolve('granted');
        return;
      }
      try {
        chrome.notifications.getPermissionLevel(function (level) {
          void chrome.runtime.lastError;
          resolve(level || 'granted');
        });
      } catch (error) {
        resolve('granted');
      }
    });
  }

  return {
    getPermissionLevel: getPermissionLevel,
    create: async function (notificationId, options) {
      var plain = baseOptions(options);
      // Replacing a notification that is still on screen does not always
      // re-alert the user, so drop the previous one with the same id first.
      await clear(notificationId);

      if (richOptionsSupported) {
        try {
          var id = await createOnce(notificationId, Object.assign({}, plain, RICH_OPTIONS));
          saveHealth({lastSuccessAt: Date.now(), lastError: null});
          return id;
        } catch (error) {
          richOptionsSupported = false;
          console.warn('Rich notification options rejected, falling back:', error.message);
        }
      }

      try {
        var plainId = await createOnce(notificationId, plain);
        saveHealth({lastSuccessAt: Date.now(), lastError: null});
        return plainId;
      } catch (error) {
        console.warn('chrome.notifications failed, trying the service worker:', error.message);
        try {
          var swId = await createViaServiceWorker(plain);
          saveHealth({lastSuccessAt: Date.now(), lastError: null});
          return swId;
        } catch (fallbackError) {
          saveHealth({lastError: error.message, lastErrorAt: Date.now()});
          throw error;
        }
      }
    }
  };
}

// Create service instances
export const Storage = StorageService($q);
export const Notification = NotificationService($q);

// Job Data Service
function defaultJobDataService() {
  return function (url, status) {
    var jobNameRegExp = /.*\/job\/([^/]+)(\/.*|$)/;
    return {
      name: decodeURI(url.replace(jobNameRegExp, '$1')),
      url: decodeURI(url),
      building: false,
      status: status || '',
      statusClass: undefined,
      statusIcon: undefined,
      lastBuildNumber: undefined,
      error: undefined,
      temporary: false,
      jobs: undefined
    };
  };
}

// Jenkins Service
function jenkinsService(defaultJobData) {
  var buildingRegExp = /_anime$/;
  var colorToClass = {
    blue: 'success', yellow: 'warning', red: 'danger'
  };
  var colorToIcon = {
    blue: 'green', yellow: 'yellow', red: 'red'
  };
  var status = {
    blue: 'Success',
    yellow: 'Unstable',
    red: 'Failure',
    aborted: 'Aborted',
    notbuilt: 'Not built',
    disabled: 'Disabled'
  };
  var fetchOptions = {
    credentials: 'include'
  };

  function jobMapping(url, data) {
    var basicColor = (data.color || '').replace(buildingRegExp, '');
    var lastBuild = data.lastCompletedBuild || {};
    return {
      name: data.displayName || data.name || data.nodeName || 'All jobs',
      url: decodeURI(data.url || url),
      building: buildingRegExp.test(data.color),
      status: status[basicColor] || basicColor,
      statusClass: colorToClass[basicColor] || '',
      statusIcon: colorToIcon[basicColor] || 'grey',
      lastBuildNumber: lastBuild.number || '',
      lastBuildTime: '',
      jobs: data.jobs && data.jobs.reduce(function (jobs, data) {
        var job = jobMapping(null, data);
        jobs[subJobKey(job.url)] = job;
        return jobs;
      }, {})
    };
  }

  function subJobKey(url) {
    return url.replace(/^.+?\/job\/(.+)\/$/, "$1").replace(/\/job\//g, "/");
  }

  function parseXML(xmlText) {
    // Check if we're in a service worker context
    if (typeof DOMParser === 'undefined') {
      // Simple regex-based parser for service worker context
      const projects = [];
      const regex = /<Project[^>]*webUrl="([^"]*)"[^>]*lastBuildLabel="([^"]*)"[^>]*lastBuildTime="([^"]*)"[^>]*>/g;
      let match;
      
      while ((match = regex.exec(xmlText)) !== null) {
        projects.push({
          attributes: {
            webUrl: { value: match[1] },
            lastBuildLabel: { value: match[2] },
            lastBuildTime: { value: match[3] }
          }
        });
      }
      
      return projects;
    } else {
      // Browser context with DOMParser available
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      return Array.from(doc.getElementsByTagName('Project'));
    }
  }

  return function (url) {
    url = url.charAt(url.length - 1) === '/' ? url : url + '/';

    return fetch(url + 'api/json/', fetchOptions).then(function (res) {
      return res.ok ? res.json() : Promise.reject(res);
    }).then(function (data) {
      var job = jobMapping(url, data);

      if (data.jobs) {
        return fetch(url + 'cc.xml', fetchOptions).then(function (res) {
          return res.ok ? res.text() : Promise.reject(res);
        }).then(function (text) {
          var projects = parseXML(text);

          _.forEach(projects, function (project) {
            var url = decodeURI(project.attributes['webUrl'].value);
            var name = subJobKey(url);
            var lastBuildNumber = project.attributes['lastBuildLabel'].value;
            var lastBuildTime = new Date(project.attributes['lastBuildTime'].value).toISOString();

            var subJob = job.jobs[name];
            if (subJob && !subJob.lastBuildNumber) {
              subJob.name = name;
              subJob.lastBuildNumber = lastBuildNumber;
              subJob.lastBuildTime = lastBuildTime;
            }
          });

          return job;
        });
      } else {
        return job;
      }
    });
  };
}

// Jobs Service
function JobsService($q, Storage, jenkins, defaultJobData) {
  var Jobs = {
    jobs: {},
    add: function (url, data, jobOptions) {
      var result = {};
      var previous = Jobs.jobs[url];
      result.oldValue = previous;

      var value = data || previous || defaultJobData(url);
      // A status refresh builds a brand new object from the Jenkins response,
      // so the one-time watch flag has to be carried over explicitly.
      if (jobOptions && jobOptions.temporary !== undefined) {
        value.temporary = !!jobOptions.temporary;
      } else if (value.temporary === undefined) {
        value.temporary = !!(previous && previous.temporary);
      }

      result.newValue = Jobs.jobs[url] = value;
      result.url = url;
      return Storage.set({jobs: Jobs.jobs}).then(function () {
        return result;
      });
    },
    setTemporary: function (url, temporary) {
      var job = Jobs.jobs[url];
      if (!job) {
        return $q.when(undefined);
      }
      job.temporary = !!temporary;
      return Storage.set({jobs: Jobs.jobs}).then(function () {
        return job;
      });
    },
    remove: function (url) {
      delete Jobs.jobs[url];
      return Storage.set({jobs: Jobs.jobs});
    },
    setUrls: function (urls) {
      var newJobs = {};
      urls.forEach(function (url) {
        newJobs[url] = Jobs.jobs[url] || defaultJobData(url);
      });
      Jobs.jobs = newJobs;

      return Storage.set({jobs: Jobs.jobs}).then(function () {
        return Jobs.jobs;
      });
    },
    updateStatus: function (url) {
      return jenkins(url).catch(function (res) {
        // On error, keep existing data or create default one
        var data = _.clone(Jobs.jobs[url]) || defaultJobData(url);
        data.error = (res instanceof Error ? res.message : res.statusText) || 'Unreachable';
        return data;
      }).then(function (data) {
        return Jobs.add(url, data);
      });
    },
    updateAllStatus: function () {
      var promises = [];
      _.forEach(Jobs.jobs, function (_, url) {
        promises.push(Jobs.updateStatus(url));
      });
      return $q.when(promises);
    }
  };

  return Jobs;
}

// Build Watcher Service
function buildWatcherService($rootScope, Jobs, buildNotifier) {
  let currentInterval = null;

  // Timers do not survive the suspension of a Manifest V3 service worker, so
  // there the polling is driven by chrome.alarms from the background script.
  var isServiceWorker = typeof window === 'undefined';

  function hasTemporaryWatch() {
    var found = false;
    _.forEach(Jobs.jobs, function (job) {
      if (job && job.temporary) {
        found = true;
      }
    });
    return found;
  }

  function runUpdateAndNotify(options) {
    if (isServiceWorker) {
      return null;
    }

    // A one-time watch keeps polling even when global notifications are off.
    if (options.notification === 'none' && !hasTemporaryWatch()) {
      return null;
    }

    return setInterval(function () {
      Jobs.updateAllStatus().then(buildNotifier);
    }, options.refreshTime * 1000);
  }

  return function () {
    function restart(options) {
      if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
      }
      currentInterval = runUpdateAndNotify(options);
    }

    currentInterval = runUpdateAndNotify($rootScope.options);

    $rootScope.$on('Options::options.changed', function (_, options) {
      restart(options);
    });

    // Adding or dropping a one-time watch changes whether polling is needed.
    $rootScope.$on('Jobs::jobs.changed', function () {
      if ($rootScope.options.notification === 'none') {
        restart($rootScope.options);
      }
    });
  };
}

// Build Notifier Service
function buildNotifierService($rootScope, Notification, Jobs) {
  async function jobNotifier(newValue, oldValue, watch) {
    watch = watch || {};
    oldValue = oldValue || {};
    if (oldValue.lastBuildNumber == newValue.lastBuildNumber) {
      return;
    }

    // Ignore new job, not built yet
    if (newValue.status === 'Not built') {
      return;
    }

    var title = 'Build ' + newValue.status + '!';
    // A temporary watch reports the next result whatever it is: filtering it
    // would defeat the point of watching a single job on purpose.
    if (!watch.temporary && $rootScope.options.notification === 'unstable' &&
        newValue.status === 'Success' && newValue.lastBuildNumber > 1) {
      if (oldValue.status === 'Success') {
        return;
      } else {
        title = 'Build back to stable!';
      }
    }

    var buildUrl = newValue.url + newValue.lastBuildNumber;

    try {
      const notificationId = 'jenkins-' + buildUrl;
      const iconPath = 'img/icon48.png';

      const options = {
        type: 'basic',
        title: title + ' - ' + newValue.name,
        message: buildUrl,
        iconUrl: chrome.runtime.getURL(iconPath)
      };

      if (watch.temporary) {
        options.contextMessage = 'One-time watch: monitoring of this job stops now.';
      }

      await Notification.create(notificationId, options);

      if (watch.temporary && watch.url && Jobs) {
        await Jobs.remove(watch.url);
      }
    } catch (error) {
      console.error('Failed to create notification:', error, error.stack);
    }
  }

  return function (promises) {
    if (!Array.isArray(promises)) {
      promises = [promises];
    }

    promises.forEach(function (promise) {
      if (promise && typeof promise.then === 'function') {
        promise.then(function (data) {
          var oldValue = data.oldValue;
          var newValue = data.newValue;
          var watch = {
            temporary: !!(newValue && newValue.temporary),
            url: data.url || (newValue && newValue.url)
          };

          // Disable notification for pending promises, except for jobs the
          // user explicitly asked to be notified about one time.
          if ($rootScope.options.notification === 'none' && !watch.temporary) {
            return;
          }

          if (newValue.jobs) {
            _.forEach(newValue.jobs, function (job, url) {
              jobNotifier(job, oldValue && oldValue.jobs && oldValue.jobs[url], watch);
            });
          } else {
            jobNotifier(newValue, oldValue, watch);
          }
        }).catch(function(error) {
          console.error('Error processing notification:', error);
        });
      } else {
        console.warn('Invalid promise object:', promise);
      }
    });
  };
}

// Initialize options and jobs
function initOptions($rootScope, Storage) {
  $rootScope.options = {
    refreshTime: 60,
    notification: 'all'
  };

  // Add storage change listener during initialization
  Storage.onChanged.addListener(function (objects) {
    if (objects.options) {
      $rootScope.options = objects.options.newValue;
      $rootScope.$broadcast('Options::options.changed', $rootScope.options);
    }
  });

  return Storage.get({options: $rootScope.options}).then(function (objects) {
    $rootScope.options = objects.options;
    $rootScope.$broadcast('Options::options.changed', $rootScope.options);
  });
}

function initJobs(Jobs, Storage, $rootScope) {
  Jobs.jobs = {};

  // Add storage change listener during initialization
  Storage.onChanged.addListener(function (objects) {
    if (objects.jobs) {
      Jobs.jobs = objects.jobs.newValue;
      $rootScope.$broadcast('Jobs::jobs.changed', Jobs.jobs);
    }
  });

  return Storage.get({jobs: Jobs.jobs}).then(function (objects) {
    Jobs.jobs = objects.jobs;
    $rootScope.$broadcast('Jobs::jobs.initialized', Jobs.jobs);
    $rootScope.$broadcast('Jobs::jobs.changed', Jobs.jobs);
  });
}

// Create service instances
export const defaultJobData = defaultJobDataService();
export const jenkins = jenkinsService(defaultJobData);
export const Jobs = JobsService($q, Storage, jenkins, defaultJobData);
export const buildNotifier = buildNotifierService($rootScope, Notification, Jobs);
export const buildWatcher = buildWatcherService($rootScope, Jobs, buildNotifier);

// Export initialization function
export function init() {
  return Promise.all([
    initOptions($rootScope, Storage),
    initJobs(Jobs, Storage, $rootScope)
  ]).then(() => {
    buildWatcher();
  }).catch(error => {
    console.error('Error initializing services:', error);
    throw error;
  });
}
