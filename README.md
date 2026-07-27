# LOOTIV

Uyelik sistemli oyun sitesi - Turk Pokeri, VIP uyelik, gunun sorusu, kazi kazan. Node.js/Express + EJS + PostgreSQL + Socket.IO ile yazilmistir.

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
- **Profil Ayarlari (`/settings/profile`)**: E-posta + telefon dogrulama (deneme surumu - kod ekranda gosterilir, gercekten gonderilmez). Ikisi de dogrulaninca **+500 LT** bonus.
- **Admin Paneli (`/admin`)**: Sadece admin yetkili kullanicilar erisebilir.
  - Istatistikler: toplam uye, toplam LT, dogrulanmis uye, VIP uye, yasakli uye.
  - Tum uyeler tablosu: LT, dogrulama durumu, VIP atama, rol (pasif, ileride aktif edilecek), sustur/yasakla, LT elle duzenleme.
  - **Poker el loglari**: kim ne kadar LT ile oynadi, kazandi/kaybetti, o elin sonunda toplam LT'si ne oldu.
  - **Gunun Sorusu** yonetimi: soru, 4 secenek, dogru cevap, odul LT, aktif/pasif.
  - **Kazi Kazan** yonetimi: odul havuzu (virgullu liste), aktif/pasif.

## VIP uyelik

Uc plan var, hepsi admin panelinden (`/admin` > kullanici satirindaki VIP secimi) atanir:

| Plan | Sure | Aninda LT | Haftalik LT |
|------|------|-----------|-------------|
| VIP 1 | 1 ay | 10.000 | 10.000 |
| VIP 2 | 6 ay | 15.000 | 15.000 |
| VIP 3 | 12 ay | 20.000 | 20.000 |

Haftalik LT eklemesi, kullanicinin her istek atmasinda (`attachUser` middleware) veritabanindaki son ekleme tarihine bakilarak otomatik hesaplanir — sunucu yeniden baslasa veya bir sure kapali kalsa bile kaldigi yerden devam eder, ayri bir zamanlayici surecine ihtiyac yoktur. Sure dolunca VIP otomatik kaldirilir.

## Admin yetkisi nasil calisir

`admin_yetkileri` tablosunda **Emir** ve **Umut** rumuzlari rezerve edilmistir. Bu rumuzlardan biriyle kayit olan kullanici otomatik admin olur. Baska hicbir rumuz bu iki ismi alamaz.

## Yapı

```
server.js                     Express + Socket.IO sunucusu, tum route'lar
lib/db.js                      PostgreSQL erisim katmani
lib/pokerTable.js               Poker masasi oyun motoru (hand-result event'i ile loglama)
lib/pokerHand.js                 El degerlendirme mantigi
views/                            EJS sablonlari (lobby, register, poker, settings-profile, admin)
public/                            Statik dosyalar (css, js, logo)
schema.sql                         Referans veritabani semasi
```

## Notlar

- `.env` dosyasi `.gitignore` icinde yer alir.
- Sunucuya her dosya guncellemesinden sonra barindirma panelinizden **NPM Install** (bagimlilik degistiyse) ve **Restart App** adimlarini tekrarlamayi unutmayin.
- Banli kullanicilar giris yapamaz ve soket baglantisi kurulamaz.
- Susturma (mute) su an bilgi amacli saklanir; sohbete gonderim engeli eklemek istenirse `server.js` > `socket.on('chat:message', ...)` icine `user.is_muted` kontrolu eklenebilir.
