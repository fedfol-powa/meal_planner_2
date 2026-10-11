import { FamilyGate } from '../components/FamilyGate';
import { useT } from '../i18n/LocaleProvider';

export function RecipePage() {
  const t = useT();
  return <FamilyGate>{() => <section className="secondary-view app-view"><h1 className="page-title">{t('recipes.title')}</h1></section>}</FamilyGate>;
}
