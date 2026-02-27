import { CanvasTexture, NearestFilter, NearestMipmapNearestFilter, RepeatWrapping, SRGBColorSpace, Texture } from "three";

export function applyPS1TextureSettings(texture: Texture): Texture {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.anisotropy = 1;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.generateMipmaps = true;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createCheckerTexture(colorA: string, colorB: string, size = 64, cell = 8): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas is not available");
  }

  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const even = ((x / cell) + (y / cell)) % 2 === 0;
      ctx.fillStyle = even ? colorA : colorB;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const texture = new CanvasTexture(canvas);
  return applyPS1TextureSettings(texture) as CanvasTexture;
}

export function createGradientTexture(top: string, bottom: string, size = 128): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas is not available");
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  return applyPS1TextureSettings(texture) as CanvasTexture;
}

export function createLabelTexture(text: string, bg = "#1d1d1d", fg = "#f5f5f5"): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas is not available");
  }

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = "12px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 16), 6, 16);

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
