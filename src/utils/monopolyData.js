'use strict';

/** Data papan Monopoly (versi Indonesia). Uang dalam game memakai simbol $ supaya tidak tertukar dengan koin bot. */

const GROUPS = {
  brown: { name: 'Cokelat', color: '#8b5a2b', emoji: '🟫' },
  lightblue: { name: 'Biru Muda', color: '#9bd8f2', emoji: '🟦' },
  pink: { name: 'Pink', color: '#e0509f', emoji: '🩷' },
  orange: { name: 'Oranye', color: '#f08a24', emoji: '🟧' },
  red: { name: 'Merah', color: '#d62d2d', emoji: '🟥' },
  yellow: { name: 'Kuning', color: '#f4d03f', emoji: '🟨' },
  green: { name: 'Hijau', color: '#2e9e5b', emoji: '🟩' },
  darkblue: { name: 'Biru Tua', color: '#1f3fa6', emoji: '🔷' },
};

const prop = (name, group, price, house, rent) => ({ type: 'property', name, group, price, house, rent });
const rail = (name) => ({ type: 'rail', name, price: 200 });
const util = (name) => ({ type: 'util', name, price: 150 });

const BOARD = [
  { type: 'go', name: 'START' },
  prop('Pontianak', 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { type: 'chest', name: 'Dana Umum' },
  prop('Samarinda', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { type: 'tax', name: 'Pajak Penghasilan', amount: 200 },
  rail('Stasiun Gambir'),
  prop('Banjarmasin', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550]),
  { type: 'chance', name: 'Kesempatan' },
  prop('Kupang', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550]),
  prop('Manado', 'lightblue', 120, 50, [8, 40, 100, 300, 450, 600]),
  { type: 'jail', name: 'Penjara' },
  prop('Padang', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  util('PLN Listrik'),
  prop('Palembang', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  prop('Pekanbaru', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  rail('Stasiun Bandung'),
  prop('Makassar', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { type: 'chest', name: 'Dana Umum' },
  prop('Batam', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  prop('Balikpapan', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { type: 'parking', name: 'Parkir Gratis' },
  prop('Semarang', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { type: 'chance', name: 'Kesempatan' },
  prop('Solo', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  prop('Yogyakarta', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  rail('Stasiun Surabaya'),
  prop('Malang', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  prop('Denpasar', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  util('PDAM Air'),
  prop('Bogor', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { type: 'gotojail', name: 'Masuk Penjara' },
  prop('Bandung', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  prop('Surabaya', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { type: 'chest', name: 'Dana Umum' },
  prop('Medan', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  rail('Stasiun Yogyakarta'),
  { type: 'chance', name: 'Kesempatan' },
  prop('Bali', 'darkblue', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'tax', name: 'Pajak Mewah', amount: 100 },
  prop('Jakarta', 'darkblue', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

BOARD.forEach((sq, i) => (sq.index = i));

const GROUP_MEMBERS = {};
BOARD.forEach((sq) => {
  if (sq.type === 'property') (GROUP_MEMBERS[sq.group] ??= []).push(sq.index);
});
const RAILS = BOARD.filter((s) => s.type === 'rail').map((s) => s.index);
const UTILS = BOARD.filter((s) => s.type === 'util').map((s) => s.index);
const isOwnable = (sq) => sq.type === 'property' || sq.type === 'rail' || sq.type === 'util';

const TOKENS = [
  { emoji: '🚗', name: 'Mobil', color: '#e63946' },
  { emoji: '🛵', name: 'Motor', color: '#2a9d8f' },
  { emoji: '🚲', name: 'Sepeda', color: '#f4a261' },
  { emoji: '⛵', name: 'Perahu', color: '#457b9d' },
  { emoji: '🛺', name: 'Bajaj', color: '#8e44ad' },
  { emoji: '🚁', name: 'Heli', color: '#e9c46a' },
];

const CHANCE = [
  { text: 'Maju ke **START**, terima $200.', type: 'moveTo', target: 0 },
  { text: 'Maju ke **Yogyakarta**. Lewat START terima $200.', type: 'moveTo', target: 24 },
  { text: 'Maju ke **Jakarta**.', type: 'moveTo', target: 39 },
  { text: 'Maju ke **Stasiun Gambir**. Lewat START terima $200.', type: 'moveTo', target: 5 },
  { text: 'Maju ke stasiun terdekat. Bayar sewa **2×** jika sudah ada pemiliknya.', type: 'nearest', kind: 'rail' },
  { text: 'Maju ke stasiun terdekat. Bayar sewa **2×** jika sudah ada pemiliknya.', type: 'nearest', kind: 'rail' },
  { text: 'Maju ke utilitas terdekat. Jika dimiliki, bayar **10×** dadu.', type: 'nearest', kind: 'util' },
  { text: 'Bank membayar dividen **$50**.', type: 'money', amount: 50 },
  { text: 'Kartu **Bebas dari Penjara**. Simpan sampai dibutuhkan.', type: 'jailCard' },
  { text: 'Mundur **3 petak**.', type: 'back', steps: 3 },
  { text: 'Langsung **masuk Penjara**. Tidak lewat START.', type: 'jail' },
  { text: 'Renovasi properti: bayar **$25** per rumah dan **$100** per hotel.', type: 'repairs', house: 25, hotel: 100 },
  { text: 'Denda ngebut **$15**.', type: 'money', amount: -15 },
  { text: 'Kamu terpilih jadi ketua RT: bayar **$50** ke setiap pemain.', type: 'payEach', amount: 50 },
  { text: 'Pinjaman bangunan jatuh tempo: terima **$150**.', type: 'money', amount: 150 },
  { text: 'Menang undian arisan: terima **$100**.', type: 'money', amount: 100 },
];

const CHEST = [
  { text: 'Kesalahan bank menguntungkanmu: terima **$200**.', type: 'money', amount: 200 },
  { text: 'Biaya dokter: bayar **$50**.', type: 'money', amount: -50 },
  { text: 'Jual saham: terima **$50**.', type: 'money', amount: 50 },
  { text: 'Kartu **Bebas dari Penjara**. Simpan sampai dibutuhkan.', type: 'jailCard' },
  { text: 'Langsung **masuk Penjara**. Tidak lewat START.', type: 'jail' },
  { text: 'Dana liburan cair: terima **$100**.', type: 'money', amount: 100 },
  { text: 'Pengembalian pajak: terima **$20**.', type: 'money', amount: 20 },
  { text: 'Hari ulang tahunmu: terima **$10** dari setiap pemain.', type: 'collectEach', amount: 10 },
  { text: 'Asuransi jatuh tempo: terima **$100**.', type: 'money', amount: 100 },
  { text: 'Biaya rumah sakit: bayar **$100**.', type: 'money', amount: -100 },
  { text: 'Biaya sekolah: bayar **$50**.', type: 'money', amount: -50 },
  { text: 'Komisi konsultasi: terima **$25**.', type: 'money', amount: 25 },
  { text: 'Perbaikan jalan: bayar **$40** per rumah dan **$115** per hotel.', type: 'repairs', house: 40, hotel: 115 },
  { text: 'Juara 2 lomba kecantikan: terima **$10**.', type: 'money', amount: 10 },
  { text: 'Warisan keluarga: terima **$100**.', type: 'money', amount: 100 },
  { text: 'Maju ke **START**, terima $200.', type: 'moveTo', target: 0 },
];

module.exports = { GROUPS, BOARD, GROUP_MEMBERS, RAILS, UTILS, TOKENS, CHANCE, CHEST, isOwnable };
