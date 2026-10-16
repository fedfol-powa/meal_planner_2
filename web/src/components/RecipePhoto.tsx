import { useEffect, useState, type ReactNode } from 'react';
import { useOnline } from './OfflineBanner';

export interface RecipePhotoProps {
  url: string;
  /** 3:1 banner in the cards, 16:9 in the recipe page (design, «Schede dei pasti e immagini»). */
  ratio: '3 / 1' | '16 / 9';
  /** Over the photo: the label of the card, the photo button of the recipe page. */
  children?: ReactNode;
  className?: string;
  /** The image did not load (offline and not cached, removed): the caller goes back to the form without a photo. */
  onFail?: () => void;
}

/** The photo of a recipe (W12): decorative, the title follows. */
export function RecipePhoto({ url, ratio, children, className, onFail }: RecipePhotoProps) {
  return (
    <div className={`meal-media${className ? ` ${className}` : ''}`} style={{ aspectRatio: ratio }}>
      <img className="meal-photo" src={url} alt="" loading="lazy" decoding="async" onError={onFail} />
      {children}
    </div>
  );
}

/**
 * A photo that did not load (offline and not cached, or gone) is left out until the device is
 * back online, then tried again. `failed`: there is a photo, but it is not shown.
 */
export function usePhotoLoad(url: string | null | undefined) {
  const online = useOnline();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (online) setFailedUrl(null);
  }, [online]);
  const failed = !!url && url === failedUrl;
  return { url: url && !failed ? url : null, failed, fail: () => setFailedUrl(url ?? null) };
}
