import type { ShoppingListView } from '@app/contract';
import { shoppingExport, type ShoppingExport } from '@app/domain/shopping';

/**
 * Same content as the server's exportList, computed on the device from the list shown (pending
 * layer included), so «Condividi» works offline. Skipped meals are not exported.
 */
export const listExport = (view: ShoppingListView): ShoppingExport =>
  shoppingExport({ ...view, skipped: [] }, view.freeItems.map(({ text, checked }) => ({ text, checked })));
