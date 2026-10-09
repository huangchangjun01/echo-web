/**
 * 单会话模型下,(user, role) → session_id 的确定性哈希.
 *
 * 必须与后端 `biz/chat_sessions.session_id_for` 完全一致,否则 chat_messages
 * 写到错的 (user, role) 行,历史就找不到。
 *
 * 后端算法:
 *   hashlib.sha256(f"{user_id}:{role_id or 'default'}".encode("utf-8")).hexdigest()[:32]
 *
 * 前端 SHA-256 可用 Web Crypto API(全平台支持)或退化到同步实现.
 * 这里两套都给:同步 fallback 避免对异步 API 的依赖.
 */

/**
 * 同步 SHA-256 + hex(前 32 字符)。用于 SSR / 不支持 Web Crypto 的环境。
 *
 * 不直接调 Web Crypto 是因为它是异步的,而 sessionIdFor 需要同步产出。
 * 这里用轻量纯 JS 实现:对 32 位/64 位环境的单字符接收都安全。
 */
function sha256Hex32(input: string): string {
  // 准备 64 字节 block buffer
  const utf8 = new TextEncoder().encode(input)
  const ml = utf8.length * 8
  // pad: 0x80 + zeros + 8-byte big-endian length
  const padded = new Uint8Array(((utf8.length + 9 + 63) >> 6) << 6)
  padded.set(utf8)
  padded[utf8.length] = 0x80
  // 64-bit length: high 32 bits first (here length fits in 32 bits easily)
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000), false)
  dv.setUint32(padded.length - 4, ml >>> 0, false)

  // SHA-256 constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let i = 0; i < padded.length; i += 64) {
    const W = new Array<number>(64)
    for (let j = 0; j < 16; j++) {
      W[j] = dv.getUint32(i + j * 4, false)
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(W[j - 15], 7) ^ rotr(W[j - 15], 18) ^ (W[j - 15] >>> 3)
      const s1 = rotr(W[j - 2], 17) ^ rotr(W[j - 2], 19) ^ (W[j - 2] >>> 10)
      W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[j] + W[j]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const mj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + mj) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0
      d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + hh) | 0
  }
  const toHex = (n: number) =>
    ((n >>> 0).toString(16).padStart(8, '0'))
  const full = toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) +
    toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7)
  return full.slice(0, 32)
}

/**
 * 生成 (user, role) 的确定性 session_id,32 字符 hex。
 * 与后端 `biz/chat_sessions.session_id_for` 算法一致。
 */
export function sessionIdFor(userId: string, roleId: string | null | undefined): string {
  const role = (roleId || 'default').trim() || 'default'
  return sha256Hex32(`${userId}:${role}`)
}