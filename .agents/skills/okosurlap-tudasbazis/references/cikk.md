# Cikk — Tudásbázis

Tartalom

- Típusok
- Szerkezet
- Lead
- Lépések
- Képek és UI-idézet
- Kapcsolódó cikkek
- Főoldal és kategória
- Példa

## Típusok

`how-to`  
Egy feladat, elejétől a kész állapotig.

`fogalom`  
Mi ez a kapcsoló / mezőtípus / állapot. Rövid. Nem helyettesíti a how-to-t.

`hiba`  
Egy tünet, okok, mit csinálj. Cím a tünet nyelvén (_A Küldés gomb szürke marad_).

`elso-lepesek`  
Onboarding-sor. Maximum 4–6 rövid how-to láncolva, mindegyik külön cikk. Egy „Első lépések” indexoldal csak listáz és egy mondatot ír cikkhez.

Ne keverd a típust. Egy hiba cikkben ne tanítsd meg az egész űrlapkészítést.

## Szerkezet

```
Cím
Lead
(Előfeltétel, csak ha tényleg kell)
Számozott lépések vagy rövid magyarázat
Ha elakadtál   ← opcionális, max 3 pont
Kapcsolódó     ← opcionális, 2–4 cím
```

Nincs tartalomjegyzék 800 szó alatt. Nincs „Bevezetés” alcím. Nincs „Összefoglalás”.

## Lead

A lead a kész állapot + hol jársz a felületen. Nem ígéret.

Jó:

> Új űrlapot a listából indítasz. A végén elmentett vázlatod van, még nem publikus.

Rossz:

> Ebben a cikkben bemutatjuk, hogyan hozhatsz létre könnyedén egy új űrlapot az OKOSűrlapban.

A leadben ne ismételd a címet szóról szóra.

## Lépések

Minden lépés:

1. Utasítás egy mondatban, gombbal vagy menüvel.
2. Opcionális második mondat: mit látsz utána, vagy mire figyelj.

Jó lépés:

1. Az Űrlapok listán kattints a plusz gombra.
2. Add meg a belső nevet. Ezt csak te látod, a kitöltő nem.
3. Mentsd vázlatnak. A közzététel külön gomb.

Rossz lépés:

1. Elsőként navigálj a megfelelő felületre, majd válaszd ki az új elem létrehozásának opcióját.

Ha egy lépés három al-kattintás, bontsd. Ha két lépés ugyanazt a panelt nyitja, húzd össze.

Előfeltételt csak akkor írj, ha nélküle elhasal a cikk (_kell egy már létező űrlap_, _kell közzétett űrlap_). Ne írj „alapszintű számítógép-használat” előfeltételt.

## Képek és UI-idézet

Képaláírás egy sor, ami a lényeget mondja, nem „1. ábra”.

> A Mezők panel alján az Új mező gomb.

Felületi feliratot pontosan idézd, idézőjel nélkül, ahogy a gombon áll. Ha bizonytalan vagy `[FELIRAT?]`.

Kerülendő a „kattints ide” szöveg link nélkül. Ha van célcikk, a link a címre menjen.

## Kapcsolódó cikkek

Csak olyan, amit a cikk után tényleg nyitna valaki.

Első űrlap létrehozása után logikus:

- Mező hozzáadása
- Űrlap közzététele
- Tesztkitöltés

Nem logikus:

- Számlázási beállítások
- API dokumentáció

## Főoldal és kategória

Tudásbázis nyitó, komoly-jó hangon:

```
OKOSűrlap Tudásbázis

Rövid útmutatók a rendszerhez. Kezdd az Első lépésekkel, vagy keress címre.

Első lépések
Űrlap készítése
Mezők és logika
Válaszok
Beállítások
```

Kategória-lead egy mondat:

> Mezők és logika — kérdésfajták, kötelezőség, feltételes megjelenés.

Sem üdvözlés, sem küldetésnyilatkozat.

## Példa (how-to, rövid)

Cím: Első űrlap létrehozása

Lead: A listából indítasz egy üres űrlapot. A végén vázlatként el van mentve, a kitöltők még nem látják.

1. Bal oldalt nyisd meg az Űrlapok menüt.
2. A lista tetején kattints az Új űrlap gombra.
3. Add meg a belső nevet. Ezt a kitöltő nem látja.
4. Mentsd. A státusz Vázlat marad.

Ha elakadtál

- Nem találod a plusz gombot. Nézd a lista jobb felső sarkát. Szűk ablakon a gomb összecsukódhat.
- Mentés után eltűnik a szerkesztő. Az űrlap a listában van, kattints a nevére.

Kapcsolódó

- Mező hozzáadása
- Űrlap közzététele
