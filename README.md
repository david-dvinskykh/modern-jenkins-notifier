![Jenkins Logo](img/icon48.png) Modern Jenkins Notifier
------------------

A modern browser extension that monitors Jenkins jobs and notifies you of build results with desktop notifications. Built with Manifest V3 support for enhanced security and performance.

Features:  
✔ Pop-up notifications  
✔ Add jobs with a shortcut(default: Shift + J)  
✔ Single job, view jobs or all jobs monitoring  
✔ Folder and Pipeline support  
✔ Multiple Jenkins servers support  
✔ Number of failing, unstable or stable jobs in icon badge  
✔ Choose to be notified on every build or on every unstable build  
✔ One-time watch: get notified about the next build of a single job, then stop  
✔ Sound and an on-screen pop-up window with the build result  
✔ Modern Manifest V3 support for enhanced security

# Notifications

Build results are delivered as desktop notifications through the browser, which
hands them to the notification centre of the operating system.

The operating system decides whether such a notification appears on screen and
whether it makes a sound, and on many setups it does neither. Two alerts are
therefore produced by the extension itself and can be switched on and off in the
options page:

- **A sound**, played from an offscreen document, since a Manifest V3 service
  worker has no way to play audio on its own.
- **A pop-up window** with the job, the status and a link to the build. It
  closes on its own after ten seconds, a click opens the build, and several
  results arriving together share one window.

If you would rather have the system banners themselves, allow notifications for
your browser in the notification settings of Windows or macOS.

If nothing shows up, open the options page. The **System notifications** section
reports whether the browser is allowed to show notifications and why the last
attempt failed, and the **Send a test notification** button checks the whole path
end to end. Notifications also need access to the Jenkins server itself: without
it no build status can be read, so no change can be reported. The **Access to
Jenkins servers** section grants that access for the configured urls.

# One-time watch

To follow a single job without keeping it in the monitoring list, tick
*Notify me once about the next build* when adding its url, or press **Notify
once** on a job already in the list. The next build result of that job is
reported even when notifications are globally turned off, and the job is then
removed from the list automatically.

# Installation
[![Add to Chrome](https://developer.chrome.com/webstore/images/ChromeWebStore_Badge_v2_340x96.png)](https://chrome.google.com/webstore/detail/yet-another-jenkins-notif/cimdjdaglanfkpfpoemjkfkmjgkmahpg)
[![Add to Firefox](screenshots/firefox.png)](https://addons.mozilla.org/en-US/firefox/addon/yet-another-jenkins-notifier/)

# Screenshots

![Jobs list pop-up and desktop notification](screenshots/popup.png)
_____________
![Configuration page](screenshots/options.png)

# Author

This extension was originally created by Guillaume Girou ([Twitter](https://twitter.com/GirouGuillaume), [GitHub](https://github.com/ggirou)) and has been modernized with Manifest V3 support by Himanshu Pandey ([X](https://twitter.com/theboycalledhp))

# Source

Source code available on [GitHub](https://github.com/hp77-creator/modern-jenkins-notifier).

# Bug tracker

Found a bug? Please submit an issue on [GitHub](https://github.com/hp77-creator/modern-jenkins-notifier/issues/new) or even better, submit a pull request :)

# Copyright and license

Copyright 2024 Modern Jenkins Notifier.
Released under [GNU General Public License v3.0](https://github.com/hp77-creator/modern-jenkins-notifier/blob/master/LICENSE).
