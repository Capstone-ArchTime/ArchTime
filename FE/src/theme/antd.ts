// The antd theme of a ThemeDefinition: colours from its tokens, the rest from its antd seeds. darkAlgorithm mixes seed
// colours with grey and ignores some overrides, so buttons, tabs, pagination and dropdowns get component tokens.
import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import type { ThemeDefinition } from './types.ts';

const defined = <T extends object>(object: T) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;

export function antdThemeFor(def: ThemeDefinition): ThemeConfig {
  const t = def.tokens;
  const a = def.antd;
  const config: ThemeConfig = {
    algorithm: t['color-scheme'] === 'light' ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
    token: defined({
      colorPrimary: t.accent, colorSuccess: t.success, colorError: t.danger, colorWarning: t.warn,
      colorBgBase: a.base, colorBgContainer: a.container, colorBgElevated: a.elevated,
      colorBorder: a.border, colorBorderSecondary: a.borderSecondary,
      colorText: t.text, colorTextSecondary: a.textSecondary, colorTextTertiary: a.textTertiary, colorTextQuaternary: a.textQuaternary,
      fontFamily: a.fontFamily, borderRadius: a.radius,
      colorLink: t.link, colorLinkHover: t['link-hover'], colorLinkActive: t.link, blue7: t.link, colorTextLightSolid: t['on-fill'],
      ...a.extra?.token,
    }),
    components: {
      ...a.extra?.components,
      Button: defined({
        colorPrimary: t.fill, colorPrimaryHover: t['fill-hover'], colorPrimaryActive: a.fillActive, primaryColor: t['on-fill'], primaryShadow: a.primaryShadow,
        defaultBg: a.defaultBg, defaultBorderColor: a.defaultBorder, defaultColor: t.text,
        defaultHoverColor: a.defaultHoverText, defaultHoverBorderColor: a.defaultHoverBorder, defaultHoverBg: a.defaultHoverBg,
        defaultActiveColor: a.defaultHoverText, defaultActiveBorderColor: a.defaultActiveBorder,
        ...a.extra?.components?.Button,
      }),
      Tabs: { itemSelectedColor: a.tabSelected, itemActiveColor: a.tabSelected, itemHoverColor: a.tabHover, inkBarColor: a.tabInk, ...a.extra?.components?.Tabs },
      Pagination: { itemActiveColor: a.tabSelected, itemActiveColorHover: a.tabHover, ...a.extra?.components?.Pagination },
      Dropdown: { colorPrimary: t.link, ...a.extra?.components?.Dropdown },
    },
  };
  return config;
}
