# Zen Grains: brief dla nowej sesji (29 października 2026)

## Cel (słowa Sławka)
„chciałbym to wszystko jakoś poukładać, założyć dedykowany git czy repo pod tę grę i żeby [Claude] nie pracował na nią
w izolacji”. Do tego: plansza „bardziej jak gra”, żeby „kolor całego kota i kolor łapy był consistent”, a animacje
„żeby wydawało się wszystko takie live”.

## Zrobione i sprawdzone (commity w `sprinkle-pour` main)
- `a82727b` bez kamieni-ozdób w Pełni · `b911ec4` cienka czcionka punktów, test drapania kapibary · `51a1586`
  miseczki rysowane kodem · `ab3b6a3` Zen Kot wraca przy każdej próbie, ziarna przeskakują pałeczki (test w
  `sim.test.mjs`) · `a85ea1a` tryb Podróż · `22296c0` łapka znów grozi palcem · `edb7738` awers królika (Nowy 1)
  · `26478e8` STYLE.md z dwoma rejestrami. Testy 74/74, canvas bez wycieku, wersja live `7cacee72d9` odczytana.
- 29 października: repo gry przygotowane z całą historią (115 commitów `zen-grain/`, `docs/zen-grain/`,
  `docs/grain-line/`) i prototypem Chopstick Catch (3 commity z cake-hero) w `archive/`. Build do jednego folderu
  `dist/` (README). Sprawdzone lokalnie: testy, 48 plików z kodem 200, canvas, strony `labs/`.
- `sweetbuffet-os` dopięte do sesji tylko do odczytu.

## Otwarte
- **Repo `slodkibufetposypki/zen-grains` nie istnieje:** GitHub odmówił aplikacji Claude
  (`403 Resource not accessible by integration`). Przygotowana historia leży w `sprinkle-pour`, gałąź
  `zen-grains-repo`. Po założeniu pustego prywatnego repo i dodaniu do niego aplikacji Claude wystarczy:
  `git push https://github.com/slodkibufetposypki/zen-grains origin/zen-grains-repo:refs/heads/main`.
- Master: Cloudflare Pages z repo `zen-grains` (build `npm run build`, katalog `dist`), domena zengrains.com,
  Cloudflare Access do premiery, linijka o Zen Grains w `sweetbuffet-os`.
- Do czasu działającej zengrains.com nowy build trzeba kopiować z `dist/` do `sprinkle-pour/docs/zen-grain/`.

## Czeka na Sławka
1. Zen Kot w gwaszu, arkusz czterech widoków (Higgsfield `0f2bb17f`).
2. Łapka od góry do mieszania w stylu planszy (`9c2c203d`).
3. Przebieg wizyty kota (nagranie z 28.10). Po akceptacji: wygenerowana łapka do gry, klatki poniżej 0,5 MB.
4. Propozycje z sesji UX: wynik nabijany razem z ziarnami, licznik „6/8 do daru”, przegląd końca Pełni.
5. Kapibara drapiąca się: Kling czy Seedance (Sofia). Pomysł: Seedance na spokojne chwile, Kling na radosne.

## Pliki
Tu, w `sprinkle-pour`, gra jest w `zen-grain/`; na gałęzi `zen-grains-repo` (`65d512c`) w katalogu głównym: `game.html` (cała gra), `build.mjs`, `public/`, `labs/` (strony próbne kapibary), `art/` (oryginały i prompty),
`STYLE.md`, `ROADMAP.md`, `STATUS.md`, `CLAUDE.md`. Klatki łapki i filmiki z 28.10 są tylko w scratchpadzie
starej sesji; zostają ID zadań Higgsfield (łapka `049f56fc`, kiwanie `be22969b`), da się je pobrać jeszcze raz.

## Decyzje i czego nie robić
- Dwa rejestry stylu (STYLE.md). Na planszy bez konturów i bez faktury; postacie malowane gwaszem.
- Każdy wygenerowany obrazek najpierw do akceptacji, potem wideo. Kredyty tylko po podaniu ceny i zgodzie.
- Łapka: kciuk po stronie ramienia, unosi się palec obok kciuka, nigdy środkowy; zgięte palce bez poduszeczek,
  z pazurkami; trzy kiwnięcia razem (dwa w jedną stronę, jedno w drugą).
- Modele wideo składają uniesiony palec w stronę widza: sprawdzaj klatki i wycinaj te bez palca.
- Nie usuwaj `sprinkle-pour/docs/zen-grain/`, dopóki zengrains.com nie działa.
- Obrazy rób według `sweetbuffet-os/docs/asset-generation/RUN.md`. W tej sesji nie było to stosowane.

## Kredyty
Higgsfield: 209 kr od 28.10 (1714,7 → 1505,7, odczyt 29.10): kapibara wideo 42,5; łapka płaska 60; kot płaski
27 (odrzucony); królik 36; miseczka 9; łapka planszy, łapka z góry, arkusz kota po 9; kiwanie 7,5.
Wcześniej: 444 kr na drugą falę assetów.
