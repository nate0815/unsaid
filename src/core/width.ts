/* 字元寬度：一個字元佔幾格。
 *
 * 中文、全形標點、韓文、多數 emoji 佔 2 格（DESIGN「中文與全形字」）。
 * 只靠這張表判斷，不靠字型量測 —— 對方裝置的字型不同，量出來的寬度就不同，
 * 而格子的佈局必須在製作者與觀看者兩端完全一致。
 */

/** East Asian Wide／Fullwidth 的主要區段（含頭尾）。不求完整，求常用字不漏。 */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // 韓文字母（初聲）
  [0x2e80, 0x303e], // CJK 部首、康熙部首、CJK 符號與標點（、。「」等）
  [0x3041, 0x33ff], // 平假名、片假名、注音、CJK 相容
  [0x3400, 0x4dbf], // CJK 擴展 A
  [0x4e00, 0x9fff], // CJK 統一表意文字
  [0xa000, 0xa4cf], // 彝文
  [0xac00, 0xd7a3], // 韓文音節
  [0xf900, 0xfaff], // CJK 相容表意文字
  [0xfe30, 0xfe4f], // CJK 相容形式（直排標點）
  [0xff00, 0xff60], // 全形 ASCII（！，：？等）
  [0xffe0, 0xffe6], // 全形符號
  [0x1f300, 0x1f64f], // emoji：符號與象形、表情
  [0x1f900, 0x1f9ff], // emoji：補充符號與象形
  [0x20000, 0x2fffd], // CJK 擴展 B～F
  [0x30000, 0x3fffd], // CJK 擴展 G～
]

/** 不佔格的字元：控制字元、組合用附加符號、變體選擇器、零寬字元。 */
function isZeroWidth(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp < 0xa0) ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  )
}

/** 一個字元（單一碼位）佔幾格：0、1 或 2。 */
export function charWidth(ch: string): 0 | 1 | 2 {
  const cp = ch.codePointAt(0)
  if (cp === undefined || isZeroWidth(cp)) return 0
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp < lo) break
    if (cp <= hi) return 2
  }
  return 1
}

/** 把字串拆成「會佔格」的字元陣列（以碼位切，丟掉零寬字元）。
 *  ⚠️ 不能用 `str.split('')` —— 擴展 B 的漢字與 emoji 是代理對，會被切成兩半。 */
export function splitChars(text: string): string[] {
  return Array.from(text).filter((ch) => charWidth(ch) > 0)
}
