import { App } from 'antd';

export function useComingSoon() {
  const { message } = App.useApp();
  return (feature: string) => { void message.info(`${feature} is coming soon.`); };
}
