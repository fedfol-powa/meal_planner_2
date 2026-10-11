import type { IngredientLine } from '../api/types';

export function IngredientList({ ingredients }: { ingredients: IngredientLine[] }) {
  return (
    <ul className="ingredient-list">
      {ingredients.map((item, index) => (
        // The same ingredient may appear twice in a recipe: the position keeps keys unique.
        <li key={`${index}-${item.ingredientId}`}>
          <span>
            {item.name}
            {item.preparation && <span className="ingredient-preparation">, {item.preparation}</span>}
          </span>
          <span className="ingredient-quantity">{item.amount}</span>
        </li>
      ))}
    </ul>
  );
}
