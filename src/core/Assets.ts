import {
  AnimationClip,
  Box3,
  AudioLoader,
  Color,
  Material,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  TextureLoader,
  Texture
} from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { applyPS1TextureSettings } from "../utils/Textures";

export interface ModelInstance {
  root: Object3D;
  clips: AnimationClip[];
  fromFallback: boolean;
}

type MaterialLike = Material & {
  map?: Texture | null;
  color?: Color;
  emissive?: Color;
  opacity?: number;
  transparent?: boolean;
  alphaTest?: number;
  side?: number;
  vertexColors?: boolean;
  skinning?: boolean;
  morphTargets?: boolean;
  morphNormals?: boolean;
};

type LoadedMTL = Parameters<OBJLoader["setMaterials"]>[0];

export class Assets {
  private readonly gltfLoader = new GLTFLoader();
  private readonly audioLoader = new AudioLoader();
  private readonly textureLoader = new TextureLoader();

  private readonly gltfCache = new Map<string, Promise<GLTF | null>>();
  private readonly objCache = new Map<string, Promise<Object3D | null>>();
  private readonly mtlCache = new Map<string, Promise<LoadedMTL | null>>();
  private readonly audioCache = new Map<string, Promise<AudioBuffer | null>>();
  private readonly textureCache = new Map<string, Promise<Texture | null>>();

  async instantiateModel(path: string, fallbackFactory: () => Object3D): Promise<ModelInstance> {
    const model = await this.loadModel(path);
    if (!model) {
      return {
        root: fallbackFactory(),
        clips: [],
        fromFallback: true
      };
    }

    this.sanitizeObject(model.root);

    return {
      root: model.root,
      clips: model.clips,
      fromFallback: false
    };
  }

  async loadAudioBuffer(path: string): Promise<AudioBuffer | null> {
    const resolvedPath = this.resolvePublicPath(path);
    if (!this.audioCache.has(resolvedPath)) {
      const promise = new Promise<AudioBuffer | null>((resolve) => {
        this.audioLoader.load(
          resolvedPath,
          (buffer) => resolve(buffer),
          undefined,
          () => {
            // eslint-disable-next-line no-console
            console.warn(`[Assets] Audio missing or failed: ${resolvedPath}. TODO: add file at this path.`);
            resolve(null);
          }
        );
      });

      this.audioCache.set(resolvedPath, promise);
    }

    return this.audioCache.get(resolvedPath)!;
  }

  private async loadGLTF(path: string): Promise<GLTF | null> {
    const resolvedPath = this.resolvePublicPath(path);
    if (!this.gltfCache.has(resolvedPath)) {
      const promise = new Promise<GLTF | null>((resolve) => {
        this.gltfLoader.load(
          resolvedPath,
          (gltf) => resolve(gltf),
          undefined,
          () => {
            // eslint-disable-next-line no-console
            console.warn(`[Assets] Model missing or failed: ${resolvedPath}. TODO: add file at this path.`);
            resolve(null);
          }
        );
      });

      this.gltfCache.set(resolvedPath, promise);
    }

    return this.gltfCache.get(resolvedPath)!;
  }

  private async loadModel(path: string): Promise<{ root: Object3D; clips: AnimationClip[] } | null> {
    if (this.isGLTF(path)) {
      const gltf = await this.loadGLTF(path);
      if (gltf) {
        const root = cloneSkeleton(gltf.scene);
        await this.applyModelFixes(path, root);
        return {
          root,
          clips: gltf.animations
        };
      }

      // OBJ fallback is enabled only for Kitty slot to avoid swallowing other missing GLB slots.
      if (this.isKittyAsset(path)) {
        const objFallbackPath = this.replaceExtension(path, ".obj");
        const obj = await this.loadOBJ(objFallbackPath);
        if (obj) {
          const root = obj.clone(true);
          await this.applyModelFixes(path, root);
          return {
            root,
            clips: []
          };
        }
      }

      return null;
    }

    if (this.isOBJ(path)) {
      const obj = await this.loadOBJ(path);
      if (!obj) {
        return null;
      }
      const root = obj.clone(true);
      await this.applyModelFixes(path, root);
      return {
        root,
        clips: []
      };
    }

    const gltf = await this.loadGLTF(path);
    if (!gltf) {
      return null;
    }

    return {
      root: cloneSkeleton(gltf.scene),
      clips: gltf.animations
    };
  }

  private async loadOBJ(path: string): Promise<Object3D | null> {
    const resolvedPath = this.resolvePublicPath(path);
    if (!this.objCache.has(resolvedPath)) {
      const promise = (async (): Promise<Object3D | null> => {
        const loader = new OBJLoader();
        const materials = await this.loadBestEffortMTL(path);
        if (materials) {
          materials.preload();
          loader.setMaterials(materials);
        }

        return new Promise<Object3D | null>((resolve) => {
          loader.load(
            resolvedPath,
            (obj) => {
              let hasMesh = false;
              obj.traverse((node) => {
                if ((node as Mesh).isMesh) {
                  hasMesh = true;
                }
              });

              if (!hasMesh) {
                // eslint-disable-next-line no-console
                console.warn(`[Assets] OBJ has no meshes: ${resolvedPath}. Falling back to placeholder.`);
                resolve(null);
                return;
              }

              resolve(obj);
            },
            undefined,
            () => {
              // eslint-disable-next-line no-console
              console.warn(`[Assets] Model missing or failed: ${resolvedPath}. TODO: add file at this path.`);
              resolve(null);
            }
          );
        });
      })();

      this.objCache.set(resolvedPath, promise);
    }

    return this.objCache.get(resolvedPath)!;
  }

  private async loadBestEffortMTL(objPath: string): Promise<LoadedMTL | null> {
    const dir = this.getDirectory(objPath);
    const baseNoExt = this.getBaseNameWithoutExtension(objPath);
    const candidates = [`${dir}${baseNoExt}.mtl`, `${dir}material.mtl`];

    for (const candidate of candidates) {
      const materials = await this.loadMTL(candidate);
      if (materials) {
        return materials;
      }
    }

    return null;
  }

  private async loadMTL(path: string): Promise<LoadedMTL | null> {
    const resolvedPath = this.resolvePublicPath(path);
    if (!this.mtlCache.has(resolvedPath)) {
      const dir = this.getDirectory(resolvedPath);
      const file = resolvedPath.slice(dir.length);
      const loader = new MTLLoader();
      loader.setPath(dir);
      loader.setResourcePath(dir);

      const promise = new Promise<LoadedMTL | null>((resolve) => {
        loader.load(
          file,
          (materials) => resolve(materials as LoadedMTL),
          undefined,
          () => resolve(null)
        );
      });
      this.mtlCache.set(resolvedPath, promise);
    }

    return this.mtlCache.get(resolvedPath)!;
  }

  private async loadTexture(path: string): Promise<Texture | null> {
    const resolvedPath = this.resolvePublicPath(path);
    if (!this.textureCache.has(resolvedPath)) {
      const promise = new Promise<Texture | null>((resolve) => {
        this.textureLoader.load(
          resolvedPath,
          (texture) => resolve(texture),
          undefined,
          () => resolve(null)
        );
      });
      this.textureCache.set(resolvedPath, promise);
    }
    return this.textureCache.get(resolvedPath)!;
  }

  private isGLTF(path: string): boolean {
    return path.endsWith(".glb") || path.endsWith(".gltf");
  }

  private isOBJ(path: string): boolean {
    return path.endsWith(".obj");
  }

  private isKittyAsset(path: string): boolean {
    return /\/kitty\.(glb|gltf|obj)$/u.test(path);
  }

  private replaceExtension(path: string, ext: string): string {
    if (path.lastIndexOf(".") <= path.lastIndexOf("/")) {
      return `${path}${ext}`;
    }
    return path.replace(/\.[^/.]+$/u, ext);
  }

  private getDirectory(path: string): string {
    const index = path.lastIndexOf("/");
    return index >= 0 ? path.slice(0, index + 1) : "";
  }

  private getBaseNameWithoutExtension(path: string): string {
    const base = path.split("/").pop() ?? path;
    return base.replace(/\.[^/.]+$/u, "");
  }

  private resolvePublicPath(path: string): string {
    if (/^(?:[a-z]+:)?\/\//iu.test(path)) {
      return path;
    }

    const base = import.meta.env.BASE_URL ?? "/";
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${normalizedBase}${normalizedPath}`;
  }

  private async applyModelFixes(path: string, root: Object3D): Promise<void> {
    const box = new Box3().setFromObject(root);
    if (Number.isFinite(box.min.y)) {
      root.userData.groundOffsetY = -box.min.y;
    }

    const fallbackDiffusePath = `${this.getDirectory(path)}texture_pbr_20250901.png`;
    const fallbackTexture = await this.loadTexture(fallbackDiffusePath);
    if (fallbackTexture) {
      applyPS1TextureSettings(fallbackTexture);
      root.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh || !mesh.material) {
          return;
        }

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            const material = mat as MaterialLike;
            if (!material.map) {
              material.map = fallbackTexture;
              material.needsUpdate = true;
            }
          });
        } else {
          const material = mesh.material as MaterialLike;
          if (!material.map) {
            material.map = fallbackTexture;
            material.needsUpdate = true;
          }
        }
      });
    }

    if (this.isKittyAsset(path)) {
      // Keep movement logic on parent/root; rotate only visual child later in scene.
      root.userData.visualYawOffset = Math.PI;
    }
  }

  private sanitizeObject(root: Object3D): void {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((material) => this.toLambertMaterial(material));
      } else {
        mesh.material = this.toLambertMaterial(mesh.material as Material);
      }
    });
  }

  private toLambertMaterial(material: Material): Material {
    const source = material as MaterialLike;

    if (source.map) {
      applyPS1TextureSettings(source.map);
    }

    if (material instanceof MeshLambertMaterial) {
      material.flatShading = true;
      material.needsUpdate = true;
      return material;
    }

    const lambert = new MeshLambertMaterial({
      color: 0xffffff,
      map: source.map ?? null,
      transparent: source.transparent ?? false,
      opacity: source.opacity ?? 1,
      alphaTest: source.alphaTest ?? 0,
      side: source.side,
      vertexColors: source.vertexColors,
      flatShading: true
    });

    if (source.color) {
      lambert.color.copy(source.color);
    }

    if (source.emissive) {
      lambert.emissive.copy(source.emissive);
    }

    (lambert as MeshLambertMaterial & { skinning?: boolean }).skinning = Boolean(source.skinning);
    (lambert as MeshLambertMaterial & { morphTargets?: boolean }).morphTargets = Boolean(source.morphTargets);
    (lambert as MeshLambertMaterial & { morphNormals?: boolean }).morphNormals = Boolean(source.morphNormals);

    return lambert;
  }
}
