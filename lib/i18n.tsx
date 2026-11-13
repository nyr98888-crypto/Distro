"use client";

import * as React from "react";

export type Locale = "he" | "en";

const STORAGE_KEY = "distro_locale";

const dictionary = {
  he: {
    brandTagline: "ניהול הפצות לקבוצות",
    navCampaigns: "קמפיינים",
    navGroups: "קבוצות",
    navTemplates: "תבניות",
    navActivity: "פעילות",
    navSettings: "הגדרות",
    menu: "תפריט",
    closeMenu: "סגור תפריט",
    locallyConnected: "מחובר מקומית",
    notConnected: "לא מחובר לפייסבוק",
    connectedActive: "מחובר · פעיל",
    addFacebookAccount: "הוסף חשבון פייסבוק",
    removeAccount: "הסר חשבון",
    groupsCount: "{n} קבוצות",
    loadingAccounts: "טוען חשבונות…",
    noAccountsYet: "עדיין אין חשבונות שמורים",
    welcome: "ברוך הבא, {name}",
    welcomeSubtitle: "כאן מנהלים את כל הקמפיינים וההפצות שלך",
    newCampaign: "+ יצירת קמפיין חדש",
    calendarCta: "יומן תזמונים",
    statGroups: "קבוצות פייסבוק",
    statPublished: "פוסטים שפורסמו",
    statScheduled: "פוסטים מתוזמנים",
    searchCampaigns: "חפש לפי שם קמפיין, מלל או קבוצה...",
    viewTable: "טבלה",
    viewCalendar: "יומן",
    colCampaign: "קמפיין",
    colSchedule: "תזמון",
    colGroups: "קבוצות",
    colStatus: "סטטוס",
    colActions: "פעולות",
    statusActive: "פעיל",
    statusScheduled: "מתוזמן",
    statusPaused: "מושהה",
    statusCompleted: "הושלם",
    statusPending: "ממתין",
    emptyCampaigns: "אין קמפיינים להצגה.",
    createFirst: "צרו את הראשון",
    syncGroups: "סנכרן קבוצות",
    settingsTitle: "הגדרות",
    settingsSubtitle: "חשבון, תוסף, פרטיות ורישיון — הכל במקום אחד",
    settingsAccount: "חשבון פייסבוק",
    settingsAccountHint:
      "להחלפת משתמש במחשב משותף — בחרו חשבון מהרשימה או הוסיפו חשבון חדש. הקבוצות יסונכרנו מחדש אוטומטית.",
    settingsExtension: "תוסף Chrome",
    settingsExtensionHint:
      "התוסף מריץ פרסומים מתוזמנים ישירות במחשב שלכם — בטוח ופרטי.",
    tabPrivacy: "מדיניות פרטיות ואבטחה",
    tabTerms: "תנאי שימוש והסכם משתמש",
    tabAbout: "אודות והפעלת רישיון",
    privacyTitle: "מדיניות פרטיות ואבטחה",
    termsTitle: "תנאי שימוש והסכם משתמש",
    aboutTitle: "אודות DISTRO",
    versionLabel: "גרסה",
    licenseLabel: "רישיון",
    licenseValue: "גישה מלאה לכל החיים",
    checkUpdates: "בדוק עדכונים",
    checkingUpdates: "בודק…",
    updatesCurrent: "אתם מעודכנים לגרסה האחרונה",
    support: "תמיכה",
    wizardNew: "יצירת קמפיין חדש",
    wizardEdit: "עריכת קמפיין",
    stepContent: "תוכן ומדיה",
    stepGroups: "קבוצות",
    stepTiming: "תזמון",
    next: "המשך",
    back: "הקודם",
    publishNow: "פרסם עכשיו",
    savePublish: "שמור ופרסם קמפיין",
    close: "סגור",
    helperCampaignName: "שם פנימי לעצמכם בלבד — לא מופיע בפייסבוק",
    helperPostContent: "הטקסט שיופיע בפוסט בכל הקבוצות שבחרתם",
    helperImage: "תמונה אופציונלית שמצורפת לפוסט",
    helperWhatsapp: "הוסיפו קישור וואטסאפ בסוף הפוסט לפניות מלקוחות",
    helperPresets: "שמרו או טענו רשימת קבוצות לשימוש חוזר",
    helperGroupPick: "סמנו את הקבוצות שבהן הפוסט יפורסם",
    helperScheduleType: "בחרו מתי הקמפיין יתחיל לרוץ",
    helperDelay:
      "זמן המתנה בין קבוצה לקבוצה - שומר על חשבונך מפני חסימות פייסבוק",
    helperExecution:
      "מומלץ להריץ דרך התוסף במחשב שלכם — בטוח יותר ופרטי יותר",
    loading: "טוען…",
    landingNavSupport: "תמיכה",
    landingNavPrivacy: "מדיניות פרטיות",
    landingNavSignIn: "כניסה למערכת",
    landingHeroTitle: "ניהול ופרסום קמפיינים חכם לקבוצות פייסבוק",
    landingHeroSubtitle:
      "סנכרן את כל הקבוצות שלך ללוח בקרה אחד. תזמן ופרסם פוסטים בלחיצה אחת ישירות מהמחשב או הנייד - ללא שרתים, ובאבטחה מלאה לחשבון שלך.",
    landingCtaStart: "התחל עכשיו בחינם",
    landingCtaPrivacy: "מדיניות פרטיות ואבטחה",
    landingFeature1Title: "סנכרון קבוצות מקומי",
    landingFeature1Body:
      "התוסף מזהה אוטומטית את הקבוצות שאתה חבר בהן בלחיצה אחת.",
    landingFeature2Title: "תזמון ופרסום חכם",
    landingFeature2Body:
      "צור פוסטים עם תמונות וקישורי וואטסאפ מותאמים, ותזמן אותם מראש.",
    landingFeature3Title: "הגנה מלאה על החשבון",
    landingFeature3Body:
      "הפרסום מתבצע ישירות מהדפדפן שלך עם השהיות הגנה (Anti-Ban). שום סיסמה לא נשלחת לשרת חיצוני.",
    loginTitle: "התחברות ל-DISTRO",
    loginSubtitle: "התחבר לחשבון שלך או סנכרן עם תוסף הכרום",
    continueWithFacebook: "התחבר עם פייסבוק",
    continueWithFacebookHint: "התחברות והרשמה בלחיצה אחת",
    loginWithEmail: "או המשך עם אימייל וסיסמה",
    loginEmail: "כתובת אימייל",
    loginPassword: "סיסמה",
    loginSubmit: "התחברות",
    registerSubmit: "הרשמה",
    registerHint: "לפחות 8 תווים",
    registerFailed: "ההרשמה נכשלה",
    loginOr: "או",
    loginFailed: "ההתחברות נכשלה",
    installTitle: "התקנת תוסף DISTRO",
    installSubtitle:
      "התקינו את התוסף מחנות Chrome, סנכרנו קבוצות — והעמוד יעביר אתכם אוטומטית ללוח הבקרה.",
    installWebStore: "התקן מ-Chrome Web Store בלחיצה אחת",
    installAfterTitle: "אחרי ההתקנה",
    installAfterBody:
      "פתחו את פייסבוק, לחצו על אייקון DISTRO בסרגל התוספים, ולחצו על סנכרון קבוצות.",
    extensionDownloadCta: "הורד והתקן את תוסף DISTRO לכרום",
    extensionConnected: "התוסף מחובר",
    extensionBannerHint:
      "נדרש לסנכרון קבוצות ולפרסום מקומי — התקינו מחנות Chrome ואז חזרו לכאן.",
    privacyLastUpdated: "עודכן לאחרונה: נובמבר 2026",
    privacyIntro:
      'DISTRO ("אנחנו", "שלנו" או "התוסף") נבנה במודל פרטיות מקומי־קודם (local-first).',
    privacyS1: "1. מידע שאנחנו ניגשים אליו",
    privacyS1a: "מצב סשן פייסבוק פעיל לאימות התחברות.",
    privacyS1b: "מטא־דאטה של קבוצות (שמות ומזהים של קבוצות שהמשתמש חבר בהן).",
    privacyS1c: "תוכן פוסטים, תמונות ותזמונים שהמשתמש מספק ישירות.",
    privacyS2: "2. כיצד המידע בשימוש",
    privacyS2Body:
      "כל הטיפול בנתונים, האינטראקציות עם פייסבוק והפרסום האוטומטי מתבצעים בסביבת הדפדפן המקומית של המשתמש. אנחנו לא מפעילים מנועי סקרייפינג חיצוניים.",
    privacyS3: "3. העברת מידע ושיתוף עם צד שלישי",
    privacyS3a:
      "אנחנו לא מעבירים, שומרים, מוכרים או מממשים סיסמאות, עוגיות או נתוני חשבון פייסבוק אישיים לשרתי צד שלישי.",
    privacyS3b:
      "נתוני קמפיינים ותזמונים נשמרים במסדי נתונים מאובטחים רק כדי לספק את פונקציונליות הקמפיין לבעל החשבון המאומת.",
    privacyS4: "4. שליטת המשתמש",
    privacyS4Body:
      "ניתן לנתק את פרופיל הפייסבוק, למחוק קמפיינים מתוזמנים או להסיר את התוסף בכל עת כדי למחוק מצב מקומי.",
    privacyS5: "5. יצירת קשר",
    privacyContact: "לפניות:",
    privacyBackHome: "חזרה לדף הבית",
  },
  en: {
    brandTagline: "Group distribution made simple",
    navCampaigns: "Campaigns",
    navGroups: "Groups",
    navTemplates: "Templates",
    navActivity: "Activity",
    navSettings: "Settings",
    menu: "Menu",
    closeMenu: "Close menu",
    locallyConnected: "Locally Connected",
    notConnected: "Not connected to Facebook",
    connectedActive: "Connected · Active",
    addFacebookAccount: "Add Facebook account",
    removeAccount: "Remove account",
    groupsCount: "{n} groups",
    loadingAccounts: "Loading accounts…",
    noAccountsYet: "No saved accounts yet",
    welcome: "Welcome, {name}",
    welcomeSubtitle: "Manage all your campaigns and distributions here",
    newCampaign: "+ New Campaign",
    calendarCta: "Activity Calendar",
    statGroups: "Facebook Groups",
    statPublished: "Posts Published",
    statScheduled: "Scheduled Posts",
    searchCampaigns: "Search by campaign name, text, or group...",
    viewTable: "Table",
    viewCalendar: "Calendar",
    colCampaign: "Campaign",
    colSchedule: "Schedule",
    colGroups: "Groups",
    colStatus: "Status",
    colActions: "Actions",
    statusActive: "Active",
    statusScheduled: "Scheduled",
    statusPaused: "Paused",
    statusCompleted: "Completed",
    statusPending: "Pending",
    emptyCampaigns: "No campaigns yet.",
    createFirst: "Create your first",
    syncGroups: "Sync Groups",
    settingsTitle: "Settings",
    settingsSubtitle: "Account, extension, privacy, and license — all in one place",
    settingsAccount: "Facebook Account",
    settingsAccountHint:
      "On a shared computer, switch accounts from the list or add a new one. Groups will re-sync automatically.",
    settingsExtension: "Chrome Extension",
    settingsExtensionHint:
      "The extension runs scheduled posts on your local machine — private and secure.",
    tabPrivacy: "Privacy & Security",
    tabTerms: "Terms of Service",
    tabAbout: "About & License",
    privacyTitle: "Privacy Policy & Security",
    termsTitle: "Terms of Service & User Agreement",
    aboutTitle: "About DISTRO",
    versionLabel: "Version",
    licenseLabel: "License",
    licenseValue: "Lifetime Access",
    checkUpdates: "Check for Updates",
    checkingUpdates: "Checking…",
    updatesCurrent: "You're on the latest version",
    support: "Support",
    wizardNew: "Create New Campaign",
    wizardEdit: "Edit Campaign",
    stepContent: "Content & Media",
    stepGroups: "Groups",
    stepTiming: "Timing",
    next: "Next",
    back: "Back",
    publishNow: "Publish Now",
    savePublish: "Save & Publish Campaign",
    close: "Close",
    helperCampaignName: "Internal name for you only — not shown on Facebook",
    helperPostContent: "The text that will appear in every selected group",
    helperImage: "Optional image attached to the post",
    helperWhatsapp: "Add a WhatsApp link at the end for customer inquiries",
    helperPresets: "Save or load a reusable group list",
    helperGroupPick: "Select the groups where this post will be published",
    helperScheduleType: "Choose when the campaign should start running",
    helperDelay:
      "Wait time between groups — helps protect your account from Facebook blocks",
    helperExecution:
      "Recommended: run via the Chrome extension on your computer — safer and more private",
    loading: "Loading…",
    landingNavSupport: "Support",
    landingNavPrivacy: "Privacy Policy",
    landingNavSignIn: "Sign In",
    landingHeroTitle: "Smart campaign management for Facebook Groups",
    landingHeroSubtitle:
      "Sync all your groups into one dashboard. Schedule and publish posts in one click from desktop or mobile — no external publishing servers, with full account security.",
    landingCtaStart: "Start free now",
    landingCtaPrivacy: "Privacy & Security Policy",
    landingFeature1Title: "Local group sync",
    landingFeature1Body:
      "The extension automatically detects the Facebook groups you belong to — in one click.",
    landingFeature2Title: "Smart scheduling & publishing",
    landingFeature2Body:
      "Create posts with images and tailored WhatsApp links, then schedule them ahead of time.",
    landingFeature3Title: "Full account protection",
    landingFeature3Body:
      "Publishing runs directly in your browser with anti-ban delays. No password is ever sent to an external server.",
    loginTitle: "Sign in to DISTRO",
    loginSubtitle: "Sign in to your account or sync with the Chrome extension",
    continueWithFacebook: "Connect with Facebook",
    continueWithFacebookHint: "One-click sign-up and sign-in",
    loginWithEmail: "Or continue with email and password",
    loginEmail: "Email address",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    registerSubmit: "Sign up",
    registerHint: "At least 8 characters",
    registerFailed: "Sign-up failed",
    loginOr: "or",
    loginFailed: "Sign-in failed",
    installTitle: "Install the DISTRO extension",
    installSubtitle:
      "Install from the Chrome Web Store, sync your groups — and this page will take you to the dashboard automatically.",
    installWebStore: "Install from Chrome Web Store in one click",
    installAfterTitle: "After installing",
    installAfterBody:
      "Open Facebook, click the DISTRO icon in the extensions toolbar, then Sync Groups.",
    extensionDownloadCta: "Download & install the DISTRO Chrome extension",
    extensionConnected: "Extension Connected",
    extensionBannerHint:
      "Required for group sync and local publishing — install from the Chrome Web Store, then return here.",
    privacyLastUpdated: "Last updated: November 2026",
    privacyIntro:
      'DISTRO ("we", "our", or "the extension") is designed with a strict local-first privacy model.',
    privacyS1: "1. Information We Access",
    privacyS1a: "Active Facebook session state to verify authentication.",
    privacyS1b:
      "Group metadata (names and IDs of groups the user has joined).",
    privacyS1c:
      "Post content, images, and schedules provided directly by the user.",
    privacyS2: "2. How Information is Used",
    privacyS2Body:
      "All data handling, Facebook interactions, and automated publishing execute strictly within the user's local browser environment. We do not operate external scraping engines.",
    privacyS3: "3. Data Transmission & Third-Party Sharing",
    privacyS3a:
      "We DO NOT transmit, store, sell, or monetize user login credentials, cookies, or personal Facebook account data to any third-party servers.",
    privacyS3b:
      "Campaign data and schedules are kept on secure local databases strictly to provide campaign functionality to the authenticated account owner.",
    privacyS4: "4. User Control",
    privacyS4Body:
      "Users can disconnect their Facebook profile, delete scheduled campaigns, or uninstall the extension at any time to purge all local state.",
    privacyS5: "5. Contact",
    privacyContact: "For inquiries:",
    privacyBackHome: "Back to home",
  },
} as const;

export type TranslationKey = keyof typeof dictionary.he;

type I18nContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function format(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("he");

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "he") setLocaleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      format(dictionary[locale][key] ?? dictionary.he[key] ?? String(key), vars),
    [locale]
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: locale === "he" ? "rtl" : "ltr",
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  // Keep a single stable provider tree (no conditional wrappers).
  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-white/80 px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur ${className || ""}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("he")}
        className={`rounded px-1.5 py-0.5 transition ${
          locale === "he"
            ? "bg-slate-900 text-white"
            : "hover:text-slate-800"
        }`}
      >
        עברית
      </button>
      <span aria-hidden className="text-slate-300">
        |
      </span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded px-1.5 py-0.5 transition ${
          locale === "en"
            ? "bg-slate-900 text-white"
            : "hover:text-slate-800"
        }`}
      >
        English
      </button>
    </div>
  );
}
