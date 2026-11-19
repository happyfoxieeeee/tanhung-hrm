'use strict';
/**
 * Argon2id (RFC 9106, phiên bản 0x13) viết bằng JavaScript thuần — không phụ thuộc thư viện ngoài.
 * Đã kiểm chứng bằng vector kiểm thử chính thức của RFC 9106 (xem tests/argon2.test.js).
 * Số 64-bit được biểu diễn bằng cặp uint32 (lo, hi) trong Uint32Array.
 */
const crypto = require('crypto');

/* ---------------- BLAKE2b ---------------- */
const IV32 = new Uint32Array([
  0xF3BCC908, 0x6A09E667, 0x84CAA73B, 0xBB67AE85, 0xFE94F82B, 0x3C6EF372, 0x5F1D36F1, 0xA54FF53A,
  0xADE682D1, 0x510E527F, 0x2B3E6C1F, 0x9B05688C, 0xFB41BD6B, 0x1F83D9AB, 0x137E2179, 0x5BE0CD19,
]);
const SIGMA8 = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
  11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
  7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
  9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
  2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
  12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
  13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
  6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
  10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
];
const SIGMA82 = new Uint8Array(SIGMA8.map((x) => x * 2));
const bv = new Uint32Array(32);
const bm = new Uint32Array(32);

function ADD64AA(v, a, b) { const o0 = v[a] + v[b]; let o1 = v[a + 1] + v[b + 1]; if (o0 >= 0x100000000) o1++; v[a] = o0; v[a + 1] = o1; }
function ADD64AC(v, a, b0, b1) { let o0 = v[a] + b0; if (b0 < 0) o0 += 0x100000000; let o1 = v[a + 1] + b1; if (o0 >= 0x100000000) o1++; v[a] = o0; v[a + 1] = o1; }
function B2B_G(a, b, c, d, ix, iy) {
  const v = bv, m = bm;
  const x0 = m[ix], x1 = m[ix + 1], y0 = m[iy], y1 = m[iy + 1];
  ADD64AA(v, a, b); ADD64AC(v, a, x0, x1);
  let xor0 = v[d] ^ v[a], xor1 = v[d + 1] ^ v[a + 1]; v[d] = xor1; v[d + 1] = xor0;
  ADD64AA(v, c, d);
  xor0 = v[b] ^ v[c]; xor1 = v[b + 1] ^ v[c + 1]; v[b] = (xor0 >>> 24) ^ (xor1 << 8); v[b + 1] = (xor1 >>> 24) ^ (xor0 << 8);
  ADD64AA(v, a, b); ADD64AC(v, a, y0, y1);
  xor0 = v[d] ^ v[a]; xor1 = v[d + 1] ^ v[a + 1]; v[d] = (xor0 >>> 16) ^ (xor1 << 16); v[d + 1] = (xor1 >>> 16) ^ (xor0 << 16);
  ADD64AA(v, c, d);
  xor0 = v[b] ^ v[c]; xor1 = v[b + 1] ^ v[c + 1]; v[b] = (xor1 >>> 31) ^ (xor0 << 1); v[b + 1] = (xor0 >>> 31) ^ (xor1 << 1);
}
function compress(ctx, last) {
  const v = bv, m = bm;
  for (let i = 0; i < 16; i++) { v[i] = ctx.h[i]; v[i + 16] = IV32[i]; }
  v[24] ^= ctx.t; v[25] ^= ctx.t / 0x100000000;
  if (last) { v[28] = ~v[28]; v[29] = ~v[29]; }
  const b = ctx.b;
  for (let i = 0; i < 32; i++) { const j = 4 * i; m[i] = b[j] ^ (b[j + 1] << 8) ^ (b[j + 2] << 16) ^ (b[j + 3] << 24); }
  for (let i = 0; i < 12; i++) {
    const s = i * 16;
    B2B_G(0, 8, 16, 24, SIGMA82[s], SIGMA82[s + 1]); B2B_G(2, 10, 18, 26, SIGMA82[s + 2], SIGMA82[s + 3]);
    B2B_G(4, 12, 20, 28, SIGMA82[s + 4], SIGMA82[s + 5]); B2B_G(6, 14, 22, 30, SIGMA82[s + 6], SIGMA82[s + 7]);
    B2B_G(0, 10, 20, 30, SIGMA82[s + 8], SIGMA82[s + 9]); B2B_G(2, 12, 22, 24, SIGMA82[s + 10], SIGMA82[s + 11]);
    B2B_G(4, 14, 16, 26, SIGMA82[s + 12], SIGMA82[s + 13]); B2B_G(6, 8, 18, 28, SIGMA82[s + 14], SIGMA82[s + 15]);
  }
  for (let i = 0; i < 16; i++) ctx.h[i] = ctx.h[i] ^ v[i] ^ v[i + 16];
}
function b2bInit(outlen) {
  const ctx = { b: new Uint8Array(128), h: new Uint32Array(16), t: 0, c: 0, outlen };
  for (let i = 0; i < 16; i++) ctx.h[i] = IV32[i];
  ctx.h[0] ^= 0x01010000 ^ outlen;
  return ctx;
}
function b2bUpdate(ctx, input) {
  for (let i = 0; i < input.length; i++) {
    if (ctx.c === 128) { ctx.t += ctx.c; compress(ctx, false); ctx.c = 0; }
    ctx.b[ctx.c++] = input[i];
  }
}
function b2bFinal(ctx) {
  ctx.t += ctx.c;
  while (ctx.c < 128) ctx.b[ctx.c++] = 0;
  compress(ctx, true);
  const out = new Uint8Array(ctx.outlen);
  for (let i = 0; i < ctx.outlen; i++) out[i] = ctx.h[i >> 2] >> (8 * (i & 3));
  return out;
}
function blake2b(parts, outlen) { const ctx = b2bInit(outlen); for (const p of parts) b2bUpdate(ctx, p); return b2bFinal(ctx); }
const le32 = (n) => { const b = new Uint8Array(4); b[0] = n; b[1] = n >>> 8; b[2] = n >>> 16; b[3] = n >>> 24; return b; };

/** H' — hàm băm độ dài thay đổi của Argon2 */
function hPrime(T, parts) {
  if (T <= 64) return blake2b([le32(T), ...parts], T);
  const out = new Uint8Array(T); const r = Math.ceil(T / 32) - 2;
  let v = blake2b([le32(T), ...parts], 64); out.set(v.subarray(0, 32), 0);
  for (let i = 1; i < r; i++) { v = blake2b([v], 64); out.set(v.subarray(0, 32), i * 32); }
  v = blake2b([v], T - 32 * r); out.set(v, r * 32);
  return out;
}

/* ---------------- Hàm nén G của Argon2 ---------------- */
// Phép nhân 32x32 → 64 bit chính xác, trả về qua biến toàn cục để tránh cấp phát
let MLO = 0, MHI = 0;
function mul32(a, b) {
  const al = a & 0xffff, ah = a >>> 16, bl = b & 0xffff, bh = b >>> 16;
  const ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh;
  const mid = (ll >>> 16) + (lh & 0xffff) + (hl & 0xffff);
  MLO = (((mid & 0xffff) << 16) | (ll & 0xffff)) >>> 0;
  MHI = (hh + (lh >>> 16) + (hl >>> 16) + (mid >>> 16)) >>> 0;
}
const R = new Uint32Array(256), Z = new Uint32Array(256);
// GB tối ưu: thao tác trực tiếp trên biến cục bộ (a,b,c,d là chỉ số từ 64-bit)
function GB(w, a, b, c, d) {
  a <<= 1; b <<= 1; c <<= 1; d <<= 1;
  let al = w[a], ah = w[a + 1], bl = w[b], bh = w[b + 1], cl = w[c], ch = w[c + 1], dl = w[d], dh = w[d + 1];
  let t0, t1, xl, xh;
  // a = a + b + 2*lo(a)*lo(b)
  mul32(al, bl); t1 = ((MHI << 1) | (MLO >>> 31)) >>> 0; t0 = (MLO << 1) >>> 0;
  xl = al + bl; xh = ah + bh; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; }
  xl += t0; xh += t1; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; } al = xl; ah = xh >>> 0;
  // d = (d ^ a) >>> 32
  xl = dl ^ al; xh = dh ^ ah; dl = xh >>> 0; dh = xl >>> 0;
  // c = c + d + 2*lo(c)*lo(d)
  mul32(cl, dl); t1 = ((MHI << 1) | (MLO >>> 31)) >>> 0; t0 = (MLO << 1) >>> 0;
  xl = cl + dl; xh = ch + dh; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; }
  xl += t0; xh += t1; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; } cl = xl; ch = xh >>> 0;
  // b = (b ^ c) >>> 24
  xl = bl ^ cl; xh = bh ^ ch; bl = ((xl >>> 24) | (xh << 8)) >>> 0; bh = ((xh >>> 24) | (xl << 8)) >>> 0;
  // a = a + b + 2*lo(a)*lo(b)
  mul32(al, bl); t1 = ((MHI << 1) | (MLO >>> 31)) >>> 0; t0 = (MLO << 1) >>> 0;
  xl = al + bl; xh = ah + bh; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; }
  xl += t0; xh += t1; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; } al = xl; ah = xh >>> 0;
  // d = (d ^ a) >>> 16
  xl = dl ^ al; xh = dh ^ ah; dl = ((xl >>> 16) | (xh << 16)) >>> 0; dh = ((xh >>> 16) | (xl << 16)) >>> 0;
  // c = c + d + 2*lo(c)*lo(d)
  mul32(cl, dl); t1 = ((MHI << 1) | (MLO >>> 31)) >>> 0; t0 = (MLO << 1) >>> 0;
  xl = cl + dl; xh = ch + dh; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; }
  xl += t0; xh += t1; if (xl > 0xffffffff) { xl -= 0x100000000; xh++; } cl = xl; ch = xh >>> 0;
  // b = (b ^ c) >>> 63
  xl = bl ^ cl; xh = bh ^ ch; bl = ((xh >>> 31) | (xl << 1)) >>> 0; bh = ((xl >>> 31) | (xh << 1)) >>> 0;
  w[a] = al; w[a + 1] = ah; w[b] = bl; w[b + 1] = bh; w[c] = cl; w[c + 1] = ch; w[d] = dl; w[d + 1] = dh;
}
// P trên 16 từ 64-bit có chỉ số idx[0..15] trong w
function P(w, i0, i1, i2, i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14, i15) {
  GB(w, i0, i4, i8, i12); GB(w, i1, i5, i9, i13); GB(w, i2, i6, i10, i14); GB(w, i3, i7, i11, i15);
  GB(w, i0, i5, i10, i15); GB(w, i1, i6, i11, i12); GB(w, i2, i7, i8, i13); GB(w, i3, i4, i9, i14);
}
/** out[oOff..] = G(X, Y) (xorOld: out ^= G(X,Y)) — các khối là 256 uint32 trong mảng mem */
function G(mem, xOff, yOff, out, oOff, xorOld) {
  for (let i = 0; i < 256; i++) { R[i] = mem[xOff + i] ^ mem[yOff + i]; Z[i] = R[i]; }
  for (let r = 0; r < 8; r++) { const b = 16 * r; P(Z, b, b + 1, b + 2, b + 3, b + 4, b + 5, b + 6, b + 7, b + 8, b + 9, b + 10, b + 11, b + 12, b + 13, b + 14, b + 15); }
  for (let c = 0; c < 8; c++) { const b = 2 * c; P(Z, b, b + 1, b + 16, b + 17, b + 32, b + 33, b + 48, b + 49, b + 64, b + 65, b + 80, b + 81, b + 96, b + 97, b + 112, b + 113); }
  if (xorOld) for (let i = 0; i < 256; i++) out[oOff + i] ^= Z[i] ^ R[i];
  else for (let i = 0; i < 256; i++) out[oOff + i] = Z[i] ^ R[i];
}

/* ---------------- Argon2id ---------------- */
function argon2idRaw({ password, salt, secret = new Uint8Array(0), ad = new Uint8Array(0), t, m, p, tagLength }) {
  const y = 2, version = 0x13;
  const H0 = blake2b([le32(p), le32(tagLength), le32(m), le32(t), le32(version), le32(y),
    le32(password.length), password, le32(salt.length), salt, le32(secret.length), secret, le32(ad.length), ad], 64);
  const mBlocks = 4 * p * Math.floor(m / (4 * p)); const q = mBlocks / p; const SL = q / 4;
  const mem = new Uint32Array(mBlocks * 256);
  const toWords = (bytes, off) => { for (let i = 0; i < 256; i++) mem[off + i] = bytes[4 * i] | (bytes[4 * i + 1] << 8) | (bytes[4 * i + 2] << 16) | (bytes[4 * i + 3] << 24); };
  for (let l = 0; l < p; l++) {
    toWords(hPrime(1024, [H0, le32(0), le32(l)]), (l * q) * 256);
    toWords(hPrime(1024, [H0, le32(1), le32(l)]), (l * q + 1) * 256);
  }
  const zero = new Uint32Array(256), input = new Uint32Array(256), addr = new Uint32Array(256), tmp = new Uint32Array(256);
  const scratch = new Uint32Array(768); // [zero | input | tmp] cho G trên vùng nhớ riêng
  for (let r = 0; r < t; r++) {
    for (let s = 0; s < 4; s++) {
      for (let l = 0; l < p; l++) {
        const dataIndependent = r === 0 && s < 2;
        let counter = 0;
        if (dataIndependent) { input.fill(0); input[0] = r; input[2] = l; input[4] = s; input[6] = mBlocks; input[8] = t; input[10] = y; }
        const startIdx = (r === 0 && s === 0) ? 2 : 0;
        const nextAddr = () => {
          counter++; input[12] = counter; input[13] = 0;
          scratch.set(zero, 0); scratch.set(input, 256);
          G(scratch, 0, 256, scratch, 512, false); // tmp = G(0, input)
          tmp.set(scratch.subarray(512, 768));
          scratch.set(tmp, 256);
          G(scratch, 0, 256, scratch, 512, false); // addr = G(0, tmp)
          addr.set(scratch.subarray(512, 768));
        };
        if (dataIndependent && startIdx !== 0) nextAddr();
        for (let idx = startIdx; idx < SL; idx++) {
          const j = s * SL + idx; const cur = l * q + j; const prev = j === 0 ? l * q + q - 1 : cur - 1;
          let J1, J2;
          if (dataIndependent) {
            if (idx % 128 === 0) nextAddr();
            const k = (idx % 128) * 2; J1 = addr[k]; J2 = addr[k + 1];
          } else { J1 = mem[prev * 256]; J2 = mem[prev * 256 + 1]; }
          J1 >>>= 0; J2 >>>= 0;
          const refLane = (r === 0 && s === 0) ? l : J2 % p;
          const sameLane = refLane === l;
          let W;
          if (r === 0) W = sameLane ? s * SL + idx - 1 : s * SL + (idx === 0 ? -1 : 0);
          else W = sameLane ? q - SL + idx - 1 : q - SL + (idx === 0 ? -1 : 0);
          mul32(J1, J1); const x = MHI; mul32(W >>> 0, x); const yv = MHI;
          const zz = W - 1 - yv;
          const startPos = (r === 0 || s === 3) ? 0 : (s + 1) * SL;
          const refIdx = (startPos + zz) % q;
          G(mem, prev * 256, (refLane * q + refIdx) * 256, mem, cur * 256, r > 0);
        }
      }
    }
  }
  const C = new Uint32Array(256);
  for (let l = 0; l < p; l++) { const off = (l * q + q - 1) * 256; for (let i = 0; i < 256; i++) C[i] ^= mem[off + i]; }
  const Cb = new Uint8Array(1024); for (let i = 0; i < 256; i++) { Cb[4 * i] = C[i]; Cb[4 * i + 1] = C[i] >>> 8; Cb[4 * i + 2] = C[i] >>> 16; Cb[4 * i + 3] = C[i] >>> 24; }
  return hPrime(tagLength, [Cb]);
}

/* ---------------- Chuỗi PHC: $argon2id$v=19$m=..,t=..,p=..$salt$hash ---------------- */
const b64 = (u8) => Buffer.from(u8).toString('base64').replace(/=+$/, '');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
// Tham số khuyến nghị OWASP: m = 19 MiB, t = 2, p = 1
const DEFAULTS = { m: 19456, t: 2, p: 1, tagLength: 32 };

function hashPassword(password, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const salt = new Uint8Array(crypto.randomBytes(16));
  const tag = argon2idRaw({ password: new Uint8Array(Buffer.from(String(password).normalize('NFC'), 'utf8')), salt, t: o.t, m: o.m, p: o.p, tagLength: o.tagLength });
  return `$argon2id$v=19$m=${o.m},t=${o.t},p=${o.p}$${b64(salt)}$${b64(tag)}`;
}
function parsePHC(phc) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(String(phc || ''));
  if (!m) return null;
  return { m: +m[1], t: +m[2], p: +m[3], salt: unb64(m[4]), hash: unb64(m[5]) };
}
function verifyPassword(password, phc) {
  const ph = parsePHC(phc); if (!ph) return false;
  if (ph.m > 262144 || ph.t > 10 || ph.p > 8) return false; // chặn tham số bất thường
  const tag = argon2idRaw({ password: new Uint8Array(Buffer.from(String(password).normalize('NFC'), 'utf8')), salt: ph.salt, t: ph.t, m: ph.m, p: ph.p, tagLength: ph.hash.length });
  return tag.length === ph.hash.length && crypto.timingSafeEqual(Buffer.from(tag), Buffer.from(ph.hash));
}
function needsRehash(phc) { const ph = parsePHC(phc); return !ph || ph.m < DEFAULTS.m || ph.t < DEFAULTS.t; }

module.exports = { argon2idRaw, hashPassword, verifyPassword, needsRehash, blake2b, DEFAULTS };
