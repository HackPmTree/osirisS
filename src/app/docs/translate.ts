/* ── Словарь перевода интерфейса документации ──
 * Англоязычные тексты в docs-* файлах (заголовки разделов, описания API,
 * подписи кнопок) переводятся на русский при рендере. Точное совпадение
 * строки; не найденные в словаре строки остаются как есть.
 */
export const RU: Record<string, string> = {
  // Общие метки
  'Guide': 'Руководство',
  'API Reference': 'Справочник API',
  'On this page': 'На этой странице',
  'Back to top': 'Наверх',
  'Search': 'Поиск',
  'Search documentation': 'Поиск по документации',
  'Launch Map': 'Открыть карту',
  'Docs': 'Документация',
  'Open Source · MIT': 'Открытый код · MIT',
  'MIT Licensed': 'Лицензия MIT',
  'Report an issue': 'Сообщить об ошибке',
  'GitHub repository': 'Репозиторий GitHub',
  'Toggle navigation': 'Показать меню',
  'Copied': 'Скопировано',
  'Copy to clipboard': 'Скопировать',
  'Copy': 'Копировать',
  'Note': 'Примечание',
  'Caution': 'Внимание',
  'Tip': 'Совет',
  'Send request': 'Отправить запрос',
  'Loading…': 'Загрузка…',
  'Parameters': 'Параметры',
  'Returns': 'Возвращает',
  'Example response': 'Пример ответа',
  'Try it': 'Попробовать',
  'Response': 'Ответ',
  'No parameters': 'Параметров нет',
  'Request failed': 'Запрос не выполнен',
  '← Previous': '← Назад',
  'Next →': 'Далее →',
  'Endpoints': 'Эндпоинтов',
  'Live feeds': 'Живых лент',
  'Keys required': 'Ключей требуется',
  'endpoint, no key\n              required.': 'эндпоинт, ключи не требуются.',
  // Разделы руководства
  'Overview': 'Обзор',
  'Quick Start': 'Быстрый старт',
  'Self-Hosting': 'Самостоятельный хостинг',
  'Configuration': 'Конфигурация',
  'Interface Guide': 'Руководство по интерфейсу',
  'OI & MCP': 'OI и MCP',
  'Keyboard Shortcuts': 'Горячие клавиши',
  'Conventions': 'Соглашения',
  // Группы API
  'System': 'Система',
  'Aviation & Space': 'Авиация и космос',
  'Earth & Environment': 'Земля и окружающая среда',
  'Geopolitical': 'Геополитика',
  'Media & Markets': 'Медиа и рынки',
  'Surveillance & Infrastructure': 'Наблюдение и инфраструктура',
  'Cyber Threat': 'Киберугрозы',
  'OSINT Toolkit': 'Инструменты OSINT',
  'Recon Scanner': 'RECON-сканер',
  'Entity Graph': 'Граф сущностей',
  'AI Analysis': 'Анализ на ИИ',
  'OI (Assist & Prediction)': 'OI (ассистент и прогнозирование)',
  'Polybolos SDK': 'SDK Polybolos',
  'Webhooks': 'Вебхуки',
};
export function ru(s?: string | null): string {
  if (!s) return s as any;
  const t = String(s).trim();
  return RU[t] ?? t;
}
