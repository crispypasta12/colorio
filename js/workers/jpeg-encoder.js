class BitWriter {

  constructor(byteCallback) {
    this.__bufsize = 1024;
    this.__buf = new Uint8Array(this.__bufsize);
    this.__bufptr = 0;
    this.__bitcount = 0;
    this.__bitcache = 0;
    this.__byteswritten = 0;
    this.__byteCallback = byteCallback;
  }

  align() {
    this.putBits(0xff, ((32 - this.__bitcount) & 0x7));
  }

  putShort(s) {
    this.__flushBuffers();
    this.__buf[this.__bufptr++] = ((s)&0xffff)>>>8;
    this.__buf[this.__bufptr++] = s&0xff;
  }

  putByte(b) {
    this.__flushBuffers();
    this.__buf[this.__bufptr++] = b;
  }

  putBits(val, bits) {
    this.__emptyBitBuffer16();
    this.__shoveBits(val, bits);
  }

  end() {

    if (this.__byteCallback) {
      this.__byteCallback(this.__buf, 0, this.__bufptr);
    }

    this.__byteswritten += this.__bufptr;
    this.__bufptr = 0;

  }

  __emptyBitBuffer() {

    do {  // Check if we need to dump buffer

      if (this.__bufptr >= this.__bufsize ) {
        this.end();
      }

      const b = (this.__bitcache >> 24) & 0xff;

      if (b === 0xff) { /*Add 0x00 stuffing*/
        this.__bitcache &= 0x00ffffff;
        this.__buf[this.__bufptr++] = 0xff;
        continue;
      }

      this.__buf[this.__bufptr++] = b;

      this.__bitcache <<= 8; // remove bits from bitcache
      this.__bitcount -= 8;

    } while(this.__bitcount >= 8);

  }

  __emptyBitBuffer16() {
    if (this.__bitcount > 16) {
      this.__emptyBitBuffer();
    }
  }

  __shoveBits(val, bits) {
    this.__bitcache |= (val & ((1 << (bits)) - 1))  << (32 - this.__bitcount - bits);
    this.__bitcount += bits;
  }

  __flushBuffers() {
    this.align();
    if (this.__bitcount >= 8) {
      this.__emptyBitBuffer();
      this.end();
    }
  }

}

export class JpegEncoder {

  constructor() {
    
    // Standard Encoding Tables
    this.__std_dc_luminance_nrcodes = new Uint32Array([0,0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0]);
    this.__std_dc_luminance_values = new Uint32Array([0,1,2,3,4,5,6,7,8,9,10,11]);
    this.__std_ac_luminance_nrcodes = new Uint32Array([0,0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,0x7d]);
    this.__std_ac_luminance_values = new Uint32Array([0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,
      0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,
      0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,
      0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,
      0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,
      0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,
      0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,
      0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,
      0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,
      0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,
      0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,
      0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,
      0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,
      0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,
      0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,
      0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,
      0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,
      0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,
      0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,
      0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,
      0xf9,0xfa]);
    this.__std_dc_chrominance_nrcodes = new Uint32Array([0,0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0]);
    this.__std_dc_chrominance_values = new Uint32Array([0,1,2,3,4,5,6,7,8,9,10,11]);
    this.__std_ac_chrominance_nrcodes = new Uint32Array([0,0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,0x77]);
    this.__std_ac_chrominance_values = new Uint32Array([0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,
      0x31,0x06,0x12,0x41,0x51,0x07,0x61,0x71,
      0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,
      0xa1,0xb1,0xc1,0x09,0x23,0x33,0x52,0xf0,
      0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,
      0xe1,0x25,0xf1,0x17,0x18,0x19,0x1a,0x26,
      0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,
      0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,
      0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,
      0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,
      0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,
      0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,
      0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,
      0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,
      0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,
      0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,
      0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,
      0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,
      0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,
      0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,
      0xf9,0xfa
    ]);
    this.__jpeg_natural_order = new Uint32Array([
      0,  1,  8, 16,  9,  2,  3, 10,
      17, 24, 32, 25, 18, 11,  4,  5,
      12, 19, 26, 33, 40, 48, 41, 34,
      27, 20, 13,  6,  7, 14, 21, 28,
      35, 42, 49, 56, 57, 50, 43, 36,
      29, 22, 15, 23, 30, 37, 44, 51,
      58, 59, 52, 45, 38, 31, 39, 46,
      53, 60, 61, 54, 47, 55, 62, 63,
      63, 63, 63, 63, 63, 63, 63, 63, /* extra entries for safety in decoder */
      63, 63, 63, 63, 63, 63, 63, 63
    ]);
    this.__zz = new Uint32Array([
      0, 1, 5, 6,14,15,27,28,
      2, 4, 7,13,16,26,29,42,
      3, 8,12,17,25,30,41,43,
      9,11,18,24,31,40,44,53,
      10,19,23,32,39,45,52,54,
      20,22,33,38,46,51,55,60,
      21,34,37,47,50,56,59,61,
      35,36,48,49,57,58,62,63
    ]);
    this.__aasf = new Float64Array([
      1.0, 1.387039845, 1.306562965, 1.175875602,
      1.0, 0.785694958, 0.541196100, 0.275899379
    ]);
    this.__YQT = new Uint32Array([
      16, 11, 10, 16, 24, 40, 51, 61,
      12, 12, 14, 19, 26, 58, 60, 55,
      14, 13, 16, 24, 40, 57, 69, 56,
      14, 17, 22, 29, 51, 87, 80, 62,
      18, 22, 37, 56, 68,109,103, 77,
      24, 35, 55, 64, 81,104,113, 92,
      49, 64, 78, 87,103,121,120,101,
      72, 92, 95, 98,112,100,103, 99
    ]);
    this.__UVQT = new Uint32Array([
      17, 18, 24, 47, 99, 99, 99, 99,
      18, 21, 26, 66, 99, 99, 99, 99,
      24, 26, 56, 99, 99, 99, 99, 99,
      47, 66, 99, 99, 99, 99, 99, 99,
      99, 99, 99, 99, 99, 99, 99, 99,
      99, 99, 99, 99, 99, 99, 99, 99,
      99, 99, 99, 99, 99, 99, 99, 99,
      99, 99, 99, 99, 99, 99, 99, 99
    ]);

    // Encoding and quantization buffers
    this.__fdtbl_Y = new Float64Array(64);
    this.__fdtbl_UV = new Float64Array(64);
    this.__YDU = new Float64Array(64);
    this.__YDU2 = new Float64Array(64);
    this.__YDU3 = new Float64Array(64);
    this.__YDU4 = new Float64Array(64);

    this.__UDU = new Float64Array(64);
    this.__UDU1 = new Float64Array(64);
    this.__UDU2 = new Float64Array(64);
    this.__UDU3 = new Float64Array(64);
    this.__UDU4 = new Float64Array(64);

    this.__VDU = new Float64Array(64);
    this.__VDU1 = new Float64Array(64);
    this.__VDU2 = new Float64Array(64);
    this.__VDU3 = new Float64Array(64);
    this.__VDU4 = new Float64Array(64);

    this.__YTable = new Int32Array(64);
    this.__UVTable = new Int32Array(64);
    this.__outputfDCTQuant = new Int32Array(64);

    this.__YDC_HT = new Array(256);
    this.__UVDC_HT= new Array(256);
    this.__YAC_HT = new Array(256);
    this.__UVAC_HT= new Array(256);

    // init the huffman tables
    this.__computeHuffmanTbl(this.__std_dc_luminance_nrcodes, this.__std_dc_luminance_values, this.__YDC_HT);
    this.__computeHuffmanTbl(this.__std_dc_chrominance_nrcodes, this.__std_dc_chrominance_values, this.__UVDC_HT);
    this.__computeHuffmanTbl(this.__std_ac_luminance_nrcodes, this.__std_ac_luminance_values, this.__YAC_HT);
    this.__computeHuffmanTbl(this.__std_ac_chrominance_nrcodes, this.__std_ac_chrominance_values, this.__UVAC_HT);

  }

  encode(rgbaArray, width, height, quality = 85, chromaSubsampling = 'auto') {

    const _444 = chromaSubsampling === 'auto' ? quality > 50 : true;

    // accumulate encoded data in a blob. This is more memory efficient
    // than accumulating it in memory since large blobs can be streamed to disk.
    // (we can't reuse the input array since it messes up the top pixel rows)

    const type = {type: 'image/jpeg'};
    let blob = new Blob([], type);
    let bufptr = 0, bufsize = 1024 * 1024 * 4; // write chunks of 4mb at a time
    const writeBuffer = new Uint8Array(bufsize);
    this.__bitwriter = new BitWriter((array, start, count) => {

      let i = 0;

      while (i < count) {

        const remainingBuffer = bufsize - bufptr;
        const remainingData = count - i;
        const bytesToCopy = Math.min(remainingBuffer, remainingData);

        // Copy as many bytes as we can into the current buffer
        for (let j = 0; j < bytesToCopy; j++) {
          writeBuffer[bufptr + j] = array[start + i + j];
        }

        bufptr += bytesToCopy;
        i += bytesToCopy;

        // If buffer is full, create new blob and reset pointer
        if (bufptr >= bufsize) {
          blob = new Blob([blob, writeBuffer.slice(0, bufptr)], type);
          bufptr = 0;
        }

      }

    });

    this.__data = rgbaArray;
    this.__width = width;
    this.__height = height;

    // assign main float / half float conversion function
    /*if (rgbaArray instanceof Uint16Array) {
      this.__rgb2yuv_444 = this.__rgb2yuv_444_16;
    } else if (rgbaArray instanceof Float32Array) {
      this.__rgb2yuv_444 = this.__rgb2yuv_444_32;
    } else {
      this.__rgb2yuv_444 = this.__rgb2yuv_444_8;
    }*/

    this.__init_quality_settings(quality);

    // write headers out
    this.__bitwriter.putShort(0xFFD8); // SOI
    this.__writeAPP0();
    this.__writeDQT();
    this.__writeSOF0(_444);
    this.__writeDHT();
    this.__writeSOS();

    // write data. this could be augmented to write partial
    // data sequentially to avoid having to hold all data in memory.

    // MCU(minimum coding units) are 8x8 blocks for now
    let DCU = 0, DCY = 0, DCV = 0;

    if (_444) { // 4:4:4
      for (let ypos = 0; ypos < height; ypos += 8) {
        for (let xpos = 0; xpos < width; xpos += 8) {
          this.__rgb2yuv_444(xpos, ypos, this.__YDU, this.__UDU, this.__VDU);
          DCY = this.__processDU(this.__YDU, this.__fdtbl_Y, DCY, this.__YDC_HT, this.__YAC_HT);
          DCU = this.__processDU(this.__UDU, this.__fdtbl_UV, DCU, this.__UVDC_HT, this.__UVAC_HT);
          DCV = this.__processDU(this.__VDU, this.__fdtbl_UV, DCV, this.__UVDC_HT, this.__UVAC_HT);
        }
      }
    } else { // 4:2:0
      for (let ypos = 0; ypos < height; ypos += 16) {
        for(let xpos = 0; xpos < width; xpos += 16 ) {
          this.__rgb2yuv_420(xpos, ypos);
          DCY = this.__processDU(this.__YDU, this.__fdtbl_Y, DCY, this.__YDC_HT, this.__YAC_HT);
          DCY = this.__processDU(this.__YDU2, this.__fdtbl_Y, DCY, this.__YDC_HT, this.__YAC_HT);
          DCY = this.__processDU(this.__YDU3, this.__fdtbl_Y, DCY, this.__YDC_HT, this.__YAC_HT);
          DCY = this.__processDU(this.__YDU4, this.__fdtbl_Y, DCY, this.__YDC_HT, this.__YAC_HT);
          DCU = this.__processDU(this.__UDU, this.__fdtbl_UV, DCU, this.__UVDC_HT, this.__UVAC_HT);
          DCV = this.__processDU(this.__VDU, this.__fdtbl_UV, DCV, this.__UVDC_HT, this.__UVAC_HT);
        }
      }
    }

    this.__writeEOI();

    // add remaining bytes to blob
    if (bufptr > 0) blob = new Blob([blob, writeBuffer.slice(0, bufptr)], type);

    return blob;

  }

  __init_quality_settings(quality) {

    if (quality <= 0) quality = 1;
    if (quality > 100) quality = 100;

    const scalingFactor = quality < 50 ? (5000 / quality)|0 : (200 - (quality<<1))|0;

    // init quantization tables
    const zz = this.__zz;
    const aasf = this.__aasf;
    const YQT = this.__YQT;
    const UVQT = this.__UVQT;

    let i;
    for (i = 0; i < 64; ++i) {
      const t = ((YQT[i]*scalingFactor+50)*0.01)|0;
      const u = ((UVQT[i]*scalingFactor+50)*0.01)|0;
      this.__YTable[zz[i]] = t < 1 ? 1 : t > 255 ? 255 : t;
      this.__UVTable[zz[i]] = u < 1 ? 1 : u > 255 ? 255 : u;
    }

    i = 0;
    let row, col;
    for (row = 0; row < 8; ++row) {
      for (col = 0; col < 8; ++col) {
        this.__fdtbl_Y[i]  = (1 / (this.__YTable [zz[i]] * aasf[row] * aasf[col] * 8));
        this.__fdtbl_UV[i] = (1 / (this.__UVTable[zz[i]] * aasf[row] * aasf[col] * 8));
        i++;
      }
    }

  }

  __computeHuffmanTbl(nrcodes, std_table, HT) {

    let codevalue = 0;    //int
    let pos_in_table = 0; //int
    let k, j;                //int

    // initialize table
    for(k = 0; k < 256; k++ ) {
      HT[k] = {val: 0, len: 0};
    }

    for (k = 1; k <= 16; ++k) {
      for (j = 1; j <= nrcodes[k]; ++j) {
        HT[std_table[pos_in_table]] = {val: codevalue, len: k};
        pos_in_table++;
        codevalue++;
      }
      codevalue<<=1;
    }

  }

  __fDCTQuant(data, fdtbl) {

    /* Pass 1: process rows. */
    let dataOff = 0;
    let d0,d1,d2,d3,d4,d5,d6,d7;
    let i;

    for (i = 0; i < 8; ++i) {

      d0 = data[dataOff];
      d1 = data[dataOff+1];
      d2 = data[dataOff+2];
      d3 = data[dataOff+3];
      d4 = data[dataOff+4];
      d5 = data[dataOff+5];
      d6 = data[dataOff+6];
      d7 = data[dataOff+7];

      const tmp0 = d0 + d7;
      const tmp7 = d0 - d7;
      const tmp1 = d1 + d6;
      const tmp6 = d1 - d6;
      const tmp2 = d2 + d5;
      const tmp5 = d2 - d5;
      const tmp3 = d3 + d4;
      const tmp4 = d3 - d4;

      /* Even part */
      let tmp10 = tmp0 + tmp3;	/* phase 2 */
      const tmp13 = tmp0 - tmp3;
      let tmp11 = tmp1 + tmp2;
      let tmp12 = tmp1 - tmp2;

      data[dataOff   ] = tmp10 + tmp11; /* phase 3 */
      data[dataOff+4 ] = tmp10 - tmp11;

      const z1 = (tmp12 + tmp13) * 0.707106781; /* c4 */
      data[dataOff+2] = tmp13 + z1; /* phase 5 */
      data[dataOff+6] = tmp13 - z1;

      /* Odd part */
      tmp10 = tmp4 + tmp5; /* phase 2 */
      tmp11 = tmp5 + tmp6;
      tmp12 = tmp6 + tmp7;

      /* The rotator is modified from fig 4-8 to avoid extra negations. */
      const z5 = (tmp10 - tmp12) * 0.382683433; /* c6 */
      const z2 = 0.541196100 * tmp10 + z5; /* c2-c6 */
      const z4 = 1.306562965 * tmp12 + z5; /* c2+c6 */
      const z3 = tmp11 * 0.707106781; /* c4 */

      const z11 = tmp7 + z3;	/* phase 5 */
      const z13 = tmp7 - z3;

      data[dataOff+5] = z13 + z2;	/* phase 6 */
      data[dataOff+3] = z13 - z2;
      data[dataOff+1] = z11 + z4;
      data[dataOff+7] = z11 - z4;

      dataOff += 8; /* advance pointer to next row */
    }

    /* Pass 2: process columns. */
    dataOff = 0;
    for (i = 0; i < 8; ++i) {
      d0 = data[dataOff];
      d1 = data[dataOff + 8];
      d2 = data[dataOff + 16];
      d3 = data[dataOff + 24];
      d4 = data[dataOff + 32];
      d5 = data[dataOff + 40];
      d6 = data[dataOff + 48];
      d7 = data[dataOff + 56];

      const tmp0p2 = d0 + d7;
      const tmp7p2 = d0 - d7;
      const tmp1p2 = d1 + d6;
      const tmp6p2 = d1 - d6;
      const tmp2p2 = d2 + d5;
      const tmp5p2 = d2 - d5;
      const tmp3p2 = d3 + d4;
      const tmp4p2 = d3 - d4;

      /* Even part */
      let tmp10p2 = tmp0p2 + tmp3p2;	/* phase 2 */
      const tmp13p2 = tmp0p2 - tmp3p2;
      let tmp11p2 = tmp1p2 + tmp2p2;
      let tmp12p2 = tmp1p2 - tmp2p2;

      data[dataOff] = tmp10p2 + tmp11p2; /* phase 3 */
      data[dataOff+32] = tmp10p2 - tmp11p2;

      const z1p2 = (tmp12p2 + tmp13p2) * 0.707106781; /* c4 */
      data[dataOff+16] = tmp13p2 + z1p2; /* phase 5 */
      data[dataOff+48] = tmp13p2 - z1p2;

      /* Odd part */
      tmp10p2 = tmp4p2 + tmp5p2; /* phase 2 */
      tmp11p2 = tmp5p2 + tmp6p2;
      tmp12p2 = tmp6p2 + tmp7p2;

      /* The rotator is modified from fig 4-8 to avoid extra negations. */
      const z5p2 = (tmp10p2 - tmp12p2) * 0.382683433; /* c6 */
      const z2p2 = 0.541196100 * tmp10p2 + z5p2; /* c2-c6 */
      const z4p2 = 1.306562965 * tmp12p2 + z5p2; /* c2+c6 */
      const z3p2= tmp11p2 * 0.707106781; /* c4 */

      const z11p2 = tmp7p2 + z3p2;	/* phase 5 */
      const z13p2 = tmp7p2 - z3p2;

      data[dataOff+40] = z13p2 + z2p2; /* phase 6 */
      data[dataOff+24] = z13p2 - z2p2;
      data[dataOff+ 8] = z11p2 + z4p2;
      data[dataOff+56] = z11p2 - z4p2;

      dataOff++; /* advance po(int)er to next column */

    }

    // Quantize/descale the coefficients
    let fDCTQuant;
    for (i = 0; i < 64; ++i) {
      // Apply the quantization and scaling factor & Round to nearest (int)eger
      fDCTQuant = data[i]*fdtbl[i];
      this.__outputfDCTQuant[i] = (fDCTQuant > 0.0) ? (fDCTQuant + 0.5)|0 : (fDCTQuant - 0.5)|0;
    }

    return this.__outputfDCTQuant;

  }

  __writeAPP0() {
    this.__bitwriter.putShort(0xFFE0); // marker
    this.__bitwriter.putShort(16); // length
    this.__bitwriter.putByte(0x4A); // J
    this.__bitwriter.putByte(0x46); // F
    this.__bitwriter.putByte(0x49); // I
    this.__bitwriter.putByte(0x46); // F
    this.__bitwriter.putByte(0); // = "JFIF"'\0'
    this.__bitwriter.putByte(1); // versionhi
    this.__bitwriter.putByte(1); // versionlo
    this.__bitwriter.putByte(0); // xyunits
    this.__bitwriter.putShort(1); // xdensity
    this.__bitwriter.putShort(1); // ydensity
    this.__bitwriter.putByte(0); // thumbnwidth
    this.__bitwriter.putByte(0); // thumbnheight
  }

  __writeSOF0(_444) {
    this.__bitwriter.putShort(0xFFC0); // marker
    this.__bitwriter.putShort(17);   // length, truecolor YUV JPG
    this.__bitwriter.putByte(8);    // precision
    this.__bitwriter.putShort(this.__height);
    this.__bitwriter.putShort(this.__width);
    this.__bitwriter.putByte(3);    // nrofcomponents

    this.__bitwriter.putByte(1);    // IdY. id of Y
    this.__bitwriter.putByte(_444 ? 0x11 : 0x22); // HVY. sampling factor horizontal Y  | sampling factor vertical Y
    this.__bitwriter.putByte(0);    // QTY. quantization table table

    this.__bitwriter.putByte(2);    // IdU
    this.__bitwriter.putByte(_444 ? 0x11 : 0x11); // HVU sampling factor horizontal U  | sampling factor vertical U. 0x11 -> 4:4:4, 0x22 -> 4:2:0
    this.__bitwriter.putByte(1);    // QTU

    this.__bitwriter.putByte(3);    // IdV
    this.__bitwriter.putByte(_444 ? 0x11 : 0x11); // HVV sampling factor horizontal V  | sampling factor vertical V. 0x11 -> 4:4:4, 0x22 -> 4:2:0
    this.__bitwriter.putByte(1);    // QTV
  }

  __writeDQT() {

    this.__bitwriter.putShort(0xFFDB); // marker
    this.__bitwriter.putShort(132);	   // length
    this.__bitwriter.putByte(0);

    let i;
    for (i = 0; i < 64; ++i) this.__bitwriter.putByte(this.__YTable[i]);
    this.__bitwriter.putByte(1);
    for (i = 0; i < 64; ++i) this.__bitwriter.putByte(this.__UVTable[i]);

  }

  __writeDHT() {

    this.__bitwriter.putShort( 0xFFC4); // marker
    this.__bitwriter.putShort( 0x01A2); // length
    this.__bitwriter.putByte(0); // HTYDCinfno

    let i;
    for (i = 0; i < 16; ++i) this.__bitwriter.putByte(this.__std_dc_luminance_nrcodes[i+1]);
    for (i = 0; i <= 11; ++i) this.__bitwriter.putByte(this.__std_dc_luminance_values[i]);

    this.__bitwriter.putByte(0x10); // HTYACinfo

    for (i = 0; i < 16; ++i) this.__bitwriter.putByte(this.__std_ac_luminance_nrcodes[i+1]);
    for (i = 0; i <= 161; ++i) this.__bitwriter.putByte(this.__std_ac_luminance_values[i]);

    this.__bitwriter.putByte(1); // HTUDCinfo

    for (i = 0; i < 16; ++i) this.__bitwriter.putByte(this.__std_dc_chrominance_nrcodes[i+1]);
    for (i = 0; i <= 11; ++i) this.__bitwriter.putByte(this.__std_dc_chrominance_values[i]);

    this.__bitwriter.putByte(0x11); // HTUACinfo

    for (i = 0; i < 16; ++i) this.__bitwriter.putByte(this.__std_ac_chrominance_nrcodes[i+1]);
    for (i = 0; i <= 161; ++i) this.__bitwriter.putByte(this.__std_ac_chrominance_values[i]);

  }

  __writeSOS() {
    this.__bitwriter.putShort(0xFFDA); // marker
    this.__bitwriter.putShort(12); // length
    this.__bitwriter.putByte(3); // nrofcomponents
    this.__bitwriter.putByte(1); // IdY
    this.__bitwriter.putByte(0); // HTY
    this.__bitwriter.putByte(2); // IdU
    this.__bitwriter.putByte(0x11); // HTU
    this.__bitwriter.putByte(3); // IdV
    this.__bitwriter.putByte(0x11); // HTV
    this.__bitwriter.putByte(0); // Ss
    this.__bitwriter.putByte(0x3f); // Se
    this.__bitwriter.putByte(0); // Bf
  }

  __writeEOI() {
    this.__bitwriter.align();
    this.__bitwriter.putShort(0xFFD9); //EOI
    this.__bitwriter.end();
  }

  __huffman_compact(mag,size) {
    return ((mag) < 0 ? mag + (1 << size) - 1 : mag);
  }

  __log2(x) {
    let res = 0;
    while(x !== 0) {
      x>>=1;
      res++;
    }
    return res;
  }

  __processDU(CDU, fdtbl, DC, HTDC, HTAC) {

    const DU_DCT = this.__fDCTQuant(CDU, fdtbl);

    let dc_diff; //int
    let last_dc; // double

    // output
    // DC Bits
    dc_diff = DU_DCT[0] - DC|0;
    last_dc = DU_DCT[0];
    ///////////////////////
    //DC CODING

    // DC Size
    let diffabs = Math.abs(dc_diff);
    let dc_size = this.__log2(diffabs);

    this.__bitwriter.putBits(HTDC[dc_size].val, HTDC[dc_size].len);

    // DC Bits
    if (dc_size) {
      dc_diff = this.__huffman_compact(dc_diff, dc_size);
      this.__bitwriter.putBits( dc_diff, dc_size );
    }

    ////////////////////
    // AC CODING
    let run;
    let accoeff;
    let lastcoeff_pos = 0;
    const MAX_COEF = 64;
    const jpeg_natural_order = this.__jpeg_natural_order;

    let i = 0;
    while (1) {

      // find next coefficient to code
      i++;
      for (run = 0; (accoeff = DU_DCT[jpeg_natural_order[i]]) === 0 && i < MAX_COEF; i++, run++);

      if (i >= MAX_COEF) break;

      // Code runs greater than 16
      while(run >= 16) {
        // Write value
        this.__bitwriter.putBits(HTAC[0xf0].val, HTAC[0xf0].len);
        run -= 16;
      }

      // AC Size
      const acabs = Math.abs(accoeff);
      const acsize = this.__log2(acabs);

      // Write value
      const hv = (run << 4) | acsize;
      this.__bitwriter.putBits(HTAC[hv].val, HTAC[hv].len);

      // AC Bits
      if (acsize) {
        accoeff = this.__huffman_compact(accoeff, acsize);
        this.__bitwriter.putBits(accoeff, acsize );
      }

      // Keep position of last encoded coefficient
      lastcoeff_pos = i;

    }

    // Write EOB
    if (lastcoeff_pos !== 63) {
      this.__bitwriter.putBits(HTAC[0].val, HTAC[0].len);
    }

    return last_dc;

  }

  /*__rgb2yuv_444_8(xpos, ypos, YDU, UDU, VDU) {}

  __rgb2yuv_444_16(xpos, ypos, YDU, UDU, VDU) {

    const buf = this.__data;
    const stride = this.__width * 4;
    const offset = ypos * stride + xpos * 4;
    const w = xpos + 8 > this.__width ? this.__width - xpos : 8;
    const h = ypos + 8 > this.__height ? this.__height - ypos : 8;

    let x, y, off, off_1 = 0, R, G, B;

    if (w === 8 && h === 8) {

      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          off = offset + y * stride + x * 4;
          R = halfToFloat(buf[off  ]) * 255;
          G = halfToFloat(buf[off+1]) * 255;
          B = halfToFloat(buf[off+2]) * 255;
          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }

    } else {

      for (y = 0; y < 8; y++) {

        for (x = 0; x < 8; x++) {

          let xx=x, yy=y;

          if( x >= w ) {
            xx = w-1;
          }

          if( y >= h ) {
            yy = h-1;
          }


          off = offset + yy * stride + xx * 4;

          R = halfToFloat(buf[off  ]) * 255;
          G = halfToFloat(buf[off+1]) * 255;
          B = halfToFloat(buf[off+2]) * 255;

          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }
    }

  }

  __rgb2yuv_444_32(xpos, ypos, YDU, UDU, VDU) {

    const buf = this.__data;
    const stride = this.__width * 4;
    const offset = ypos * stride + xpos * 4;
    const w = xpos + 8 > this.__width ? this.__width - xpos : 8;
    const h = ypos + 8 > this.__height ? this.__height - ypos : 8;

    let x, y, off, off_1 = 0, R, G, B;

    if (w === 8 && h === 8) {

      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          off = offset + y * stride + x * 4;
          R = buf[off  ] * 255;
          G = buf[off+1] * 255;
          B = buf[off+2] * 255;
          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }

    } else {

      for (y = 0; y < 8; y++) {

        for (x = 0; x < 8; x++) {

          let xx=x, yy=y;

          if( x >= w ) {
            xx = w-1;
          }

          if( y >= h ) {
            yy = h-1;
          }


          off = offset + yy * stride + xx * 4;

          R = buf[off  ] * 255;
          G = buf[off+1] * 255;
          B = buf[off+2] * 255;

          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }
    }

  }*/

  __rgb2yuv_444(xpos, ypos, YDU, UDU, VDU) {

    const buf = this.__data;
    const stride = this.__width * 4;
    const offset = ypos * stride + xpos * 4;
    const w = xpos + 8 > this.__width ? this.__width - xpos : 8;
    const h = ypos + 8 > this.__height ? this.__height - ypos : 8;

    let x, y, off, off_1 = 0, R, G, B;

    if (w === 8 && h === 8) {

      /* block is 8x8 */
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          off = offset + y * stride + x * 4;
          R = buf[off  ];
          G = buf[off+1];
          B = buf[off+2];
          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }

    } else {

      /* we separate the borderline conditions to avoid having to branch out
       * on every mcu */

      for (y = 0; y < 8; y++) {

        for (x = 0; x < 8; x++) {

          let xx=x, yy=y;

          if( x >= w ) {
            xx = w-1;
          }

          if( y >= h ) {
            yy = h-1;
          }


          off = offset + yy * stride + xx * 4;

          R = buf[off  ];
          G = buf[off+1];
          B = buf[off+2];

          YDU[off_1]   =((( 0.29900)*R+( 0.58700)*G+( 0.11400)*B))-0x80;
          UDU[off_1]   =(((-0.16874)*R+(-0.33126)*G+( 0.50000)*B));
          VDU[off_1++] =((( 0.50000)*R+(-0.41869)*G+(-0.08131)*B));
        }
      }
    }

  }

  __downsample_8_line(DU, outoff, DU1, DU2, inoff) {
    // takes 4 DU units and downsamples them 2:1 using simple averaging
    DU[outoff + 0] = (DU1[inoff + 0] + DU1[inoff + 1] + DU1[inoff +  8] + DU1[inoff +  9] + 2)>>2;
    DU[outoff + 1] = (DU1[inoff + 2] + DU1[inoff + 3] + DU1[inoff + 10] + DU1[inoff + 11] + 2)>>2;
    DU[outoff + 2] = (DU1[inoff + 4] + DU1[inoff + 5] + DU1[inoff + 12] + DU1[inoff + 13] + 2)>>2;
    DU[outoff + 3] = (DU1[inoff + 6] + DU1[inoff + 7] + DU1[inoff + 14] + DU1[inoff + 15] + 2)>>2;
    DU[outoff + 4] = (DU2[inoff + 0] + DU2[inoff + 1] + DU2[inoff +  8] + DU2[inoff +  9] + 2)>>2;
    DU[outoff + 5] = (DU2[inoff + 2] + DU2[inoff + 3] + DU2[inoff + 10] + DU2[inoff + 11] + 2)>>2;
    DU[outoff + 6] = (DU2[inoff + 4] + DU2[inoff + 5] + DU2[inoff + 12] + DU2[inoff + 13] + 2)>>2;
    DU[outoff + 7] = (DU2[inoff + 6] + DU2[inoff + 7] + DU2[inoff + 14] + DU2[inoff + 15] + 2)>>2;
  }

  __downsample_DU(DU, DU1, DU2, DU3, DU4) {
    this.__downsample_8_line( DU, 0, DU1, DU2, 0 );
    this.__downsample_8_line( DU, 8, DU1, DU2, 16 );
    this.__downsample_8_line( DU, 16, DU1, DU2, 32 );
    this.__downsample_8_line( DU, 24, DU1, DU2, 48 );
    this.__downsample_8_line( DU, 32, DU3, DU4, 0 );
    this.__downsample_8_line( DU, 40, DU3, DU4, 16 );
    this.__downsample_8_line( DU, 48, DU3, DU4, 32 );
    this.__downsample_8_line( DU, 56, DU3, DU4, 48 );
  }

  __rgb2yuv_420( xpos, ypos) {
    this.__rgb2yuv_444(xpos, ypos, this.__YDU, this.__UDU1, this.__VDU1);
    this.__rgb2yuv_444(xpos+8, ypos, this.__YDU2, this.__UDU2, this.__VDU2);
    this.__rgb2yuv_444(xpos, ypos+8, this.__YDU3, this.__UDU3, this.__VDU3);
    this.__rgb2yuv_444(xpos+8, ypos+8, this.__YDU4, this.__UDU4, this.__VDU4);
    this.__downsample_DU(this.__UDU, this.__UDU1, this.__UDU2, this.__UDU3, this.__UDU4);
    this.__downsample_DU(this.__VDU, this.__VDU1, this.__VDU2, this.__VDU3, this.__VDU4);
  }

}