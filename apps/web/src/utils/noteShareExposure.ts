import i18n from '@/i18n';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import type { ApiResponse } from '@/http/request';

export function isNoteShareExposureConfirmation(response: ApiResponse | null | undefined) {
  return (
    Number(response?.status) === 409 &&
    String(response?.data?.code || '') === 'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED'
  );
}

export function requestNoteShareExposureConfirmation(
  response: ApiResponse | null | undefined,
  onConfirm: () => void | Promise<void>,
  onCancel?: () => void,
) {
  if (!isNoteShareExposureConfirmation(response)) return false;
  const roots = Array.isArray(response?.data?.details?.roots) ? response.data.details.roots : [];
  const names = roots
    .map((item: any) => String(item?.title || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('、');
  Alert.alert({
    title: i18n.global.t('noteShare.exposureTitle'),
    content: i18n.global.t('noteShare.exposureConfirm', { names: names || i18n.global.t('note.untitled') }),
    okText: i18n.global.t('noteShare.confirmExposure'),
    onOk: onConfirm,
    onCancel,
  });
  return true;
}

export function confirmNoteShareExposure(response: ApiResponse | null | undefined) {
  if (!isNoteShareExposureConfirmation(response)) return Promise.resolve<boolean | null>(null);
  return new Promise<boolean | null>((resolve) => {
    requestNoteShareExposureConfirmation(response, () => resolve(true), () => resolve(false));
  });
}
