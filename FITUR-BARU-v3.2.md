# Fitur baru v3.2

Cara update: timpa folder `src/` (dan `package.json`) di project lamamu dengan yang ada di zip ini,
lalu jalankan `npm run deploy` (daftarkan command baru) dan restart bot.
**Tidak ada dependensi baru** — `npm install` tidak wajib. Database lama aman, `.env` tidak diubah.

## 🔎 Cari lagu di voice — `/search`
`/search judul:<judul/artis> [source:YouTube|SoundCloud]`
- Menampilkan 10 hasil (judul, durasi, channel). Pilih **1–5 lagu** lewat menu, atau tombol **Putar #1**.
- Tombol **Cari di SoundCloud/YouTube** untuk pindah sumber tanpa mengetik ulang.
- Hanya yang menjalankan command yang bisa memilih; harus sudah berada di voice channel. Lagu masuk antrean yang sama dengan `/play`.

## 🎲 Ludo — `/ludo [taruhan]`
- 2–4 pemain, bisa tambah **bot** di lobi. Papan emoji 15×15, pion yang bisa dipilih bernomor di papan.
- Dadu 6 = keluar base + giliran tambahan, tangkap pion lawan, petak aman ⭐, benteng (2 pion sewarna), 3×6 = hangus, finish harus pas.
- AFK 3× otomatis diambil alih bot. Tombol **Menyerah** tersedia.
- `taruhan` opsional (tanpa bot): pemenang membawa seluruh pot; lobi batal/game dihentikan = taruhan kembali.

## 🎩 Monopoly (Monopoli Indonesia) — `/monopoly [durasi] [taruhan]`
- 2–6 pemain + bot, papan bergambar (butuh `@napi-rs/canvas`, sama seperti kartu rank; tanpa itu tampil teks).
- 40 petak, kartu Kesempatan & Dana Umum, penjara (bayar/kartu/dadu kembar), pajak, stasiun & utilitas.
- **Lelang** kalau properti tidak dibeli (semua pemain bisa menawar), **bangun rumah/hotel** (aturan merata + stok bank), **gadai/tebus**,
  **dagang** antar pemain (properti + uang), utang → jual aset atau bangkrut.
- Tombol: **Kelola** (panel aset pribadi), **Dagang**, **Properti** (lihat semua), **Menyerah**.
- `durasi`: Cepat 20 / Normal 40 / Panjang 80 ronde — di batas ronde, **kekayaan bersih** tertinggi menang.

## 🕹️ Mini games — `/mini <game>` (18 game, `/mini daftar` untuk daftar lengkap)
| Game | Keterangan |
|---|---|
| `tictactoe` `connect4` | Lawan teman atau bot |
| `memory` `puzzle` | Cocokkan kartu / puzzle geser 3×3 |
| `tebakangka` `hangman` `wordle` | Tebak angka, tebak kata (grup), Wordle 5 huruf |
| `hitung` `acakkata` | Balapan menjawab, 5 ronde |
| `kuis` `bendera` | Pilihan ganda multi-pemain, skor + hadiah |
| `reaksi` | Siapa klik tercepat setelah tombol hijau |
| `tod` `pilih` | Truth or Dare, voting dilema |
| `duel` | Adu dadu PvP dengan taruhan |
| `ranjau` `hilo` `roda` | Bertaruhan: cashout kapan saja / streak / roda x0–x10 |

Menang di mini games memberi koin (hadiah kecil). Game bertaruhan memakai saldo ekonomi yang sama dengan `/slots` dll.
RTP: ranjau ±97%, hilo ±96%, roda 98%.

## Catatan
- Satu game grup per channel (Ludo/Monopoly/kuis/dll), satu mini game aktif per orang.
- Ludo & Monopoly berjalan di memori: kalau bot restart di tengah game, game itu hilang (taruhan di game yang sedang berjalan ikut hilang — pakai taruhan secukupnya).
- Soal kuis/kata ada di `src/utils/miniData.js` — gampang ditambah sendiri.
