
/**
 * QR Code Generator - Fully Offline with Coptic Script Support
 * Supports: Coptic, Arabic, English, Greek, and all UTF-8 characters
 * No internet connection required
 */

export type QRMatrix = boolean[][];

// دالة تشفير متقدمة تدعم القبطية وكل أحرف Unicode
function utf8EncodeFull(text: string): number[] {
  const bytes: number[] = [];
  
  for (let i = 0; i < text.length; i++) {
    let codePoint = text.charCodeAt(i);
    
    // التعامل مع الـ Surrogate Pairs (للأحرف خارج BMP)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // High surrogate
      const high = codePoint;
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00);
        i++; // تخطي الـ low surrogate
      }
    }
    
    // تشفير UTF-8 حسب عدد البايتات المطلوبة
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  
  return bytes;
}

// دالة مساعدة للتحقق من صحة النص القبطي
export function isCopticText(text: string): boolean {
  const copticRange = /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u0373\u0375-\u0377\u037A-\u037D\u037F\u0384-\u038A\u038C\u038E-\u03A1\u03A3-\u03E1]/;
  return copticRange.test(text);
}

// دالة تحويل النص القبطي إلى صيغة مقروءة
export function normalizeCopticText(text: string): string {
  const copticMap: { [key: string]: string } = {
    'Ⲁ': 'Ⲁ', 'ⲁ': 'ⲁ', 'Ⲃ': 'Ⲃ', 'ⲃ': 'ⲃ', 'Ⲅ': 'Ⲅ', 'ⲅ': 'ⲅ', 'Ⲇ': 'Ⲇ', 'ⲇ': 'ⲇ', 'Ⲉ': 'Ⲉ', 'ⲉ': 'ⲉ',
    'Ⲋ': 'Ⲋ', 'ⲋ': 'ⲋ', 'Ⲍ': 'Ⲍ', 'ⲍ': 'ⲍ', 'Ⲏ': 'Ⲏ', 'ⲏ': 'ⲏ', 'Ⲑ': 'Ⲑ', 'ⲑ': 'ⲑ', 'Ⲓ': 'Ⲓ', 'ⲓ': 'ⲓ',
    'Ⲕ': 'Ⲕ', 'ⲕ': 'ⲕ', 'Ⲗ': 'Ⲗ', 'ⲗ': 'ⲗ', 'Ⲙ': 'Ⲙ', 'ⲙ': 'ⲙ', 'Ⲛ': 'Ⲛ', 'ⲛ': 'ⲛ', 'Ⲝ': 'Ⲝ', 'ⲝ': 'ⲝ',
    'Ⲟ': 'Ⲟ', 'ⲟ': 'ⲟ', 'Ⲡ': 'Ⲡ', 'ⲡ': 'ⲡ', 'Ⲣ': 'Ⲣ', 'ⲣ': 'ⲣ', 'Ⲥ': 'Ⲥ', 'ⲥ': 'ⲥ', 'Ⲧ': 'Ⲧ', 'ⲧ': 'ⲧ',
    'Ⲩ': 'Ⲩ', 'ⲩ': 'ⲩ', 'Ⲫ': 'Ⲫ', 'ⲫ': 'ⲫ', 'Ⲭ': 'Ⲭ', 'ⲭ': 'ⲭ', 'Ⲯ': 'Ⲯ', 'ⲯ': 'ⲯ', 'Ⲱ': 'Ⲱ', 'ⲱ': 'ⲱ',
    'Ϣ': 'Ϣ', 'ϣ': 'ϣ', 'Ϥ': 'Ϥ', 'ϥ': 'ϥ', 'Ϧ': 'Ϧ', 'ϧ': 'ϧ', 'Ϩ': 'Ϩ', 'ϩ': 'ϩ', 'Ϫ': 'Ϫ', 'ϫ': 'ϫ',
    'Ϭ': 'Ϭ', 'ϭ': 'ϭ', 'Ϯ': 'Ϯ', 'ϯ': 'ϯ'
  };
  let normalized = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    normalized += copticMap[char] || char;
  }
  return normalized;
}

// الدالة الرئيسية لتوليد QR Code مع دعم القبطية (متوافقة مع التطبيق)
export function generateQRMatrix(text: string): QRMatrix {
  try {
    const normalizedText = normalizeCopticText(text);
    const dataBytes = utf8EncodeFull(normalizedText);
    const dataLength = dataBytes.length;
    
    let VERSION = 1;
    if (dataLength > 19) VERSION = 2;
    if (dataLength > 34) VERSION = 3;
    if (dataLength > 55) VERSION = 4;
    if (dataLength > 80) VERSION = 5;
    if (dataLength > 108) VERSION = 6;
    if (dataLength > 136) VERSION = 7;
    
    const SIZE = 21 + (VERSION - 1) * 4;
    const dataCapacities: { [key: number]: number } = { 
      1: 19, 2: 34, 3: 55, 4: 80, 5: 108, 6: 136, 7: 156 
    };
    const eccCounts: { [key: number]: number } = { 
      1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18, 7: 20 
    };
    
    const DATA_COUNT = dataCapacities[VERSION] || 156;
    const ECC_COUNT = eccCounts[VERSION] || 20;

    
    const gfExp = new Uint8Array(512), gfLog = new Uint8Array(256);
    for (let i = 0, x = 1; i < 256; i++) {
      gfExp[i] = x; gfExp[i + 255] = x; gfLog[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }

    const polyMul = (p1: number[], p2: number[]): number[] => {
      const result = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        if (p1[i] !== 0) {
          for (let j = 0; j < p2.length; j++) {
            if (p2[j] !== 0) result[i + j] ^= gfExp[gfLog[p1[i]] + gfLog[p2[j]]];
          }
        }
      }
      return Array.from(result);
    };

    const bits: number[] = [];
    const pushBits = (value: number, length: number) => {
      for (let i = 0; i < length; i++) bits.push((value >>> (length - i - 1)) & 1);
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(dataBytes.length, 8);
    for (const byte of dataBytes) pushBits(byte, 8);

    const requiredBits = DATA_COUNT * 8;
    pushBits(0, Math.min(4, requiredBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bits.length < requiredBits) {
      pushBits(padBytes[padIndex % 2], 8);
      padIndex++;
    }

    const rawData = new Uint8Array(DATA_COUNT + ECC_COUNT);
    for (let i = 0; i < requiredBits; i++) {
      if (bits[i]) rawData[i >> 3] |= (0x80 >>> (i % 8));
    }

    let generatorPoly = [1];
    for (let i = 0; i < ECC_COUNT; i++) generatorPoly = polyMul(generatorPoly, [1, gfExp[i]]);

    const eccRem = new Uint8Array(DATA_COUNT + ECC_COUNT);
    eccRem.set(rawData.slice(0, DATA_COUNT));
    for (let i = 0; i < DATA_COUNT; i++) {
      const coeff = eccRem[i];
      if (coeff !== 0) {
        const logVal = gfLog[coeff];
        for (let j = 0; j < generatorPoly.length; j++) {
          if (generatorPoly[j] !== 0) eccRem[i + j] ^= gfExp[logVal + gfLog[generatorPoly[j]]];
        }
      }
    }
    rawData.set(eccRem.slice(DATA_COUNT), DATA_COUNT);

    const matrix = Array(SIZE).fill(0).map(() => Array(SIZE).fill(false));
    const reserved = Array(SIZE).fill(0).map(() => Array(SIZE).fill(false));
    const setPixel = (r: number, c: number, v: boolean, res = false) => {
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) { matrix[r][c] = v; if (res) reserved[r][c] = true; }
    };

    const drawFinder = (top: number, left: number) => {
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          const inP = (i >= 0 && i <= 6 && j >= 0 && j <= 6);
          const isD = inP && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
          if (inP) setPixel(top + i, left + j, isD, true);
          else if (top + i >= 0 && top + i < SIZE && left + j >= 0 && left + j < SIZE) reserved[top + i][left + j] = true;
        }
      }
    };
    drawFinder(0, 0); drawFinder(SIZE - 7, 0); drawFinder(0, SIZE - 7);

    if (VERSION >= 2) {
      const pos = (VERSION === 2) ? 18 : (VERSION === 3 ? 22 : (VERSION === 4 ? 26 : 30));
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        setPixel(pos + i, pos + j, Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0), true);
      }
    }
    for (let i = 8; i < SIZE - 8; i++) { setPixel(i, 6, i % 2 === 0, true); setPixel(6, i, i % 2 === 0, true); }

    const formatInfo = 0x7785;
    for (let i = 0; i < 15; i++) {
        const bit = ((formatInfo >> i) & 1) === 1;
        if (i < 6) setPixel(i, 8, bit, true); else if (i < 8) setPixel(i + 1, 8, bit, true); else setPixel(SIZE-15+i, 8, bit, true);
        if (i < 8) setPixel(8, SIZE - 1 - i, bit, true); else if (i < 9) setPixel(8, 15 - i, bit, true); else setPixel(8, 15-i-1, bit, true);
    }
    setPixel(SIZE - 8, 8, true, true);

    let bIdx = 0;
    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let rowIdx = 0; rowIdx < SIZE; rowIdx++) {
        const row = ((Math.floor((SIZE - 1 - col) / 2) % 2) === 0) ? SIZE - 1 - rowIdx : rowIdx;
        for (let d = 0; d < 2; d++) {
          const curC = col - d;
          if (!reserved[row][curC] && bIdx < rawData.length * 8) {
            let bit = ((rawData[Math.floor(bIdx / 8)] >>> (7 - bIdx % 8)) & 1) === 1;
            if ((row + curC) % 2 === 0) bit = !bit;
            matrix[row][curC] = bit; bIdx++;
          }
        }
      }
    }
    return matrix;
  } catch (error) { return []; }
}
