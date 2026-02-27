import {
  Camera,
  DataTexture,
  Mesh,
  NearestFilter,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";

export interface PS1RendererOptions {
  pixelScale: number;
  enableDither: boolean;
  enableUvWobble: boolean;
  colorLevels: number;
}

const DEFAULT_OPTIONS: PS1RendererOptions = {
  pixelScale: 3,
  enableDither: true,
  enableUvWobble: true,
  colorLevels: 48
};

export class PS1Renderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly options: PS1RendererOptions;

  private readonly postScene = new Scene();
  private readonly postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly postMaterial: ShaderMaterial;
  private readonly postMesh: Mesh;

  private renderTarget: WebGLRenderTarget;
  private lowResSize = new Vector2(320, 180);
  private time = 0;

  constructor(root: HTMLElement, options?: Partial<PS1RendererOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };

    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;

    this.canvas = this.renderer.domElement;
    this.canvas.style.imageRendering = "pixelated";
    root.append(this.canvas);

    this.renderTarget = this.createRenderTarget(this.lowResSize.x, this.lowResSize.y);

    this.postMaterial = new ShaderMaterial({
      uniforms: {
        uScene: { value: this.renderTarget.texture },
        uDitherTex: { value: this.createBayerTexture() },
        uTime: { value: 0 },
        uLevels: { value: this.options.colorLevels },
        uEnableDither: { value: this.options.enableDither ? 1 : 0 },
        uEnableWobble: { value: this.options.enableUvWobble ? 1 : 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;

        varying vec2 vUv;

        uniform sampler2D uScene;
        uniform sampler2D uDitherTex;
        uniform float uTime;
        uniform float uLevels;
        uniform float uEnableDither;
        uniform float uEnableWobble;

        void main() {
          vec2 uv = vUv;

          if (uEnableWobble > 0.5) {
            vec2 wobble = vec2(
              sin(uv.y * 118.0 + uTime * 2.1),
              cos(uv.x * 94.0 + uTime * 1.7)
            ) * 0.0011;
            uv += wobble;
          }

          vec3 color = texture2D(uScene, uv).rgb;

          if (uEnableDither > 0.5) {
            float d = texture2D(uDitherTex, gl_FragCoord.xy / 4.0).r - 0.5;
            color += d / uLevels;
          }

          color = floor(color * uLevels) / uLevels;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    this.postMesh = new Mesh(new PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(this.postMesh);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);

    const lowW = Math.max(160, Math.floor(width / this.options.pixelScale));
    const lowH = Math.max(90, Math.floor(height / this.options.pixelScale));

    if (lowW !== this.lowResSize.x || lowH !== this.lowResSize.y) {
      this.lowResSize.set(lowW, lowH);
      this.renderTarget.dispose();
      this.renderTarget = this.createRenderTarget(lowW, lowH);
      this.postMaterial.uniforms.uScene.value = this.renderTarget.texture;
    }
  }

  render(scene: Scene, camera: Camera, deltaSeconds: number): void {
    this.time += deltaSeconds;

    this.postMaterial.uniforms.uTime.value = this.time;
    this.postMaterial.uniforms.uLevels.value = this.options.colorLevels;
    this.postMaterial.uniforms.uEnableDither.value = this.options.enableDither ? 1 : 0;
    this.postMaterial.uniforms.uEnableWobble.value = this.options.enableUvWobble ? 1 : 0;

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.postMaterial.dispose();
    this.postMesh.geometry.dispose();
    this.renderer.dispose();
  }

  private createRenderTarget(width: number, height: number): WebGLRenderTarget {
    const target = new WebGLRenderTarget(width, height, {
      format: RGBAFormat,
      type: UnsignedByteType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: true,
      stencilBuffer: false
    });

    target.texture.magFilter = NearestFilter;
    target.texture.minFilter = NearestFilter;
    target.texture.generateMipmaps = false;
    target.texture.colorSpace = SRGBColorSpace;
    return target;
  }

  private createBayerTexture(): Texture {
    const matrix = [
      0, 8, 2, 10,
      12, 4, 14, 6,
      3, 11, 1, 9,
      15, 7, 13, 5
    ];

    const data = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      const value = Math.floor((matrix[i] / 15) * 255);
      data[i * 4 + 0] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }

    const tex = new DataTexture(data, 4, 4, RGBAFormat, UnsignedByteType);
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
}
