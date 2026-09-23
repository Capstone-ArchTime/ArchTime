import { App } from "antd";
import { useCallback } from "react";

export function useComingSoon() {
  const { message } = App.useApp();

  return useCallback(
    (feature: string) => {
      message.info(`${feature} is coming soon.`);
    },
    [message]
  );
}
