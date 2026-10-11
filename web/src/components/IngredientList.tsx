import type { IngredientLine } from '../api/types';
import { useT } from '../i18n/LocaleProvider';

export function IngredientList({ ingredients }: { ingredients: IngredientLine[] }) {
  const t = useT();
  return (
    <ul className="ingredient-list">
      {ingredients.map((item, index) => (
        // The same ingredient may appear twice in a recipe: the position keeps keys unique.
        <li key={`${index}-${item.ingredientId}`}>
          <span>
            {item.name}
            {item.preparation && <span className="ingredient-preparation">, {item.preparation}</span>}
            {item.optional && <span className="ingredient-preparation"> ({t('recipe.optional')})</span>}
          </span>
          <span className="ingredient-quantity">{item.amount}</span>
        </li>
      ))}
    </ul>
  );
}
