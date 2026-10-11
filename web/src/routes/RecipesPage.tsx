import { FamilyGate } from '../components/FamilyGate';
import { useT } from '../i18n/LocaleProvider';

export function RecipesPage() {
  const t = useT();
  return <FamilyGate>{() => <section className="secondary-view app-view"><h1 className="page-title">{t('nav.recipes')}</h1></section>}</FamilyGate>;
}
