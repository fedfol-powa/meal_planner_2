# W21, rilievi della revisione della PR #74

Rapporto completo: `progetto/coordinamento/revisioni/w21-pr74.md` (APPROVABILE CON CORREZIONI).
Correggi nella stessa PR, poi push e di nuovo `STATO: PR_APERTA <url>`.

1. **Importante:** un tocco durante il completamento può cambiare il giorno di arrivo (da
   giovedì 8 si arriva a venerdì 16). Ignora anche il clic di un tocco iniziato durante il
   completamento senza azzerare prima la protezione; restano le distinzioni di W19 per
   tastiera e mouse. Test che completi davvero l'animazione dopo il secondo tocco e verifichi
   il giorno finale (il mock delle animazioni deve poterle terminare).
2. **Minore:** ripresa del ritorno da un bordo senza settimana: la resistenza viene applicata
   due volte e la fila salta nel verso opposto. Separa la posizione visibile dalla distanza
   prima della resistenza; test su entrambi i bordi, anche invertendo la direzione.
3. **Decisione del coordinatore sul costo delle letture:** le settimane accanto oggi sono
   query osservate, quindi si rileggono a ogni ritorno in primo piano, riconnessione e
   invalidazione (tre `getWeek` invece di una). Rendile una lettura anticipata non osservata
   (per esempio `prefetchQuery`, o query non attive che non si rileggono al ritorno in primo
   piano), mantenendo l'arrivo senza salti: se la copia anticipata è vecchia, alla selezione
   vale la normale lettura della settimana. Scrivi nel piano il costo risultante e aggiungi un
   test che conti le letture all'apertura e al ritorno in primo piano.
