import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { en, type Message, type MessageKey } from "@/locales/en";
import { uk } from "@/locales/uk";

// Interface languages. Recipe and ingredient names come from the database and
// stay as they are (there are no Ukrainian names for them yet).
export type Lang = "en" | "uk";

export const LANGUAGES: { code: Lang; short: string; name: string }[] = [
  { code: "en", short: "EN", name: "English" },
  { code: "uk", short: "УКР", name: "Українська" },
];

const MESSAGES: Record<Lang, Record<MessageKey, Message>> = { en, uk };
// en-GB for day-first dates and a Monday-first week
const LOCALES: Record<Lang, string> = { en: "en-GB", uk: "uk-UA" };
const STORAGE_KEY = "nutrition_lang";

type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

// {name} placeholders are filled from vars. Plural messages pick their form
// from vars.count: English has one/other, Ukrainian one/few/many.
function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  let message = MESSAGES[lang][key] ?? en[key];
  if (typeof message !== "string") {
    const form = new Intl.PluralRules(LOCALES[lang]).select(Number(vars?.count ?? 0));
    message = (message as Record<string, string | undefined>)[form] ?? message.other;
  }
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: Translate;
}

// The English default also covers anything rendered outside the provider
const I18nContext = createContext<I18nValue>({
  lang: "en",
  locale: LOCALES.en,
  setLang: () => {},
  t: (key, vars) => translate("en", key, vars),
});

function savedOrBrowserLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "uk") return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.languages?.some((l) => l.toLowerCase().startsWith("uk")) ? "uk" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // The server always renders English; the saved choice is applied once the
  // page runs in the browser (app pages wait for sign-in there anyway)
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => setLangState(savedOrBrowserLang()), []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not remembered, but still switched for this visit
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, locale: LOCALES[lang], setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={cn("inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-semibold", className)}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          title={l.name}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={cn(
            "rounded-full px-2.5 py-1 transition",
            lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
