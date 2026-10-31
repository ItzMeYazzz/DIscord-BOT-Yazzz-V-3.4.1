# Update v3.4 — Prefix `yz` & musik NodeLink

## Cara pasang
1. Salin folder `src` dan file `package.json`, `NODELINK-SETUP.md`, `.env.example` ke project (Replace). **Jangan timpa `.env`-mu.**
2. Tambahkan ke `.env`: `PREFIX=yz`, `NODELINK_HOST`, `NODELINK_PORT`, `NODELINK_PASSWORD` (lihat `.env.example`).
3. Discord Developer Portal → aplikasimu → **Bot → Privileged Gateway Intents → aktifkan _Message Content Intent_** (wajib untuk prefix).
4. Pasang & jalankan NodeLink (lihat `NODELINK-SETUP.md`).
5. `npm install` → `npm run deploy` → `npm start`.
6. Boleh hapus `bin/` (yt-dlp.exe) dan `src/music/ytdlp.js`.

## Prefix `yz` (slash command TIDAK dihapus)
Semua slash command bisa dipanggil juga lewat teks: `yz <command> <argumen>`. Huruf besar/kecil bebas, `yz play` = `YZ Play` = `yzplay`.

| Contoh | Sama dengan |
|---|---|
| `yz play lofi hip hop` | `/play query:lofi hip hop` |
| `yz p https://youtu.be/...` | `/play` dengan URL |
| `yz sc kopi dangdut` | `/play` dari SoundCloud |
| `yz search tulus` | `/search` |
| `yz skip` · `yz s` / `yz np` / `yz q` / `yz vol 80` | `/skip` `/nowplaying` `/queue` `/volume` |
| `yz loop queue` · `yz pause` · `yz resume` · `yz stop` | `/loop` `/pause` `/resume` `/stop` |
| `yz bal` · `yz daily` · `yz pay @user 5k` | `/balance` `/daily` `/pay` (taruhan boleh `1k`, `2m`, `1.500`) |
| `yz slots 500` · `yz coinflip gambar 1k` | game taruhan |
| `yz ludo cepat` · `yz monopoly cepat` | `/ludo mode:Cepat` · `/monopoly durasi:Cepat` |
| `yz wordle` · `yz tictactoe @user` · `yz 2048` · `yz crash 1k` | `/mini wordle` · `/mini tictactoe` · `/arcade 2048` · `/arcade crash` |
| `yz help` | daftar command |

Aturan argumen:
- Berurutan sesuai slash command, atau bernama: `yz play source:soundcloud kopi`, `yz ban @user reason:spam`.
- Opsi teks terakhir mengambil seluruh sisa kalimat (`yz play lofi hip hop beats`).
- Pilihan boleh disingkat: `yz ludo cepat`, `yz loop track`.
- User/channel/role: pakai @mention, #channel, atau ID.
- Izin moderasi tetap dicek (`yz kick` butuh izin Kick Members seperti `/kick`).
- Kalau argumen kurang/salah, bot membalas format pemakaian yang benar.
- Matikan prefix: `PREFIX_ENABLED=false`. Ganti prefix: `PREFIX=...`.
- Perbedaan: balasan "hanya kamu yang lihat" (ephemeral) pada slash menjadi pesan biasa di channel kalau lewat prefix.

## Musik NodeLink
Pemutaran pindah ke NodeLink (lihat `NODELINK-SETUP.md`): tanpa yt-dlp/ffmpeg, bot ringan, suara stabil.
Baru: `/volume` (`yz vol 80`), pemulihan otomatis lagu & mode 24/7 saat NodeLink restart, dan 3× gagal beruntun → antrean
dikosongkan dengan pesan jelas.

## 3.4.1
- `/play` kini mencari lagu di NodeLink dan masuk voice **bersamaan** (sebelumnya berurutan, waktunya dijumlahkan).
- Kalau `/play` makan >1,5 detik, terminal mencetak rinciannya: `[music] /play selesai X ms — cari lagu A ms, masuk voice B ms`.
- Pencarian kosong/gagal tidak lagi meninggalkan bot nyangkut di voice channel.
