/** Ключи UI-строк (шелл + настройки). Расширяйте при переводе других экранов. */
const RU = {
  shell_skip_main: "Перейти к основному контенту",
  shell_aria_open_nav: "Открыть навигацию",
  shell_aria_close_nav: "Закрыть навигацию",
  shell_nav_heading: "Навигация",
  shell_my_dashboard: "Мой дашборд",
  shell_login: "Вход",
  shell_settings: "Настройки",
  shell_close: "Закрыть",
  shell_logo_alt: "Drivee Analytics",
  shell_forbidden_kicker: "403 · Доступ ограничен",
  shell_forbidden_title: "У вашей роли нет доступа к этой странице",
  shell_forbidden_body:
    "Перейдите на доступный дашборд или на главную — роль задаётся при входе и в профиле.",
  shell_open_my_dashboard: "Открыть мой дашборд",
  shell_to_home: "На главную",

  nav_home: "Обзор",
  nav_scenarios: "Сценарии",
  nav_templates: "Шаблоны",
  nav_reports: "Отчёты",
  nav_history: "История",
  nav_semantic_dictionary: "Бизнес-термины",
  nav_dictionary: "Словарь",
  nav_corrections: "Коррекции",
  nav_data_upload: "Загрузка БД (CSV)",
  nav_settings: "Настройки",
  nav_dashboard: "Дашборд",

  settings_page_title: "Настройки",
  settings_page_subtitle:
    "Профиль — форма ниже (можно отправить по Enter). Режим PDF сохраняется сразу при выборе; он же записывается в браузер для кнопок «PDF по умолчанию».",
  settings_section_profile: "Профиль",
  settings_profile_hint:
    "Имя и часовой пояс. Локаль: при выборе en/ru значение сразу сохраняется на сервере — язык шапки и меню обновится.",
  settings_first_name: "Имя",
  settings_last_name: "Фамилия",
  settings_timezone_label: "Часовой пояс (IANA)",
  settings_timezone_hint:
    "Выберите значение из подсказок или введите любой поддерживаемый IANA-идентификатор — сервер проверит его через базу tzdata.",
  settings_locale_label: "Локаль",
  settings_locale_option_ru: "Русский (ru)",
  settings_locale_option_en: "English (en)",
  settings_save_profile: "Сохранить профиль",
  settings_saving: "Сохранение…",
  settings_saved_profile: "Профиль сохранён.",
  settings_save_profile_error: "Не удалось сохранить профиль.",
  settings_section_pdf: "PDF по умолчанию",
  settings_pdf_hint: "Нажмите режим — запрос уйдёт на сервер сразу (без отдельной кнопки «Сохранить»).",
  settings_pdf_saved: "Режим PDF сохранён на сервере.",
  settings_pdf_save_error: "Не удалось сохранить режим PDF.",
  settings_pdf_help_compact: "Compact — более короткий и плотный PDF для быстрого просмотра.",
  settings_pdf_help_board: "Board — расширенный executive PDF с секциями и KPI.",
  settings_pdf_compact_btn: "Compact (brief)",
  settings_pdf_board_btn: "Board (executive)"
} as const;

const EN: Record<keyof typeof RU, string> = {
  shell_skip_main: "Skip to main content",
  shell_aria_open_nav: "Open navigation",
  shell_aria_close_nav: "Close navigation",
  shell_nav_heading: "Navigation",
  shell_my_dashboard: "My dashboard",
  shell_login: "Log in",
  shell_settings: "Settings",
  shell_close: "Close",
  shell_logo_alt: "Drivee Analytics",
  shell_forbidden_kicker: "403 · Access restricted",
  shell_forbidden_title: "Your role cannot open this page",
  shell_forbidden_body:
    "Open your dashboard or go to Home — your role is set at sign-in and in your profile.",
  shell_open_my_dashboard: "Open my dashboard",
  shell_to_home: "Go to Home",

  nav_home: "Overview",
  nav_scenarios: "Scenarios",
  nav_templates: "Templates",
  nav_reports: "Reports",
  nav_history: "History",
  nav_semantic_dictionary: "Business terms",
  nav_dictionary: "Dictionary",
  nav_corrections: "Corrections",
  nav_data_upload: "Database upload (CSV)",
  nav_settings: "Settings",
  nav_dashboard: "Dashboard",

  settings_page_title: "Settings",
  settings_page_subtitle:
    "Use the profile form below (press Enter to submit). PDF mode saves as soon as you pick an option; it is also stored in the browser for default PDF buttons.",
  settings_section_profile: "Profile",
  settings_profile_hint:
    "Name and time zone. Locale: choosing en/ru saves immediately to the server — the header and sidebar language updates right away.",
  settings_first_name: "First name",
  settings_last_name: "Last name",
  settings_timezone_label: "Time zone (IANA)",
  settings_timezone_hint:
    "Pick a suggestion or type any supported IANA ID — the server validates it against the tzdata database.",
  settings_locale_label: "Locale",
  settings_locale_option_ru: "Russian (ru)",
  settings_locale_option_en: "English (en)",
  settings_save_profile: "Save profile",
  settings_saving: "Saving…",
  settings_saved_profile: "Profile saved.",
  settings_save_profile_error: "Could not save profile.",
  settings_section_pdf: "Default PDF",
  settings_pdf_hint: "Click a mode — the request is sent immediately (no extra Save button).",
  settings_pdf_saved: "PDF mode saved on the server.",
  settings_pdf_save_error: "Could not save PDF mode.",
  settings_pdf_help_compact: "Compact — shorter, denser PDF for quick review.",
  settings_pdf_help_board: "Board — expanded executive PDF with sections and KPIs.",
  settings_pdf_compact_btn: "Compact (brief)",
  settings_pdf_board_btn: "Board (executive)"
};

export type UiLocale = "ru" | "en";

export type UiMessageKey = keyof typeof RU;

export const UI_MESSAGES = { ru: RU, en: EN } as const;

/** Подписи пунктов бокового меню по `href` (совпадает с `PLATFORM_NAV`). */
export const NAV_LABEL_KEY: Partial<Record<string, UiMessageKey>> = {
  "/notebooks": "nav_home",
  "/scenarios": "nav_scenarios",
  "/templates": "nav_templates",
  "/reports": "nav_reports",
  "/history": "nav_history",
  "/semantic-dictionary": "nav_semantic_dictionary",
  "/dictionary": "nav_dictionary",
  "/corrections": "nav_corrections",
  "/data-upload": "nav_data_upload",
  "/settings": "nav_settings"
};

export function uiMessage(locale: UiLocale, key: UiMessageKey): string {
  if (locale === "en") {
    return EN[key];
  }
  return RU[key];
}
