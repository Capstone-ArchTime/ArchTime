import { useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

export function useUnsavedChanges(dirty: boolean) {
  const { modal } = App.useApp();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  }, [dirty]));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const dialog = modal.confirm({
      title: 'Leave without saving?',
      content: 'You have unsaved changes. Stay on this page to save them, or discard them and continue.',
      okText: 'Discard changes', cancelText: 'Keep editing', okButtonProps: { danger: true },
      onOk: () => blocker.proceed(), onCancel: () => blocker.reset(),
    });
    return () => dialog.destroy();
  }, [blocker, modal]);
}
