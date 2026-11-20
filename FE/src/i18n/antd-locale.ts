import type { Locale } from 'antd/es/locale';
import { addLanguageLoader, type Language } from './index.ts';

// antd's built-in texts (date pickers, tables, pagination, OK / Cancel). English is antd's default, so nothing is
// bundled for it; the Vietnamese locale is fetched together with the Vietnamese dictionary.

let vietnamese: Locale | undefined;

addLanguageLoader(async language => {
  if (language === 'vi' && !vietnamese) vietnamese = (await import('antd/locale/vi_VN')).default;
});

/** For ConfigProvider's `locale`: undefined means antd's own English. */
export const antdLocaleFor = (language: Language): Locale | undefined => (language === 'vi' ? vietnamese : undefined);
