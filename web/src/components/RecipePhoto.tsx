import type { ReactNode } from 'react';

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
