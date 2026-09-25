/** Shrink a phone photo to max 1600px JPEG before upload; keeps receipts readable and the data folder small. */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode: upload as-is
  }
}
