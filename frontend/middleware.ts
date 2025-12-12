import createMiddleware from 'next-intl/middleware';
import { locales } from './i18n';

export default createMiddleware({
  // 所有支持的语言
  locales,
  
  // 默认语言（中文）
  defaultLocale: 'zh-CN',
  
  // 自动检测用户浏览器语言
  localeDetection: true,
  
  // URL策略：始终显示locale前缀
  localePrefix: 'always'
});

export const config = {
  // 匹配所有路径，除了api、_next/static等
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
