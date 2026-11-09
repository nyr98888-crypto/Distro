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
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "he") setLocaleState(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
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
      format(dictionary[locale][key], vars),
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

  // Avoid flashing wrong dir before localStorage is read
  if (!ready) {
    return (
      <I18nContext.Provider value={value}>
        <div dir="rtl" lang="he" className="min-h-screen bg-[#F8FAFC]">
          {children}
        </div>
      </I18nContext.Provider>
    );
  }

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
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-sm ${className || ""}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("he")}
        className={`rounded-full px-3 py-1.5 transition ${
          locale === "he"
            ? "bg-[#2563EB] text-white shadow-sm"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        עברית
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded-full px-3 py-1.5 transition ${
          locale === "en"
            ? "bg-[#2563EB] text-white shadow-sm"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        English
      </button>
    </div>
  );
}
