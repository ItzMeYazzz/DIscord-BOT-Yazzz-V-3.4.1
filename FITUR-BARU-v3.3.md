# Update v3.3 — Monopoly, Ludo & Arcade

## Cara pasang
1. Ekstrak zip ini, salin folder `src` ke folder project (`DISCORD BOT YAZZZ`), pilih **Replace**.
2. Jalankan `npm run deploy` (ada command baru `/arcade` dan opsi baru di `/monopoly` & `/ludo`).
3. Restart bot (`npm start`). Tidak ada dependensi baru; database tidak berubah.

> File `src/utils/monopolyData.js` sudah tidak dipakai (digantikan `monopolyMaps.js`). Boleh dibiarkan atau dihapus.

---

## 🎩 Monopoly — 5 peta
`/monopoly peta:<pilihan> durasi:<ronde> taruhan:<koin>` (bawaan: Nusantara)

| Peta | Ciri khas |
|---|---|
| 🏝️ **Nusantara** | Peta asli, aturan standar (tidak berubah) |
| 🌍 **Keliling Dunia** | Kota dunia & bandara. Uang awal $1.800, gaji START $250, denda $75 |
| 🌆 **Jakarta Raya** | **Jackpot Parkir**: semua pajak & denda masuk kas Parkir; mendarat di Parkir = ambil semuanya |
| 🚀 **Antariksa** | Harga & sewa ×2, uang awal $3.000, gaji $400, tema gelap, kartu bertema luar angkasa |
| 🏴‍☠️ **Samudra Bajak Laut** | Semua **sewa ×1,5** — harta berpindah lebih cepat |

Setiap peta punya nama petak, grup warna, kartu Kesempatan/Dana Umum, token pemain, dan tema warna papan sendiri.

**Tampilan papan baru:** tema warna per peta, petak pemain yang sedang jalan menyala, pion di tepi dalam petak (tidak menutupi nama/harga), kas Jackpot Parkir & nomor ronde di tengah, dadu & kartu terakhir.

## 🎲 Ludo — mode & tema
`/ludo mode:<…> tema:<…> taruhan:<koin>`

| Mode | Aturan |
|---|---|
| 🎲 Klasik | 4 pion, keluar base dengan dadu 6 |
| 🌴 Santai | 4 pion, keluar base dengan dadu **1 atau 6** |
| ⚡ Cepat | **2 pion**, keluar dengan 1 atau 6 (game ±2× lebih singkat) |

Tema papan: 🎨 Klasik, 🌳 Hutan, 🌊 Samudra, 🌌 Neon. Papan kini **gambar** (pion bernomor, pion yang bisa jalan berpendar emas, nama pemain & titik finish di tiap base). Jika canvas tidak ada, otomatis kembali ke papan emoji.

## 🕹️ Arcade — 8 game baru (`/arcade <game>`)
| Game | Keterangan |
|---|---|
| 🔢 `2048` | Geser & gabung ubin. Hadiah sesuai ubin terbesar (128 = 50 … 2048 = 3.000 koin) |
| 🐍 `ular` | Makan apel, tombol arah + "Maju ×3". Tiap apel = 15 koin |
| 🐭 `labirin` | Labirin acak (kecil/sedang/besar), panah meluncur sampai persimpangan, energi terbatas. Hadiah 100–250 |
| 🚩 `sapu` | Minesweeper klasik dengan angka & mode bendera. Klik pertama selalu aman. Menang = 200 |
| 🎨 `simon` | Ingat pola warna yang makin panjang. Hadiah naik tiap level |
| 🃏 `poker` | Video Poker (Jacks or Better), tahan kartu lalu tarik. Hingga **x250** |
| 🚀 `crash` | Pengali naik, cashout sebelum meledak. Ada `auto` (auto-cashout) cocok untuk internet lambat. RTP 96% |
| 💣 `bom` | Bom Waktu 2–8 pemain (bisa tambah bot & taruhan): oper bom lewat menu sebelum meledak |

`/arcade daftar` menampilkan semuanya. (Dibuat sebagai command terpisah karena `/mini` sudah mendekati batas 25 subcommand Discord.)

---

## Pengaturan opsional di `.env`
| Variabel | Fungsi |
|---|---|
| `MONO_NO_IMAGE=1` | Matikan gambar papan Monopoly (hemat kuota/koneksi lambat) |
| `LUDO_NO_IMAGE=1` | Matikan gambar papan Ludo (pakai papan emoji) |
| `ARCADE_BOM_MIN` / `ARCADE_BOM_SPAN` | Sumbu Bom Waktu: min + acak (ms), bawaan 14000 + 0–16000 |
| `ARCADE_CRASH_TICK` | Jeda antar detak Crash (ms), bawaan 1200 |
| `ARCADE_SIMON_FLASH` | Lama tiap kedip Simon (ms), bawaan 1000 |

## Catatan
- Gambar papan Monopoly & Ludo butuh `@napi-rs/canvas` (sudah terpasang di project kamu). Tiap aksi mengunggah gambar ±100–200 KB; kalau koneksi lambat, pakai opsi `*_NO_IMAGE`.
- Jangan membagikan zip project yang berisi file `.env` (berisi token bot). Kalau pernah terbagikan, buat ulang token di Discord Developer Portal.
