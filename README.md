# LOOTIV

Uyelik sistemli oyun sitesi - Turk Pokeri, 101 Okey, VIP uyelik, gunun sorusu, kazi kazan. Node.js/Express + EJS + PostgreSQL + Socket.IO ile yazilmistir.

## Kurulum

```bash
npm install
```

`.env` dosyasini kendi ortaminiza gore duzenleyin. PostgreSQL veritabanini olusturduktan sonra uygulamayi calistirin; tum tablolar ilk acilista otomatik olusturulur/guncellenir (bkz. `lib/db.js`, referans icin `schema.sql`):

```bash
npm start
```

## Ekranlar

- **Ana sayfa / Lobi (`/`)**: Ust ortada logo + giris formu / kullanici bilgisi. Turk Pokeri karti, Gunun Sorusu widget'i, Kazi Kazan widget'i ve VIP plan tanitimlari burada.
- **Kayit (`/register`)**: Rumuz, E-mail, Sifre, Sifre Tekrar, uyelik sartlari onayi. Yeni uyeler **500 LT** ile baslar.
- **Turk Pokeri (`/poker`)**: 6 kisilik masa, canli sohbet (genel/oyun/sistem), Socket.IO ile gercek zamanli. Her elin sonucu `game_logs` tablosuna yazilir.
- **101 Okey (`/okey`)**: 4 kisilik masa, surukle-birak istaka. Detay asagida.
- **Profil Ayarlari (`/settings/profile`)**: E-posta + telefon dogrulama (deneme surumu - kod ekranda gosterilir, gercekten gonderilmez). Ikisi de dogrulaninca **+500 LT** bonus.
- **Admin Paneli (`/admin`)**: Sadece admin yetkili kullanicilar erisebilir.
  - Istatistikler: toplam uye, toplam LT, dogrulanmis uye, VIP uye, yasakli uye.
  - Tum uyeler tablosu: LT, dogrulama durumu, VIP atama, rol (pasif, ileride aktif edilecek), sustur/yasakla, LT elle duzenleme.
  - **Poker el loglari**: kim ne kadar LT ile oynadi, kazandi/kaybetti, o elin sonunda toplam LT'si ne oldu (game kolonu ile poker/okey ayrimi).
  - **Gunun Sorusu** yonetimi: soru, 4 secenek, dogru cevap, odul LT, aktif/pasif.
  - **Kazi Kazan** yonetimi: odul havuzu (virgullu liste), aktif/pasif.

## 101 Okey

- **Masa**: 4 koltuk (0=alt/ben, 1=sol, 2=ust, 3=sag). Sira Turkiye kurallarina uygun olarak **saga** doner (0 -> 3 -> 2 -> 1).
- **Tas atma**: Buton yok; tas cektikten sonra atacagin tasi **sag kosendeki** isikli alana sureklersin. Her oyuncunun attigi taslar, kendisiyle bir sonraki oyuncu arasindaki kosede birikir (sunucuda `discardPiles`). Ceken oyuncu, **sol kosesindeki** son atilan tasi tiklayarak alabilir.
- **Istaka**: 2 sira x 13 slot; taslar surukle-birakla tasinir/yer degistirir. Solda mavi **CIFT DIZ** (ayni tastan ikilileri yan yana dizer, okey/joker tek kalanlari cifte tamamlar), sagda kirmizi **SERI DIZ** (ayni renk ardisik sayilari bitisik gruplar halinde dizer; gruplar arasi 1 bosluk).
- **Gosterge**: Ortadaki destenin yaninda sadece tas olarak gorunur (yazi yok). Okey = gosterge + 1.
- **Bitis**: 15 tasla "Bitir" — el, seri/per (canFormRunsAndSets) veya 7 cift (canFormSevenPairs) olarak dogrulanir. Kazanc carpanlari: elden bitis x2, cift bitis x2, elinde gercek okey tutan kaybeden x2 (BASE_STAKE=20 LT).
- **Bot / test modu**: Bos koltuklardaki **+ Bot** butonu ya da aksiyon cubugundaki **"Bos Koltuklari Botla Doldur & Basla"** ile tek basina test edilebilir. Botlar 1.5 sn'de oynar, negatif userId tasir, DB'ye ve loglara yazilmaz. `MIN_PLAYERS=2`. **Uretim notu**: `lib/okeyTable.js` icindeki oturma bakiye kontrolu (MIN_BALANCE_TO_SIT) test icin yorum satirinda — canliya alirken geri acin ve bot butonlarini kaldirmayi/sadece admine acmayi dusunun.

## VIP uyelik

Uc plan var, hepsi admin panelinden (`/admin` > kullanici satirindaki VIP secimi) atanir:

| Plan | Sure | Aninda LT | Haftalik LT |
|------|------|-----------|-------------|
| Bronz Paket | 1 ay | 10.000 | 10.000 |
| Gümüş Paket | 6 ay | 15.000 | 15.000 |
| Altın Paket | 12 ay | 20.000 | 20.000 |

Haftalik LT eklemesi, kullanicinin her istek atmasinda (`attachUser` middleware) veritabanindaki son ekleme tarihine bakilarak otomatik hesaplanir — sunucu yeniden baslasa veya bir sure kapali kalsa bile kaldigi yerden devam eder, ayri bir zamanlayici surecine ihtiyac yoktur. Sure dolunca VIP otomatik kaldirilir.

## Admin yetkisi nasil calisir

`admin_yetkileri` tablosunda **Emir** ve **Umut** rumuzlari rezerve edilmistir. Bu rumuzlardan biriyle kayit olan kullanici otomatik admin olur. Baska hicbir rumuz bu iki ismi alamaz.

## Yapı

```
server.js                     Express + Socket.IO sunucusu, tum route'lar (poker + okey)
lib/db.js                      PostgreSQL erisim katmani
lib/pokerTable.js               Poker masasi oyun motoru (hand-result event'i ile loglama)
lib/pokerHand.js                 El degerlendirme mantigi (poker)
lib/okeyTable.js                  101 Okey masa motoru (botlar, kose iskartalari, hand-result)
lib/okeyLogic.js                   101 Okey el degerlendirme (seri/per, 7 cift, gosterge/okey)
views/                              EJS sablonlari (lobby, register, poker, okey, settings-profile, admin)
public/                              Statik dosyalar (css, js, logo)
schema.sql                            Referans veritabani semasi
```

## Notlar

- `.env` dosyasi `.gitignore` icinde yer alir.
- Sunucuya her dosya guncellemesinden sonra barindirma panelinizden **NPM Install** (bagimlilik degistiyse) ve **Restart App** adimlarini tekrarlamayi unutmayin.
- Banli kullanicilar giris yapamaz ve soket baglantisi kurulamaz.
- Susturma (mute) su an bilgi amacli saklanir; sohbete gonderim engeli eklemek istenirse `server.js` > `socket.on('chat:message', ...)` icine `user.is_muted` kontrolu eklenebilir.
