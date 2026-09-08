import Alert from '@/components/base/BasicComponents/BModal/Alert';

export function confirmTodoDiscard(dirty: boolean, t: (key: string) => string): Promise<boolean> {
  if (!dirty) return Promise.resolve(true);
  return new Promise((resolve) =>
    Alert.alert({
      title: t('todoWorkspace.discard'),
      content: t('todoWorkspace.discardHint'),
      okText: t('todoWorkspace.discardAction'),
      cancelText: t('todoWorkspace.keepEditing'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  );
}
