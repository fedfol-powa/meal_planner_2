import { useChooseLocale } from '../session/SessionScope';

/** Switches the language from outside the screens, while they stay mounted. */
export function LanguageSwitch() {
  const choose = useChooseLocale();
  return (
    <>
      <button type="button" onClick={() => choose('en-GB')}>test: english</button>
      <button type="button" onClick={() => choose('it-IT')}>test: italiano</button>
    </>
  );
}
