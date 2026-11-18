'use strict';

const { GoogleGenAI } = require('@google/genai');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');

// ==================== CONSTANTS & VERIFIED CLUB KNOWLEDGE ====================

const PUBLIC_CONTENT_FILTER = {
    $or: [{ status: 'approved' }, { status: { $exists: false } }]
};

const DEFAULT_PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_EXTRA_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash'];

const DEFAULT_TIMEOUT_MS = 16000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_REQUEST_BUDGET_MS = 45000;
const FALLBACK_RESERVE_MS = 18000;
const SLOW_FAILURE_THRESHOLD_MS = 8000;
const DEFAULT_BASE_BACKOFF_MS = 600;
const DEFAULT_MAX_BACKOFF_MS = 6000;
const DEFAULT_CACHE_TTL_MS = 60000;

const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_TEXT_LENGTH = 1200;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Verified CUET Computer Club facts strictly cross-checked against
 * active website pages (Frontend/index.html, member_dashboard.html,
 * signup.html, eventRegistrationRoutes.js, contestRegistrationRoutes.js).
 *
 * Intentionally omits unverified placeholder contact emails, phone numbers,
 * physical office room numbers, and office hours.
 */
const VERIFIED_CLUB_KNOWLEDGE = `CUET Computer Club (Chittagong University of Engineering & Technology)

Core Activities (verified from website):
- Programming: Python, JavaScript, C++, Java, algorithms, data structures, weekly coding challenges, hands-on projects, and code review sessions.
- Workshops: Sessions on Web Development, AI/ML, Cloud Computing, and Mobile Development with live coding and Q&A.
- Contests: Coding competitions and hackathons with team participation and prizes.
- Networking & Community: Industry meetups, alumni talks, mentorship, team collaboration, open-source contributions, knowledge sharing, and social events.

General Membership & Website Features (verified from website):
- Anyone can sign up on the Sign Up page (name, email, optional Student ID, and password). New accounts are created as general members ("member" role) automatically.
- Logged-in members get access to the Member Dashboard, where they can view their profile, track their event and contest registrations, check payment/registration status, resubmit rejected payment details, cancel registrations, and access club links (including the official LinkedIn page: https://www.linkedin.com/company/cuet-computer-club/).
- Do NOT invent additional membership perks, discounts, or privileges beyond what is listed here.

Event & Contest Registration Process (verified from website):
- First, create an account on the Sign Up page and log in.
- For Events: Open an event from the Events section, click Register, and fill in your participant details (name, email, phone, student ID, department, semester). If the event is free (fee = 0 BDT), registration is confirmed directly. If the event has a registration fee, send payment via bKash, Nagad, or Rocket to the club payment number shown on the registration page and submit the Transaction ID for admin verification.
- For Contests: Open a contest from the Contests section, click Register, and submit your team name, team members (within the contest's team size), and team lead details. If there is an entry fee, pay via bKash, Nagad, or Rocket and submit the Transaction ID for admin verification.
- Forgotten passwords can be reset using the "Forgot Password" link on the Login page.

Executive Committee 2026-2027 (verified from Frontend/index.html):
- Towhidul Islam Rizvi: President
- Shadat Hossain Rony: Vice President (Technical)
- Md. Jamil Hossen Safi: Vice President (Admin)
- Samonwita Sarker: Vice President (Organizing)
- Md. Mahi Islam: General Secretary
- Md Faladun Islam: Finance Secretary

Unverified Information Rule:
- Official club contact email, phone number, physical office room number, office hours, and general membership fees are NOT verified in the club database. If asked for those details, clearly state that they could not be verified here and suggest checking the official CUET Computer Club website, contact form, or official LinkedIn page.`;

// ==================== SANITIZED LOGGING ====================

function redactSecrets(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
        .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGO_URI]')
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');
}

function logEvent(level, payload) {
    const safePayload = {};
    for (const [k, v] of Object.entries(payload || {})) {
        if (typeof v === 'string') {
            safePayload[k] = redactSecrets(v).slice(0, 300);
        } else {
            safePayload[k] = v;
        }
    }
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        service: 'chatbot',
        level,
        ...safePayload
    });
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

// ==================== CONFIGURATION HELPERS ====================

function clampInt(raw, fallback, min, max) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function resolveModelChain(env = process.env) {
    const primary = (env.GEMINI_MODEL || DEFAULT_PRIMARY_MODEL).trim();
    const fallback = (env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL).trim();
    const extraRaw = env.GEMINI_EXTRA_FALLBACK_MODELS;
    const extras = typeof extraRaw === 'string'
        ? extraRaw.split(',').map(s => s.trim()).filter(Boolean)
        : DEFAULT_EXTRA_FALLBACKS;

    const seen = new Set();
    const chain = [];
    for (const model of [primary, fallback, ...extras]) {
        if (model && !seen.has(model)) {
            seen.add(model);
            chain.push(model);
        }
    }
    return chain;
}

// ==================== ERROR CLASSIFICATION & RETRY DELAY ====================

function parseRetryAfterMs(err) {
    if (!err) return null;

    // 1. Check direct numeric/string property or Headers object
    let headerVal = null;
    if (err.headers && typeof err.headers.get === 'function') {
        headerVal = err.headers.get('retry-after');
    } else if (err.headers && (err.headers['retry-after'] || err.headers['Retry-After'])) {
        headerVal = err.headers['retry-after'] || err.headers['Retry-After'];
    } else if (err.retryAfter != null) {
        headerVal = err.retryAfter;
    }

    if (headerVal != null) {
        const secs = Number(headerVal);
        if (!Number.isNaN(secs) && secs >= 0) {
            return Math.round(secs * 1000);
        }
        const dateMs = Date.parse(String(headerVal));
        if (!Number.isNaN(dateMs)) {
            return Math.max(0, dateMs - Date.now());
        }
    }

    // 2. Check structured error details (Google API RetryInfo: { retryDelay: "3s" })
    const messageStr = typeof err.message === 'string' ? err.message : '';
    const retryDelayMatch = messageStr.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i)
        || messageStr.match(/retry in\s+(\d+(?:\.\d+)?)\s*s/i);
    if (retryDelayMatch) {
        const secs = Number.parseFloat(retryDelayMatch[1]);
        if (!Number.isNaN(secs) && secs >= 0) {
            return Math.round(secs * 1000);
        }
    }

    return null;
}

function classifyGeminiError(err) {
    if (!err) {
        return {
            code: 'UNKNOWN_ERROR',
            httpStatus: 500,
            retryableSameModel: false,
            allowFallbackModel: false,
            retryAfterMs: null
        };
    }

    const name = String(err.name || '');
    const msg = String(err.message || '');
    const msgLower = msg.toLowerCase();
    const rawStatus = Number(err.status || err.statusCode || err.code || 0);
    const retryAfterMs = parseRetryAfterMs(err);

    // Timeout / Abort
    if (
        name === 'AbortError' ||
        name === 'TimeoutError' ||
        err.code === 'ETIMEDOUT' ||
        msgLower.includes('timed out') ||
        msgLower.includes('timeout') ||
        msgLower.includes('operation was aborted')
    ) {
        return {
            code: 'TIMEOUT',
            httpStatus: 504,
            retryableSameModel: true,
            allowFallbackModel: true,
            retryAfterMs: null
        };
    }

    // Invalid API key / auth / permission
    if (
        rawStatus === 401 ||
        rawStatus === 403 ||
        msgLower.includes('api_key_invalid') ||
        msgLower.includes('api key not valid') ||
        msgLower.includes('invalid api key') ||
        msgLower.includes('permission_denied') ||
        msgLower.includes('unauthenticated')
    ) {
        return {
            code: 'INVALID_API_KEY',
            httpStatus: 503,
            retryableSameModel: false,
            allowFallbackModel: false,
            retryAfterMs: null
        };
    }

    // Model not found / retired / unsupported -> skip retries on this model, try fallback
    if (
        rawStatus === 404 ||
        msgLower.includes('not found') ||
        msgLower.includes('no longer available') ||
        msgLower.includes('is not supported for generatecontent')
    ) {
        return {
            code: 'MODEL_UNAVAILABLE',
            httpStatus: 503,
            retryableSameModel: false,
            allowFallbackModel: true,
            retryAfterMs: null
        };
    }

    // Rate limit vs Daily Quota exhaustion (HTTP 429)
    if (rawStatus === 429 || msgLower.includes('resource_exhausted') || msgLower.includes('too many requests')) {
        const isDailyQuota =
            msgLower.includes('perday') ||
            msgLower.includes('per_day') ||
            msgLower.includes('daily') ||
            msgLower.includes('billing') ||
            msgLower.includes('free_tier') ||
            msgLower.includes('exceeded your current quota') ||
            msgLower.includes('quota exceeded') ||
            (retryAfterMs !== null && retryAfterMs > 15000);

        if (isDailyQuota) {
            return {
                code: 'DAILY_QUOTA_EXHAUSTED',
                httpStatus: 429,
                retryableSameModel: false,
                allowFallbackModel: true,
                retryAfterMs
            };
        }

        return {
            code: 'RATE_LIMITED',
            httpStatus: 429,
            retryableSameModel: true,
            allowFallbackModel: true,
            retryAfterMs
        };
    }

    // Transient upstream server/demand errors (503, 500, 502, 504) or transient network errors
    if (
        rawStatus === 503 ||
        rawStatus === 500 ||
        rawStatus === 502 ||
        rawStatus === 504 ||
        msgLower.includes('service unavailable') ||
        msgLower.includes('high demand') ||
        msgLower.includes('overloaded') ||
        msgLower.includes('internal error') ||
        msgLower.includes('econnreset') ||
        msgLower.includes('econnrefused') ||
        msgLower.includes('fetch failed') ||
        msgLower.includes('network')
    ) {
        return {
            code: 'TRANSIENT_UNAVAILABLE',
            httpStatus: rawStatus === 502 ? 502 : 503,
            retryableSameModel: true,
            allowFallbackModel: true,
            retryAfterMs
        };
    }

    // Non-auth 400 Bad Request
    if (rawStatus === 400 || msgLower.includes('invalid_argument')) {
        return {
            code: 'BAD_REQUEST',
            httpStatus: 500,
            retryableSameModel: false,
            allowFallbackModel: false,
            retryAfterMs: null
        };
    }

    return {
        code: 'UPSTREAM_ERROR',
        httpStatus: 502,
        retryableSameModel: false,
        allowFallbackModel: true,
        retryAfterMs: null
    };
}

// ==================== HISTORY SANITIZATION ====================

function sanitizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
        return [];
    }

    const normalized = [];
    for (const item of rawHistory) {
        if (!item || typeof item !== 'object') continue;

        const rawRole = typeof item.role === 'string' ? item.role.trim().toLowerCase() : '';
        let role = null;
        if (rawRole === 'user') {
            role = 'user';
        } else if (rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'model') {
            role = 'model';
        }
        if (!role) continue;

        const rawText = typeof item.text === 'string'
            ? item.text
            : (typeof item.content === 'string' ? item.content : '');
        const text = rawText.trim();
        if (!text) continue;

        const clipped = text.length > MAX_HISTORY_TEXT_LENGTH
            ? text.slice(0, MAX_HISTORY_TEXT_LENGTH)
            : text;

        // Enforce strict alternating roles by merging consecutive same-role messages
        if (normalized.length > 0 && normalized[normalized.length - 1].role === role) {
            normalized[normalized.length - 1].parts[0].text += '\n' + clipped;
        } else {
            normalized.push({ role, parts: [{ text: clipped }] });
        }
    }

    // Keep only the most recent window
    let recent = normalized.slice(-MAX_HISTORY_ITEMS);

    // Gemini requires history to start with a 'user' turn
    while (recent.length > 0 && recent[0].role !== 'user') {
        recent.shift();
    }

    // If history ends with 'user', drop the dangling trailing user turn so
    // the new incoming user message alternates cleanly after a 'model' turn.
    if (recent.length > 0 && recent[recent.length - 1].role === 'user') {
        recent.pop();
    }

    return recent;
}

// ==================== INTENT & DATE HELPERS ====================

function parseDateValue(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    // YYYY-MM-DD (treat as local midnight for safe day comparison)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function partitionAndSortByDate(items, nowDate = new Date()) {
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const upcoming = [];
    const past = [];
    const undated = [];

    for (const item of items || []) {
        const dt = parseDateValue(item.date);
        if (!dt) {
            undated.push(item);
        } else if (dt >= todayStart) {
            upcoming.push({ item, ts: dt.getTime() });
        } else {
            past.push({ item, ts: dt.getTime() });
        }
    }

    upcoming.sort((a, b) => a.ts - b.ts); // Soonest upcoming first
    past.sort((a, b) => b.ts - a.ts);     // Most recent past first

    return {
        upcoming: upcoming.map(x => x.item),
        past: past.map(x => x.item),
        undated
    };
}

function detectIntent(message) {
    const msg = message.trim();
    const lower = msg.toLowerCase();

    // Fast deterministic greetings & thanks
    const normalizedGreeting = lower.replace(/[!?.।,]+$/g, '').trim();
    const greetings = new Set([
        'hi', 'hello', 'hey', 'hi there', 'hello there', 'hy', 'hlw',
        'assalamu alaikum', 'salam', 'assalamualaikum', 'nomoshkar', 'হ্যালো', 'হাই'
    ]);
    const thanks = new Set([
        'thanks', 'thank you', 'thnx', 'tnx', 'dhonnobad', 'tysm', 'ধন্যবাদ'
    ]);

    if (greetings.has(normalizedGreeting)) {
        return { kind: 'greeting' };
    }
    if (thanks.has(normalizedGreeting)) {
        return { kind: 'thanks' };
    }

    const isJsEventTerm = /\bevent\s+(listener|loop|handler|bubbling|capturing|emitter|driven|object|target|delegation)\b/i.test(lower);
    const wantsEvents = !isJsEventTerm && /\b(events?|evnts?|ivnts?|workshop|workshops|meetup|agm|bootcamp|seminar)\b|ইভেন্ট/i.test(lower);
    const wantsUpcoming = /\b(upcoming|next|soon|schedule)\b|আসন্ন/i.test(lower);
    const wantsContests = /\b(contests?|contsts?|hackathons?|competitions?|programming contest)\b|কনটেস্ট|প্রতিযোগিতা/i.test(lower);
    const wantsNews = /\b(news|announcements?|updates?|khobor)\b|খবর|নিউজ/i.test(lower);
    const wantsCommittee = /\b(committee|president|vice president|vp|secretary|general secretary|finance secretary|executive|leaders?|team)\b|কমিটি|প্রেসিডেন্ট/i.test(lower);
    const wantsRegistration = /\b(register|registration|sign ?up|join|apply|payment|bkash|nagad|rocket|fee)\b|রেজিস্ট্রেশন/i.test(lower);
    const wantsMemberBenefits = /\b(general member|member benefits?|as a member|membership|what can i get|get from (this |the )?club)\b|সদস্য/i.test(lower);
    const wantsClubGeneral = /\b(cuet computer club|cuet|computer club|this club|the club|club)\b|ক্লাব/i.test(lower);
    const wantsContact = /\b(contact|email|phone|number|office|room|location|address|hours)\b|যোগাযোগ|ঠিকানা/i.test(lower);

    // Avoid falsely marking general coding questions ("What is Python?", "Explain programming") as club-related
    const isClubRelated = Boolean(
        wantsEvents ||
        wantsContests ||
        wantsNews ||
        wantsCommittee ||
        wantsMemberBenefits ||
        wantsClubGeneral ||
        (wantsRegistration && (wantsEvents || wantsContests || wantsClubGeneral || /\b(registration process|how to register|register for)\b/i.test(lower))) ||
        (wantsContact && wantsClubGeneral)
    );

    // Direct simple DB lookup: short straightforward English requests specifically asking to list club events/contests/news
    const hasBanglaChars = /[\u0980-\u09FF]/.test(msg);
    const hasBanglishRequest = /\b(bangla|banglay|bujhao|bolo|kivabe|ki|kobe|kothay|gulo)\b/i.test(lower);
    const isDirectDbLookup = !hasBanglaChars && !hasBanglishRequest && (
        /^(what are (the )?)?(?:upcoming |recent |latest |all |club )*(events?|contests?|news)\??$/i.test(lower) ||
        /^(show|list|get|tell me about)( me)?( the)?(?: upcoming| recent| latest| all| club)* (events?|contests?|club news|news)\.?$/i.test(lower) ||
        /^(any )?(?:upcoming |recent |club )*(events?|contests?)\??$/i.test(lower)
    );

    return {
        kind: isDirectDbLookup ? 'direct_db_lookup' : 'ai',
        isClubRelated,
        wantsEvents,
        wantsUpcoming,
        wantsContests,
        wantsNews,
        wantsCommittee,
        wantsRegistration,
        wantsMemberBenefits,
        wantsClubGeneral,
        wantsContact
    };
}

// ==================== DETERMINISTIC CLUB FORMATTERS ====================

function formatFee(fee) {
    if (fee == null || Number(fee) === 0) return 'Free';
    return `${fee} BDT`;
}

function formatEventsReply(events, { onlyUpcoming = false } = {}) {
    if (!events || events.length === 0) {
        return 'There are currently no published events listed on the CUET Computer Club website.';
    }

    const { upcoming, past, undated } = partitionAndSortByDate(events);
    const lines = [];

    if (upcoming.length > 0) {
        lines.push('**Upcoming CUET Computer Club Events:**');
        for (const e of upcoming.slice(0, 8)) {
            const parts = [`- **${e.title}** — Date: ${e.date}`];
            if (e.location) parts.push(`Location: ${e.location}`);
            parts.push(`Fee: ${formatFee(e.registrationFee)}`);
            lines.push(parts.join(' | '));
        }
    } else if (onlyUpcoming) {
        lines.push('There are currently no upcoming events scheduled.');
    }

    if (!onlyUpcoming && (past.length > 0 || undated.length > 0)) {
        const others = [...undated, ...past].slice(0, upcoming.length > 0 ? 3 : 6);
        if (others.length > 0) {
            if (lines.length > 0) lines.push('');
            lines.push(upcoming.length > 0 ? '**Recent Past Events:**' : '**Published CUET Computer Club Events:**');
            for (const e of others) {
                const parts = [`- **${e.title}** — Date: ${e.date || 'TBA'}`];
                if (e.location) parts.push(`Location: ${e.location}`);
                parts.push(`Fee: ${formatFee(e.registrationFee)}`);
                lines.push(parts.join(' | '));
            }
        }
    }

    lines.push('\nYou can view full details and register from the **Events** section on the website.');
    return lines.join('\n');
}

function formatContestsReply(contests, { onlyUpcoming = false } = {}) {
    if (!contests || contests.length === 0) {
        return 'There are currently no published contests listed on the CUET Computer Club website.';
    }

    const { upcoming, past, undated } = partitionAndSortByDate(contests);
    const lines = [];

    if (upcoming.length > 0) {
        lines.push('**Upcoming CUET Computer Club Contests:**');
        for (const c of upcoming.slice(0, 8)) {
            const parts = [`- **${c.title}** — Date: ${c.date}`];
            if (c.prize) parts.push(`Prize: ${c.prize}`);
            if (c.teamSize) parts.push(`Team Size: ${c.teamSize}`);
            parts.push(`Fee: ${formatFee(c.registrationFee)}`);
            lines.push(parts.join(' | '));
        }
    } else if (onlyUpcoming) {
        lines.push('There are currently no upcoming contests scheduled.');
    }

    if (!onlyUpcoming && (past.length > 0 || undated.length > 0)) {
        const others = [...undated, ...past].slice(0, upcoming.length > 0 ? 3 : 6);
        if (others.length > 0) {
            if (lines.length > 0) lines.push('');
            lines.push(upcoming.length > 0 ? '**Recent Past Contests:**' : '**Published CUET Computer Club Contests:**');
            for (const c of others) {
                const parts = [`- **${c.title}** — Date: ${c.date || 'TBA'}`];
                if (c.prize) parts.push(`Prize: ${c.prize}`);
                if (c.teamSize) parts.push(`Team Size: ${c.teamSize}`);
                parts.push(`Fee: ${formatFee(c.registrationFee)}`);
                lines.push(parts.join(' | '));
            }
        }
    }

    lines.push('\nYou can view full details and register your team from the **Contests** section on the website.');
    return lines.join('\n');
}

function formatNewsReply(newsList) {
    if (!newsList || newsList.length === 0) {
        return 'There are currently no published news articles on the CUET Computer Club website.';
    }

    const lines = ['**Latest CUET Computer Club News:**'];
    for (const n of newsList.slice(0, 5)) {
        const snippet = (n.content || '').replace(/\s+/g, ' ').trim();
        const shortSnippet = snippet.length > 160 ? snippet.slice(0, 157) + '...' : snippet;
        lines.push(`- **${n.title}**${shortSnippet ? `: ${shortSnippet}` : ''}`);
    }
    lines.push('\nRead full announcements in the **News & Media** section on the website.');
    return lines.join('\n');
}

function buildDeterministicClubReply(intent, clubData) {
    const sections = [];

    if (intent.wantsEvents) {
        if (!clubData.dbAvailable) {
            sections.push('Live event records are temporarily unavailable because the club database could not be reached right now. Please try again shortly or check the Events section on the website.');
        } else {
            sections.push(formatEventsReply(clubData.events, { onlyUpcoming: intent.wantsUpcoming }));
        }
    }

    if (intent.wantsContests) {
        if (!clubData.dbAvailable) {
            sections.push('Live contest records are temporarily unavailable because the club database could not be reached right now. Please try again shortly or check the Contests section on the website.');
        } else {
            sections.push(formatContestsReply(clubData.contests, { onlyUpcoming: intent.wantsUpcoming }));
        }
    }

    if (intent.wantsNews) {
        if (!clubData.dbAvailable) {
            sections.push('Live news articles are temporarily unavailable because the club database could not be reached right now. Please try again shortly or check the News & Media section on the website.');
        } else {
            sections.push(formatNewsReply(clubData.news));
        }
    }

    if (intent.wantsCommittee) {
        sections.push(
            '**CUET Computer Club Executive Committee (2026–2027):**\n' +
            '- **Towhidul Islam Rizvi** — President\n' +
            '- **Shadat Hossain Rony** — Vice President (Technical)\n' +
            '- **Md. Jamil Hossen Safi** — Vice President (Admin)\n' +
            '- **Samonwita Sarker** — Vice President (Organizing)\n' +
            '- **Md. Mahi Islam** — General Secretary\n' +
            '- **Md Faladun Islam** — Finance Secretary'
        );
    }

    if (intent.wantsRegistration && !intent.wantsEvents && !intent.wantsContests) {
        sections.push(
            '**How to Register on the CUET Computer Club Website:**\n' +
            '1. **Create an Account:** Go to the Sign Up page and register with your name, email, optional Student ID, and password. Every new account starts as a general member.\n' +
            '2. **Events:** Log in, open an event from the Events section, click Register, and enter your details. Free events confirm immediately; paid events require payment via **bKash, Nagad, or Rocket** and submitting the Transaction ID for admin verification.\n' +
            '3. **Contests:** Log in, open a contest from the Contests section, click Register, and submit your team name, team members, and team lead details (plus payment & Transaction ID if an entry fee applies).'
        );
    }

    if (intent.wantsMemberBenefits) {
        sections.push(
            '**What You Can Access as a General Member of CUET Computer Club:**\n' +
            '- Participate in club activities: programming sessions (Python, JavaScript, C++, Java, algorithms & data structures), technical workshops (Web Development, AI/ML, Cloud, Mobile), coding contests, hackathons, collaborative projects, and networking/alumni talks.\n' +
            '- Use your **Member Dashboard** after signing up to view your profile, register for events and contests, track registration and payment status, resubmit payment details if needed, cancel registrations, and access club links (such as the official LinkedIn page).'
        );
    }

    if (intent.wantsContact) {
        sections.push(
            'Official club contact email, phone number, and physical office room/hours could not be verified from the live club database. Please use the Contact form on the website or visit the official CUET Computer Club LinkedIn page (https://www.linkedin.com/company/cuet-computer-club/) for verified contact details.'
        );
    }

    if (sections.length === 0 && intent.isClubRelated) {
        sections.push(
            '**CUET Computer Club** is a student tech community focused on programming, technical workshops (Web Dev, AI/ML, Cloud, Mobile), coding contests, hackathons, collaborative projects, and networking.\n\n' +
            'You can sign up as a member on the website to register for events and contests and track your activity from the Member Dashboard.'
        );
    }

    return sections.length > 0 ? sections.join('\n\n') : null;
}

// ==================== SYSTEM PROMPT BUILDER ====================

function buildSystemInstruction(intent, clubData) {
    let clubSection = '';

    if (intent.isClubRelated) {
        const parts = [`[VERIFIED CLUB KNOWLEDGE]\n${VERIFIED_CLUB_KNOWLEDGE}`];

        if (clubData && clubData.dbAvailable) {
            if (intent.wantsEvents || intent.wantsClubGeneral || intent.wantsRegistration) {
                const { upcoming, past, undated } = partitionAndSortByDate(clubData.events);
                const eventLines = [];
                for (const e of upcoming.slice(0, 8)) {
                    eventLines.push(`- [UPCOMING] ${e.title} | Date: ${e.date} | Location: ${e.location || 'TBA'} | Fee: ${formatFee(e.registrationFee)} | Desc: ${(e.description || '').slice(0, 200)}`);
                }
                for (const e of [...undated, ...past].slice(0, 4)) {
                    eventLines.push(`- [PAST/OTHER] ${e.title} | Date: ${e.date || 'TBA'} | Location: ${e.location || 'TBA'} | Fee: ${formatFee(e.registrationFee)} | Desc: ${(e.description || '').slice(0, 150)}`);
                }
                parts.push(`[VERIFIED PUBLIC EVENTS FROM DATABASE]\n${eventLines.length ? eventLines.join('\n') : 'No published events currently in the database.'}`);
            }

            if (intent.wantsContests || intent.wantsClubGeneral || intent.wantsRegistration) {
                const { upcoming, past, undated } = partitionAndSortByDate(clubData.contests);
                const contestLines = [];
                for (const c of upcoming.slice(0, 8)) {
                    contestLines.push(`- [UPCOMING] ${c.title} | Date: ${c.date} | Prize: ${c.prize || 'TBA'} | Team Size: ${c.teamSize || 'TBA'} | Fee: ${formatFee(c.registrationFee)} | Desc: ${(c.description || '').slice(0, 200)}`);
                }
                for (const c of [...undated, ...past].slice(0, 4)) {
                    contestLines.push(`- [PAST/OTHER] ${c.title} | Date: ${c.date || 'TBA'} | Prize: ${c.prize || 'TBA'} | Team Size: ${c.teamSize || 'TBA'} | Fee: ${formatFee(c.registrationFee)}`);
                }
                parts.push(`[VERIFIED PUBLIC CONTESTS FROM DATABASE]\n${contestLines.length ? contestLines.join('\n') : 'No published contests currently in the database.'}`);
            }

            if (intent.wantsNews || intent.wantsClubGeneral) {
                const newsLines = (clubData.news || []).slice(0, 6).map(n =>
                    `- ${n.title}: ${(n.content || '').slice(0, 220)}`
                );
                parts.push(`[VERIFIED PUBLIC NEWS FROM DATABASE]\n${newsLines.length ? newsLines.join('\n') : 'No published news currently in the database.'}`);
            }
        } else {
            parts.push('[LIVE CLUB DATABASE STATUS]\nThe club database is currently unreachable. Do NOT invent any events, contests, dates, or news. Inform the user politely that live event/contest/news records could not be loaded right now.');
        }

        clubSection = `\n\n${parts.join('\n\n')}`;
    }

    return `You are the CUET Computer Club AI Assistant — a helpful, accurate, general-purpose AI assistant embedded on the CUET Computer Club website.

Capabilities & Scope:
- Answer BOTH general questions (programming in Python/C/C++/Java/JavaScript, web development, computer science, AI/ML, mathematics, science, academics, and everyday topics) AND questions about CUET Computer Club.
- Never refuse a legitimate general knowledge, coding, or educational question just because it is unrelated to the club.
- Maintain reasonable safety boundaries (do not assist with harmful, illegal, or abusive requests).

Language & Tone:
- Respond naturally in the same language the user uses: English, Bangla (বাংলা), Banglish (Bangla written in Latin script), or mixed English/Bangla.
- If the user asks to explain a topic in Bangla or Banglish, follow that instruction clearly and include code examples when relevant.
- Explain concepts simply and clearly. Keep answers concise and well-structured (use short paragraphs, bullet points, or fenced code blocks where helpful).

Club Accuracy Rules (Strictly Enforced):
- For CUET Computer Club events, contests, news, committee, membership, and registration details, rely ONLY on the verified context provided below.
- Never invent club events, dates, prizes, committee members, contact emails, phone numbers, office rooms, or membership privileges.
- If a club-specific detail is missing or unverified, honestly say it could not be verified.${clubSection}`;
}

// ==================== ENGINE FACTORY (DEPENDENCY-INJECTABLE) ====================

function createChatbotEngine(options = {}) {
    const env = options.env || process.env;
    const models = options.models || { Event, Contest, News };
    const sleep = options.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    const random = options.random || Math.random;
    const nowFn = options.now || Date.now;
    const logger = options.logger || logEvent;

    const timeoutMs = clampInt(options.timeoutMs ?? env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 60000);
    const maxRetries = clampInt(options.maxRetries ?? env.GEMINI_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, 3);
    const requestBudgetMs = clampInt(options.requestBudgetMs ?? env.GEMINI_REQUEST_BUDGET_MS, DEFAULT_REQUEST_BUDGET_MS, 3000, 90000);
    const baseBackoffMs = clampInt(options.baseBackoffMs, DEFAULT_BASE_BACKOFF_MS, 10, 5000);
    const maxBackoffMs = clampInt(options.maxBackoffMs, DEFAULT_MAX_BACKOFF_MS, 50, 15000);
    const cacheTtlMs = clampInt(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS, 1000, 300000);

    // Lazily create or reuse Gemini client (can be injected in tests)
    let injectedClient = options.geminiClient || null;
    let cachedClientKey = null;
    let cachedClient = null;

    function getGeminiClient() {
        if (injectedClient) return injectedClient;
        const apiKey = (env.GEMINI_API_KEY || '').trim();
        if (!apiKey) return null;
        if (cachedClient && cachedClientKey === apiKey) {
            return cachedClient;
        }
        cachedClientKey = apiKey;
        cachedClient = new GoogleGenAI({ apiKey });
        return cachedClient;
    }

    // Bounded public club DB cache with single-flight promise deduplication
    const dbCache = {
        events: [],
        contests: [],
        news: [],
        lastFetch: 0,
        hasValidData: false,
        inFlight: null
    };

    async function getPublicClubData({ forceRefresh = false } = {}) {
        const now = nowFn();
        if (!forceRefresh && dbCache.hasValidData && (now - dbCache.lastFetch) < cacheTtlMs) {
            return {
                dbAvailable: true,
                events: dbCache.events,
                contests: dbCache.contests,
                news: dbCache.news
            };
        }

        if (dbCache.inFlight) {
            return dbCache.inFlight;
        }

        dbCache.inFlight = (async () => {
            try {
                const [events, contests, news] = await Promise.all([
                    models.Event.find(PUBLIC_CONTENT_FILTER)
                        .select('title date location capacity description registrationFee createdAt')
                        .sort({ createdAt: -1 })
                        .limit(20)
                        .lean(),
                    models.Contest.find(PUBLIC_CONTENT_FILTER)
                        .select('title date prize teamSize description registrationFee tags createdAt')
                        .sort({ createdAt: -1 })
                        .limit(20)
                        .lean(),
                    models.News.find(PUBLIC_CONTENT_FILTER)
                        .select('title content author createdAt')
                        .sort({ createdAt: -1 })
                        .limit(10)
                        .lean()
                ]);

                dbCache.events = Array.isArray(events) ? events : [];
                dbCache.contests = Array.isArray(contests) ? contests : [];
                dbCache.news = Array.isArray(news) ? news : [];
                dbCache.lastFetch = nowFn();
                dbCache.hasValidData = true;

                return {
                    dbAvailable: true,
                    events: dbCache.events,
                    contests: dbCache.contests,
                    news: dbCache.news
                };
            } catch (err) {
                logger('error', {
                    event: 'db_fetch_failed',
                    error: err.message || 'Database query failed'
                });
                return {
                    dbAvailable: false,
                    events: [],
                    contests: [],
                    news: []
                };
            } finally {
                dbCache.inFlight = null;
            }
        })();

        return dbCache.inFlight;
    }

    async function callSingleGeminiAttempt(client, modelName, contents, systemInstruction, attemptTimeoutMs) {
        const controller = new AbortController();
        let timer = null;

        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                const timeoutErr = new Error(`Request timed out after ${attemptTimeoutMs}ms`);
                timeoutErr.name = 'TimeoutError';
                reject(timeoutErr);
            }, attemptTimeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
        });

        try {
            const response = await Promise.race([
                client.models.generateContent({
                    model: modelName,
                    contents,
                    config: {
                        systemInstruction,
                        maxOutputTokens: 1024,
                        abortSignal: controller.signal
                    }
                }),
                timeoutPromise
            ]);

            const text = extractResponseText(response);
            if (!text) {
                const emptyErr = new Error('Empty response from model');
                emptyErr.status = 502;
                throw emptyErr;
            }
            return text;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    function extractResponseText(response) {
        if (!response) return '';
        if (typeof response.text === 'string' && response.text.trim()) {
            return response.text.trim();
        }
        if (typeof response.text === 'function') {
            const val = response.text();
            if (typeof val === 'string' && val.trim()) return val.trim();
        }
        const candidateParts = response.candidates?.[0]?.content?.parts;
        if (Array.isArray(candidateParts)) {
            const joined = candidateParts
                .filter(p => typeof p.text === 'string')
                .map(p => p.text)
                .join('')
                .trim();
            if (joined) return joined;
        }
        return '';
    }

    async function generateWithRetryAndFallback({ message, history, systemInstruction, requestId }) {
        const client = getGeminiClient();
        if (!client) {
            return {
                ok: false,
                code: 'MISSING_API_KEY',
                httpStatus: 503,
                attempts: 0,
                modelUsed: null
            };
        }

        const modelChain = options.modelChain || resolveModelChain(env);
        const contents = [
            ...history,
            { role: 'user', parts: [{ text: message }] }
        ];

        const startTime = nowFn();
        let totalAttempts = 0;
        let lastFailure = {
            code: 'TRANSIENT_UNAVAILABLE',
            httpStatus: 503,
            retryAfterMs: null
        };

        for (let modelIndex = 0; modelIndex < modelChain.length; modelIndex++) {
            const modelName = modelChain[modelIndex];
            // Primary gets up to maxRetries; fallback models get fewer retries to keep response snappy
            const allowedRetries = modelIndex === 0 ? maxRetries : Math.min(1, maxRetries);

            for (let attempt = 0; attempt <= allowedRetries; attempt++) {
                const elapsed = nowFn() - startTime;
                const remainingBudget = requestBudgetMs - elapsed;
                if (remainingBudget <= 500) {
                    logger('warn', {
                        event: 'request_budget_exhausted',
                        requestId,
                        elapsedMs: elapsed,
                        attempts: totalAttempts
                    });
                    return {
                        ok: false,
                        code: lastFailure.code === 'TIMEOUT' ? 'TIMEOUT' : lastFailure.code,
                        httpStatus: lastFailure.httpStatus,
                        retryAfterMs: lastFailure.retryAfterMs,
                        attempts: totalAttempts,
                        modelUsed: null
                    };
                }

                const attemptTimeout = Math.min(timeoutMs, Math.max(1000, remainingBudget - 250));
                const attemptStart = nowFn();
                totalAttempts++;

                try {
                    const reply = await callSingleGeminiAttempt(
                        client,
                        modelName,
                        contents,
                        systemInstruction,
                        attemptTimeout
                    );

                    return {
                        ok: true,
                        reply,
                        modelUsed: modelName,
                        attempts: totalAttempts,
                        usedFallbackModel: modelIndex > 0
                    };
                } catch (err) {
                    const attemptDurationMs = nowFn() - attemptStart;
                    const classified = classifyGeminiError(err);
                    lastFailure = classified;

                    logger('warn', {
                        event: 'gemini_attempt_failed',
                        requestId,
                        model: modelName,
                        attempt: attempt + 1,
                        attemptDurationMs,
                        errorCode: classified.code,
                        providerStatus: err.status || err.code || 'unknown'
                    });

                    // Hard non-retryable auth/config error: stop immediately
                    if (!classified.retryableSameModel && !classified.allowFallbackModel) {
                        return {
                            ok: false,
                            code: classified.code,
                            httpStatus: classified.httpStatus,
                            retryAfterMs: classified.retryAfterMs,
                            attempts: totalAttempts,
                            modelUsed: null
                        };
                    }

                    // Should we retry the SAME model?
                    const hasFallbackRemaining = modelIndex < modelChain.length - 1;
                    const hasMoreRetriesOnModel = attempt < allowedRetries;
                    const remainingNow = requestBudgetMs - (nowFn() - startTime);

                    // If another fallback model is available and this attempt failed slowly (e.g. 10-16s 503/timeout)
                    // or remaining budget is needed to give fallback models a fair chance, fail over immediately.
                    const shouldFailOverFast = hasFallbackRemaining && (
                        attemptDurationMs >= SLOW_FAILURE_THRESHOLD_MS ||
                        remainingNow <= FALLBACK_RESERVE_MS
                    );

                    if (classified.retryableSameModel && hasMoreRetriesOnModel && !shouldFailOverFast) {
                        const expDelay = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempt));
                        const jitter = Math.floor(random() * Math.min(400, expDelay * 0.5));
                        let delayMs = expDelay + jitter;

                        // Respect provider-supplied retry delay when present
                        if (classified.retryAfterMs != null && classified.retryAfterMs > 0) {
                            if (classified.retryAfterMs > maxBackoffMs) {
                                // Provider asks to wait longer than our short retry cap;
                                // do not bypass rate limit — move to fallback model instead
                                break;
                            }
                            delayMs = Math.max(delayMs, classified.retryAfterMs);
                        }

                        const remainingAfterWait = requestBudgetMs - (nowFn() - startTime) - delayMs;
                        if (remainingAfterWait <= 1000) {
                            break; // Not enough budget to retry this model; let loop check fallback/exit
                        }

                        await sleep(delayMs);
                        continue;
                    }

                    // Otherwise move on to next fallback model
                    break;
                }
            }
        }

        return {
            ok: false,
            code: lastFailure.code,
            httpStatus: lastFailure.httpStatus,
            retryAfterMs: lastFailure.retryAfterMs,
            attempts: totalAttempts,
            modelUsed: null
        };
    }

    function getUserFacingError(code) {
        switch (code) {
            case 'MISSING_API_KEY':
            case 'INVALID_API_KEY':
                return {
                    httpStatus: 503,
                    error: 'The AI assistant is currently unavailable due to a service configuration issue. Please try again later.'
                };
            case 'DAILY_QUOTA_EXHAUSTED':
                return {
                    httpStatus: 429,
                    error: 'The AI assistant has reached its daily usage limit. Please try again later.'
                };
            case 'RATE_LIMITED':
                return {
                    httpStatus: 429,
                    error: 'The AI assistant is handling too many requests right now. Please wait a moment and try again.'
                };
            case 'TIMEOUT':
                return {
                    httpStatus: 504,
                    error: 'The AI assistant took too long to respond. Please try again.'
                };
            case 'TRANSIENT_UNAVAILABLE':
            case 'MODEL_UNAVAILABLE':
                return {
                    httpStatus: 503,
                    error: 'The AI service is experiencing temporary high demand. Please try again in a moment.'
                };
            default:
                return {
                    httpStatus: 502,
                    error: 'The AI service is temporarily unavailable. Please try again in a moment.'
                };
        }
    }

    async function handleMessage({ message, history = [], requestId = 'req' }) {
        const startTime = nowFn();
        const trimmedMessage = message.trim();
        const cleanHistory = sanitizeHistory(history);
        const intent = detectIntent(trimmedMessage);

        // Preserve club context on short follow-ups (e.g. "How do I pay for it?" after asking about club events)
        if (!intent.isClubRelated && intent.kind === 'ai' && cleanHistory.length > 0) {
            const recentText = cleanHistory.slice(-4).map(h => h.parts[0].text).join(' ');
            if (/\b(cuet computer club|cuet|club event|club contest|member dashboard|bkash|nagad|rocket|executive committee|general secretary|president)\b/i.test(recentText)) {
                intent.isClubRelated = true;
            }
        }

        // 1. Fast deterministic greetings / thanks
        if (intent.kind === 'greeting') {
            return {
                httpStatus: 200,
                body: {
                    success: true,
                    reply: 'Hello! I am the CUET Computer Club AI Assistant. Ask me about club events, contests, news, membership, or any general programming, tech, or study question — in English, Bangla, or Banglish!'
                },
                meta: { source: 'deterministic_greeting', latencyMs: nowFn() - startTime }
            };
        }
        if (intent.kind === 'thanks') {
            return {
                httpStatus: 200,
                body: {
                    success: true,
                    reply: "You're welcome! Let me know if you need help with anything else."
                },
                meta: { source: 'deterministic_thanks', latencyMs: nowFn() - startTime }
            };
        }

        // 2. Fetch verified public club data ONLY if club-related
        let clubData = { dbAvailable: true, events: [], contests: [], news: [] };
        if (intent.isClubRelated) {
            clubData = await getPublicClubData();
        }

        // 3. Direct simple public database lookups (no Gemini required)
        if (intent.kind === 'direct_db_lookup') {
            const dbReply = buildDeterministicClubReply(intent, clubData);
            if (dbReply) {
                return {
                    httpStatus: 200,
                    body: {
                        success: true,
                        reply: dbReply
                    },
                    meta: {
                        source: clubData.dbAvailable ? 'direct_database' : 'database_unavailable_notice',
                        latencyMs: nowFn() - startTime
                    }
                };
            }
        }

        // 4. Call Gemini with retry + fallback
        const systemInstruction = buildSystemInstruction(intent, clubData);

        const aiResult = await generateWithRetryAndFallback({
            message: trimmedMessage,
            history: cleanHistory,
            systemInstruction,
            requestId
        });

        if (aiResult.ok) {
            return {
                httpStatus: 200,
                body: {
                    success: true,
                    reply: aiResult.reply
                },
                meta: {
                    source: aiResult.usedFallbackModel ? 'gemini_fallback' : 'gemini_primary',
                    model: aiResult.modelUsed,
                    attempts: aiResult.attempts,
                    latencyMs: nowFn() - startTime
                }
            };
        }

        // 5. Graceful verified local/DB fallback for club-related questions when Gemini fails
        if (intent.isClubRelated) {
            const fallbackReply = buildDeterministicClubReply(intent, clubData);
            if (fallbackReply) {
                return {
                    httpStatus: 200,
                    body: {
                        success: true,
                        reply: fallbackReply
                    },
                    meta: {
                        source: 'club_local_fallback',
                        upstreamErrorCode: aiResult.code,
                        attempts: aiResult.attempts,
                        latencyMs: nowFn() - startTime
                    }
                };
            }
        }

        // 6. Clean, safe HTTP error response
        const mapped = getUserFacingError(aiResult.code);
        const retryAfterSeconds = aiResult.retryAfterMs
            ? Math.max(1, Math.ceil(aiResult.retryAfterMs / 1000))
            : undefined;

        return {
            httpStatus: mapped.httpStatus,
            retryAfterSeconds,
            body: {
                success: false,
                error: mapped.error
            },
            meta: {
                source: 'error',
                errorCode: aiResult.code,
                attempts: aiResult.attempts,
                latencyMs: nowFn() - startTime
            }
        };
    }

    function clearCache() {
        dbCache.events = [];
        dbCache.contests = [];
        dbCache.news = [];
        dbCache.lastFetch = 0;
        dbCache.hasValidData = false;
        dbCache.inFlight = null;
    }

    return {
        handleMessage,
        getPublicClubData,
        clearCache
    };
}

module.exports = {
    createChatbotEngine,
    PUBLIC_CONTENT_FILTER,
    VERIFIED_CLUB_KNOWLEDGE,
    DEFAULT_PRIMARY_MODEL,
    DEFAULT_FALLBACK_MODEL,
    DEFAULT_EXTRA_FALLBACKS,
    MAX_MESSAGE_LENGTH,
    MAX_HISTORY_ITEMS,
    resolveModelChain,
    classifyGeminiError,
    parseRetryAfterMs,
    sanitizeHistory,
    detectIntent,
    partitionAndSortByDate,
    buildDeterministicClubReply,
    redactSecrets,
    logEvent
};
