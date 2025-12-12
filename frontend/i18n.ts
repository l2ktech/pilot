// i18n配置
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

// 支持的语言列表
export const locales = ['en', 'zh-CN'] as const;
export type Locale = typeof locales[number];

export default getRequestConfig(async ({ locale }) => {
  // 验证locale是否支持
  if (!locales.includes(locale as Locale)) notFound();

  return {
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
