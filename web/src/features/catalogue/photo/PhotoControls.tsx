import type { PhotoIssueCode } from '@app/contract';
import { useRef, useState, type ChangeEvent } from 'react';
import { errorKey, toApiError } from '../../../api/errors';
import type { RecipeSummary } from '../../../api/types';
import { BottomSheet } from '../../../components/BottomSheet';
import { Icon } from '../../../components/Icon';
import { useOnline } from '../../../components/OfflineBanner';
import { RecipePhoto, usePhotoLoad } from '../../../components/RecipePhoto';
import { useT } from '../../../i18n/LocaleProvider';
import type { MessageKey } from '../../../i18n/translate';
import { useIsCurator } from '../queries';
import styles from './photo.module.css';
import { PhotoResizeError } from './resize';
import { useRemovePhoto, useUploadPhoto } from './usePhotoMutations';

export const PHOTO_ISSUES: Record<PhotoIssueCode, MessageKey> = {
  photo_type: 'catalogue.photo.error.photo_type',
  photo_too_small: 'catalogue.photo.error.photo_too_small',
  photo_too_large: 'catalogue.photo.error.photo_too_large',
  photo_unreadable: 'catalogue.photo.error.photo_unreadable',
  photo_url: 'catalogue.photo.error.photo_url',
  photo_unreachable: 'catalogue.photo.error.photo_unreachable'
};

/** The text of a failed photo change: the issue of the image field when there is one. */
function photoErrorKey(error: unknown): MessageKey {
  if (error instanceof PhotoResizeError) return PHOTO_ISSUES.photo_unreadable;
  const { code, data } = toApiError(error);
  const issue = (data as { issues?: { code?: string }[] } | undefined)?.issues?.find((i) => i.code && i.code in PHOTO_ISSUES)?.code;
  if (code === 'invalid' && issue) return PHOTO_ISSUES[issue as PhotoIssueCode];
  return errorKey(error);
}

type Sheet = 'closed' | 'menu' | 'confirm';

/**
 * The photo of the recipe page (16:9) and, for curators only, its commands (spec W12, section 1):
 * «Aggiungi foto» without a photo, the «Foto» button on it with the sheet to replace or remove it.
 * No optimistic update: the photo changes when the recipe is read again.
 */
export function PhotoControls({ recipe }: { recipe: RecipeSummary }) {
  const t = useT();
  const isCurator = useIsCurator();
  const online = useOnline();
  const upload = useUploadPhoto(recipe.id);
  const remove = useRemovePhoto(recipe.id);
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet>('closed');
  const photo = usePhotoLoad(recipe.photoUrl);
  const busy = upload.isPending || remove.isPending;
  const disabled = !online || busy;
  const error = upload.error ?? remove.error;

  if (!photo.url && !isCurator) return null;

  const pick = () => input.current?.click();
  const chosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file can be chosen again after an error.
    event.target.value = '';
    if (!file) return;
    remove.reset();
    upload.mutate(file, { onSuccess: () => setSheet('closed') });
  };
  const confirmRemove = () => {
    upload.reset();
    remove.mutate(undefined, { onSuccess: () => setSheet('closed') });
  };
  const menuButton = (className?: string) => (
    <button type="button" className={className} disabled={disabled} onClick={() => setSheet('menu')}>
      <Icon name="camera" />{t('catalogue.photo.menu')}
    </button>
  );
  const alert = error ? <p className={`meta-line ${styles.error}`} role="alert">{t(photoErrorKey(error))}</p> : null;

  return (
    <>
      {photo.url ? (
        <RecipePhoto url={photo.url} ratio="16 / 9" className={styles.media} onFail={photo.fail}>
          {isCurator && menuButton(styles.photoButton)}
        </RecipePhoto>
      ) : photo.failed ? (
        // The photo exists but does not load (offline, or its file is gone): still replaceable or removable.
        menuButton(`text-button ${styles.add}`)
      ) : (
        <button type="button" className={`text-button ${styles.add}`} disabled={disabled} onClick={pick}>
          <Icon name="camera" />{upload.isPending ? t('catalogue.photo.uploading') : t('catalogue.photo.add')}
        </button>
      )}
      {isCurator && <input ref={input} type="file" accept="image/*" hidden onChange={chosen} />}
      {sheet === 'closed' && alert}
      <BottomSheet open={sheet !== 'closed'} title={t('catalogue.photo.menu')} onClose={() => setSheet('closed')}>
        {sheet === 'confirm' ? (
          <div className={styles.confirm}>
            <p>{t('catalogue.photo.removeConfirm')}</p>
            <div className={styles.confirmActions}>
              <button type="button" className="text-button primary" disabled={disabled} onClick={confirmRemove}>{t('catalogue.photo.removeAction')}</button>
              <button type="button" className="text-button" disabled={busy} onClick={() => setSheet('menu')}>{t('catalogue.photo.back')}</button>
            </div>
          </div>
        ) : (
          <ul className={styles.rows}>
            <li>
              <button type="button" className={styles.row} disabled={disabled} onClick={pick}>
                {upload.isPending ? t('catalogue.photo.uploading') : t('catalogue.photo.replace')}
              </button>
            </li>
            <li>
              <button type="button" className={styles.row} disabled={disabled} onClick={() => setSheet('confirm')}>{t('catalogue.photo.remove')}</button>
            </li>
          </ul>
        )}
        {alert}
      </BottomSheet>
    </>
  );
}
