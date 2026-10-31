# Fitur baru v3.1

Setelah update: jalankan `npm install` lalu `npm run deploy` (supaya command baru terdaftar), kemudian restart bot.
Database lama aman: tabel baru dibuat otomatis, data lama tidak disentuh.

## 😴 AFK
| Command | Fungsi |
|---|---|
| `/afk [alasan]` | Tandai AFK. Nickname otomatis jadi `[AFK] Nama` (jika bot punya izin Manage Nicknames) |
| `/afklist` | Daftar member yang sedang AFK |

- Kalau ada yang me-mention user AFK, bot membalas alasan + sejak kapan (hilang sendiri setelah 20 detik).
- Begitu user AFK chat lagi, status dihapus otomatis + nickname dikembalikan.

## 📈 Level
| Command | Fungsi |
|---|---|
| `/rank [user]` | Kartu rank bergambar (avatar, level, peringkat, progress bar) |
| `/leaderboard [level/koin]` | Papan peringkat 10 per halaman dengan tombol ◀ ▶ |
| `/levelsetup ...` | Admin (Manage Server): `status`, `toggle`, `channel`, `multiplier`, `reward-add`, `reward-remove`, `reward-list`, `givexp`, `setlevel`, `reset`, `reset-all` |

- XP chat: 15–25 per pesan, cooldown 1 menit. XP voice: 10/menit (minimal 2 orang di channel, tidak deafen, channel AFK diabaikan).
- Naik level: bonus koin (level × 50), pengumuman, dan role reward otomatis.
- `multiplier` untuk event double XP.
- Kartu rank butuh paket `@napi-rs/canvas` (sudah ada di `optionalDependencies`). Kalau gagal terpasang, `/rank` otomatis memakai embed biasa.

## 💰 Ekonomi & 🎮 Game
Saldo awal 1.000 koin per server. Taruhan 10 – 100.000.

| Command | Keterangan |
|---|---|
| `/balance` `/daily` `/work` `/pay` | Cek saldo, hadiah harian (streak sampai 7 hari), kerja tiap 1 jam, kirim koin |
| `/givecoins` | Admin: beri koin |
| `/slots` | Animasi 3 reel. 3 sama x4–x100, 2 🍒 x2, sepasang x0.5. RTP ±96% |
| `/coinflip` | Gambar/angka, x2 |
| `/dice` | Adu 2 dadu lawan bot, x2 |
| `/roulette` | Merah/hitam/genap/ganjil x2, hijau atau angka persis x36 (RTP 97,3%) |
| `/rps` | Batu-gunting-kertas, taruhan opsional |
| `/blackjack` | Tombol Hit / Stand / Double. Menang x2, blackjack x2.5, auto-stand kalau 60 detik tidak merespons |

## Izin & intent yang dibutuhkan
- Intent baru `GuildMessages` (bukan privileged, tidak perlu diaktifkan di Developer Portal). Bot **tidak membaca isi pesan**.
- Izin bot: Send Messages, Embed Links, Attach Files (kartu rank), Manage Roles (role reward; role bot harus di atas role reward), Manage Nicknames (opsional, untuk `[AFK]`).
