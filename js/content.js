// Content script to detect keyboard shortcuts on Jenkins build pages
(function() {
    console.log('Jenkins Notifier content script starting initialization...');

    // Default shortcut configuration
    let shortcutConfig = {
        key: 'j',
        shiftKey: true,
        ctrlKey: false,
        altKey: false
    };

    // Function to format shortcut text
    function formatShortcut(config) {
        const parts = [];
        if (config.ctrlKey) parts.push('Ctrl');
        if (config.altKey) parts.push('Alt');
        if (config.shiftKey) parts.push('Shift');
        parts.push(config.key.toUpperCase());
        return parts.join(' + ');
    }

    // Load shortcut configuration
    chrome.storage.local.get({options: {
        addJobShortcut: shortcutConfig
    }}, function(objects) {
        shortcutConfig = objects.options.addJobShortcut;
        console.log('Loaded shortcut configuration:', shortcutConfig);
        // Show indicator with current shortcut
        createIndicator();
    });

    // Listen for shortcut configuration changes
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local' && changes.options?.newValue?.addJobShortcut) {
            shortcutConfig = changes.options.newValue.addJobShortcut;
            console.log('Shortcut configuration updated:', shortcutConfig);
            // Update indicator with new shortcut
            createIndicator();
        }
    });

    // What the current page offers: a job to monitor, or one build to follow
    // until it finishes.
    function describeJenkinsPage() {
        const url = window.location.href.split('?')[0].split('#')[0];

        if (!url.includes('/job/')) {
            return {
                kind: 'invalid',
                error: 'Not a Jenkins job page'
            };
        }

        if (url.includes('/configure')) {
            return {
                kind: 'invalid',
                error: 'Please add the job page, not its configuration page'
            };
        }

        const buildNumberMatch = url.match(/\/job\/.+?\/(\d+)\/?$/);
        if (buildNumberMatch) {
            return {
                kind: 'build',
                number: buildNumberMatch[1],
                action: 'addBuildWatch',
                label: 'Watch build #' + buildNumberMatch[1],
                title: 'Notify me when this build finishes, then stop watching'
            };
        }

        return {
            kind: 'job',
            action: 'addBuildPage',
            label: 'Monitor this job',
            title: 'Notify me about every build of this job'
        };
    }

    // The button on the page. It stays in the corner and does what the current
    // page allows: monitor the job, or follow this one build.
    function createIndicator() {
        const existingIndicators = document.querySelectorAll('.jenkins-notifier-indicator');
        existingIndicators.forEach(indicator => indicator.remove());

        const page = describeJenkinsPage();
        if (page.kind === 'invalid') {
            return;
        }

        const button = document.createElement('button');
        button.className = 'jenkins-notifier-indicator';
        button.type = 'button';
        button.title = page.title + ' (' + formatShortcut(shortcutConfig) + ')';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
            background: ${page.kind === 'build' ? '#2a6bb5' : 'rgba(0, 0, 0, 0.82)'};
            color: white;
            border: 0;
            padding: 10px 14px;
            border-radius: 20px;
            font-size: 13px;
            line-height: 1.2;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: opacity 0.25s, transform 0.15s;
        `;
        button.textContent = page.label;

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-1px)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'none';
        });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            requestMonitoring();
        });

        if (document.body) {
            document.body.appendChild(button);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(button);
            });
        }
    }

    // Asks the background script to start monitoring what this page shows.
    function requestMonitoring() {
        const page = describeJenkinsPage();
        if (page.kind === 'invalid') {
            showNotification(page.error, true);
            return;
        }

        chrome.runtime.sendMessage({
            action: page.action,
            url: window.location.href,
            title: document.title
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError);
                showNotification('Failed to communicate with extension', true);
            }
        });
    }

    // Function to show notifications
    function showNotification(message, isError = false) {
        console.log('Showing notification:', message, isError);
        
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.jenkins-notifier-message');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = 'jenkins-notifier-message';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#f44336' : '#4CAF50'};
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 2147483647;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 400px;
            word-wrap: break-word;
            cursor: pointer;
            transition: opacity 0.5s;
        `;
        notification.textContent = message;
        
        // Add click handler to dismiss notification
        notification.addEventListener('click', () => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        });

        // Ensure body exists before appending
        if (document.body) {
            document.body.appendChild(notification);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(notification);
            });
        }
        
        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // Function to handle keyboard shortcuts
    function handleKeyPress(event) {
        console.log('Key pressed:', event.key, 'Modifiers:', {
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            alt: event.altKey
        });
        
        // Check if the pressed keys match the configured shortcut
        if (event.key.toLowerCase() === shortcutConfig.key &&
            event.shiftKey === shortcutConfig.shiftKey &&
            event.ctrlKey === shortcutConfig.ctrlKey &&
            event.altKey === shortcutConfig.altKey) {
            
            console.log('Configured shortcut detected');
            event.preventDefault(); // Prevent any default browser behavior
            event.stopPropagation(); // Stop event bubbling

            requestMonitoring();
        }
    }

    // Initialize the extension
    function initialize() {
        console.log('Initializing Jenkins Notifier...');
        
        // Add keyboard event listeners
        window.addEventListener('keydown', handleKeyPress, true);
        document.addEventListener('keydown', handleKeyPress, true);
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Received message in content script:', message);
            
            if (message.type === 'buildPageAdded') {
                showNotification(`Jenkins build page added to monitoring! (${formatShortcut(shortcutConfig)} to add more)`);
            } else if (message.type === 'buildWatchAdded') {
                showNotification(message.building
                    ? `Watching build #${message.number}. You will be notified when it finishes.`
                    : `Build #${message.number} has already finished, its result follows.`);
            } else if (message.type === 'buildPageAddError') {
                showNotification(message.error, true);
            }
        });
        
        console.log('Jenkins Notifier initialized successfully');
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
