# Revisione W22 — spec e piano, terzo giro

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione sul commit `d56035b`, branch `evolutive/skeleton-pagine-rare`. Verificate le correzioni rispetto al secondo rapporto e al messaggio `w22-02-revisione-spec-2.md`, confrontandole con il codice web attuale, il brief, W20, la specifica principale, il piano generale e il design.

Nessun file modificato. Test, build e prove nel browser non eseguiti: questa è una revisione di spec e piano. Le differenze geometriche indicate derivano dal markup prescritto e dal CSS attuale.

## Esito del secondo giro

| Rilievo | Esito |
|---|---|
| 1. Spostamenti residui | **Parzialmente risolto.** Preferenze conserva il paragrafo e il margine; Ingressi prevede due righe secondarie. Gli Inviti condividono ora struttura e intervalli nelle due fasi, ma la nuova etichetta del ruolo introduce la differenza descritta sotto. |
| 2. Ruolo in Membri | **Risolto nel piano.** Il profilo anticipa soltanto il layout; il dettaglio decide schede, azioni e abilitazione delle letture. Preservati gli errori bloccanti e aggiunti test delle discordanze in entrambe le direzioni. |
| 3. Prova geometrica delle bozze | **Risolto nel piano.** Il Task 10 prescrive fixture controllate con una e due bozze, nome su una riga e una mancanza, misurando il `top` dei risultati. Il catalogo finto originale è un caso separato; la prova iPhone considera numero e forma. |
| Decisione sul ripristino | **Recepita.** Le «Decisioni da riportare» precisano il riuso del riepilogo già in memoria e una scheda durante il ripristino, senza lettura aggiuntiva dal disco. |

I punti già chiusi nei giri precedenti non vengono riaperti.

## Rilievi

### 1. Importante — La nuova etichetta del ruolo negli Inviti riserva un’altezza inferiore a quella vera

**Riferimento:** [piano W22:402](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:402).

Il nuovo `InvitationItemSkeleton` applica `skeleton-line` direttamente allo stesso elemento che porta `styles.role`:

```tsx
<span className={`${styles.role} skeleton-line`} style={{ width: '6em' }} />
```

La combinazione non conserva l’altezza dell’etichetta vera:

- [AdminPage.module.css:6](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/AdminPage.module.css:6) assegna a `.role` un padding verticale di 2 px per lato.
- [global.css:2](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/design/global.css:2) imposta `box-sizing: border-box`.
- [global.css:175](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/design/global.css:175) impone a `.skeleton-line` `height: 1lh`.
- L’etichetta vera contiene testo e ha altezza automatica: [InvitationsSection.tsx:65](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/InvitationsSection.tsx:65).

Con una sola riga di ruoli, l’etichetta vera occupa quindi una riga **più 4 px di padding**, mentre nello skeleton il padding è incluso nell’altezza di una riga. La differenza è di 4 px per voce, anche per un invito accettato con autore presente e testi senza ritorni a capo.

**Perché conta:** è risolto lo scostamento fra le due fasi di attesa, ma resta uno spostamento deterministico all’arrivo del contenuto nel caso comune dichiarato.

**Correzione proposta:** mantenere `.role` ad altezza automatica e mettere la riga vuota al suo interno:

```tsx
<span className={styles.role} style={{ width: '6em' }}>
  <span className="skeleton-line" />
</span>
```

Nel confronto geometrico del Task 10 usare lo stesso numero di voci nelle tre fasi: i due placeholder previsti e due inviti accettati con autore presente e ruoli su una riga. Verificare altezza delle singole voci e della lista; il controllo delle sole classi non rileva questa differenza.

## Punti da decidere dal coordinatore o dall’utente

Nessuna nuova decisione richiesta. La limitazione del riepilogo delle bozze alla memoria è stata confermata dal coordinatore ed è riportata correttamente nella spec.