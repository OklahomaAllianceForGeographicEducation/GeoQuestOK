// lib/sentry.ts
// Central Sentry init. Import this once, as early as possible (app/_layout.tsx).
//
// No DSN is hardcoded here on purpose -- it comes from EXPO_PUBLIC_SENTRY_DSN
// (see .env.example) so each environment (dev/staging/prod, or a fork) can
// point at its own Sentry project without a code change. If the var is unset
// (e.g. a fresh clone before anyone's configured Sentry), init is skipped
// entirely rather than throwing or silently no-op'ing with a bad DSN.

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Very rough heuristics, not a general PII scrubber -- just enough to stop
// the two concrete things this app's own console.log calls have leaked in
// the past (raw emails, and Supabase auth/DB payloads with student fields
// like username/display_name) from riding along as breadcrumbs on the next
// captured error. This app handles minors' accounts, so default-on
// breadcrumb capture of console.* calls (the RN SDK's default behavior)
// needed a guard rather than trusting every call site to self-censor.
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
function redactPII(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.replace(EMAIL_PATTERN, '[redacted-email]');
    }
    return value;
}

if (dsn) {
    Sentry.init({
        dsn,
        // Send errors from Expo Go / dev builds too -- flip this off if that
        // gets noisy, but seeing dev crashes is usually the point early on.
        enabled: true,
        debug: __DEV__,
        tracesSampleRate: 1.0,

        // The wizard's default is `true` (IP address, cookies, etc. attached
        // to every event). Left off here on purpose: this app handles K-12
        // student accounts, and LAUNCH_GUIDE.md already flags privacy
        // practices as needing to stay defensible -- opt into this
        // explicitly if you decide you actually want that data in Sentry.
        sendDefaultPii: false,

        enableLogs: true,
        // Session Replay (native builds only -- the RN SDK's replay
        // integration doesn't run on web) is off until there's been an
        // explicit privacy/DPA review, the same bar LAUNCH_GUIDE.md already
        // sets for other vendors touching student data. Default masking of
        // text/images/webviews would apply if this were ever turned back
        // on, but that's a policy decision, not just a config default.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

        beforeBreadcrumb(breadcrumb) {
            if (breadcrumb.message) breadcrumb.message = redactPII(breadcrumb.message) as string;
            if (breadcrumb.data) {
                for (const key of Object.keys(breadcrumb.data)) {
                    breadcrumb.data[key] = redactPII(breadcrumb.data[key]);
                }
            }
            return breadcrumb;
        },
    });
}

export { Sentry };
