import zlib from 'node:zlib';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);

  return Buffer.concat([len, payload, crc]);
}

export function generateGradientPng(width = 512, height = 512, seed = 42): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw scanlines: each row = 1 byte filter (0) + width * 3 bytes (RGB)
  const rowLength = 1 + width * 3;
  const rawData = Buffer.alloc(rowLength * height);

  // Create an aesthetic studio lighting gradient based on seed
  const rBase = 20 + ((seed * 37) % 60);
  const gBase = 25 + ((seed * 71) % 60);
  const bBase = 70 + ((seed * 113) % 90);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter: None

    const yFactor = y / height;
    for (let x = 0; x < width; x++) {
      const xFactor = x / width;
      const pixelOffset = rowOffset + 1 + x * 3;

      // Studio spotlight radial falloff
      const dx = xFactor - 0.5;
      const dy = yFactor - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const spot = Math.max(0, 1 - dist * 1.6);

      // Product silhouette pedestal
      const isPedestal = yFactor > 0.72 && Math.abs(xFactor - 0.5) < 0.35;
      const isProduct = yFactor > 0.35 && yFactor <= 0.72 && Math.abs(xFactor - 0.5) < 0.18;

      let r = Math.min(255, Math.floor(rBase + spot * 120));
      let g = Math.min(255, Math.floor(gBase + spot * 100));
      let b = Math.min(255, Math.floor(bBase + spot * 140));

      if (isPedestal) {
        r = Math.floor(r * 0.7 + 40);
        g = Math.floor(g * 0.7 + 45);
        b = Math.floor(b * 0.7 + 60);
      } else if (isProduct) {
        r = Math.floor(r * 0.4 + 180);
        g = Math.floor(g * 0.4 + 160);
        b = Math.floor(b * 0.4 + 220);
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}
