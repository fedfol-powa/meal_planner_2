import { useMutation } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiProvider';
import { countCatalogueChangeConfirmed } from '../../../api/mutations';
import { useSession } from '../../../session/SessionScope';
import { useCatalogueRevocation } from '../queries';
import { resizeForUpload } from './resize';

/** The reads that show recipe photos: recipes, menu, suggestions and the catalogue area (spec W12, section 6). */
const PHOTO_READS = [['recipes'], ['menu'], ['meals', 'getSuggestions'], ['catalogue']] as const;

/**
 * After a confirmed photo change: meal answers prepared before it are not written (they may carry
 * the old photo), then every read that shows photos goes stale. No optimistic update.
 */
function usePhotoChanged() {
  const session = useSession();
  return async () => {
    countCatalogueChangeConfirmed(session);
    await Promise.all(PHOTO_READS.map((queryKey) => session.queryClient.invalidateQueries({ queryKey })));
  };
}

export interface UploadOptions {
  /** Tests only: the browser resize (canvas) replaced. */
  resize?: (file: File) => Promise<Blob>;
}

/** Add or replace the photo from a chosen file: resized in the browser inside the mutation, so it counts as a busy page. */
export function useUploadPhoto(recipeId: string, options: UploadOptions = {}) {
  const api = useApi();
  const changed = usePhotoChanged();
  const revoke = useCatalogueRevocation();
  const resize = options.resize ?? ((file: File) => resizeForUpload(file));
  return useMutation({
    meta: { operation: 'catalogue.uploadPhoto' },
    mutationFn: async (file: File) => {
      const blob = await resize(file);
      const jpeg = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      // A new id per gesture: a repeat of the same request is answered without new work.
      return api.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId, file: jpeg });
    },
    onSuccess: changed,
    onError: (error) => revoke(error)
  });
}

export function useRemovePhoto(recipeId: string) {
  const api = useApi();
  const changed = usePhotoChanged();
  const revoke = useCatalogueRevocation();
  return useMutation({
    meta: { operation: 'catalogue.removePhoto' },
    mutationFn: () => api.catalogue.removePhoto({ recipeId }),
    onSuccess: changed,
    onError: (error) => revoke(error)
  });
}
