import { getRequestConfig } from "next-intl/server";
import { getLocaleFromCookies } from "./locale";

// No locale in the URL: the language is a cookie set by the toggle in the
// header, and English is the default.
export default getRequestConfig(async () => {
  const locale = await getLocaleFromCookies();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
