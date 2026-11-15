// Imperative scene setup for the black hole: renderer, fixed camera, sphere
// proxy mesh, star-map background and bloom post-processing.
import * as THREE from "three/webgpu";
import { equirectUV, pass, texture } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { createBlackHoleMaterial, type BlackHoleUniforms } from "./blackHoleMaterial";

THREE.Cache.enabled = true;

// In-memory cache for the black hole textures
let cachedTexturesPromise: Promise<[THREE.Texture, THREE.Texture]> | null = null;

function loadCachedTextures(textureBase: string): Promise<[THREE.Texture, THREE.Texture]> {
  if (!cachedTexturesPromise) {
    const loader = new THREE.TextureLoader();
    cachedTexturesPromise = Promise.all([
      loader.loadAsync(`${textureBase}noise_deep.png`),
      loader.loadAsync(`${textureBase}nebula.png`),
    ]).then(([noiseTexture, starsTexture]) => {
      starsTexture.mapping = THREE.EquirectangularReflectionMapping;
      starsTexture.colorSpace = THREE.SRGBColorSpace;
      starsTexture.needsUpdate = true;
      return [noiseTexture, starsTexture] as [THREE.Texture, THREE.Texture];
    });
  }
  return cachedTexturesPromise;
}

export interface BlackHoleOptions {
  /** Upper bound for the device pixel ratio. Lower it to trade sharpness for FPS. */
  maxPixelRatio?: number;
  /** Fixed camera position (the camera always looks at the centre). */
  cameraPosition?: [number, number, number];
  fov?: number;
  /** Bloom (glow) settings. */
  bloom?: { strength?: number; radius?: number; threshold?: number };
  /** Brightness of the star map. */
  backgroundIntensity?: number;
  /** Base URL of the two textures. */
  textureBase?: string;
}

export interface BlackHoleHandle {
  /** Live-tweakable shader uniforms, e.g. `handle.uniforms.iterations.value = 64`. */
  uniforms: BlackHoleUniforms;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
}

export async function createBlackHole(
  canvas: HTMLCanvasElement,
  options: BlackHoleOptions = {},
): Promise<BlackHoleHandle> {
  const {
    maxPixelRatio = 2,
    cameraPosition = [0.27, 0.13, 0.8],
    fov = 50,
    bloom: bloomOptions = {},
    backgroundIntensity = 2,
    textureBase = `${import.meta.env.BASE_URL}textures/black-hole/`,
  } = options;

  const parent = canvas.parentElement ?? canvas;
  const size = () => ({
    width: Math.max(parent.clientWidth, 1),
    height: Math.max(parent.clientHeight, 1),
  });

  // ---- Renderer (WebGPU, falls back to WebGL2 automatically) ----
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor("#010101", 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(size().width, size().height, false);

  // ---- Textures (cached) ----
  const [noiseTexture, starsTexture] = await loadCachedTextures(textureBase);

  await renderer.init();

  // ---- Scene ----
  const scene = new THREE.Scene();
  scene.backgroundNode = texture(starsTexture, equirectUV()).mul(backgroundIntensity);

  const camera = new THREE.PerspectiveCamera(fov, size().width / size().height, 0.1, 2000);
  camera.position.set(...cameraPosition);
  camera.lookAt(0, 0, 0);

  const geometry = new THREE.SphereGeometry(1, 16, 16);
  const { material, uniforms } = createBlackHoleMaterial({ noiseTexture, starsTexture, backgroundIntensity });
  scene.add(new THREE.Mesh(geometry, material));

  // ---- Post-processing: scene + bloom (the glow) ----
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode("output");
  const bloomPass = bloom(
    scenePassColor,
    bloomOptions.strength ?? 0.217,
    bloomOptions.radius ?? 0,
    bloomOptions.threshold ?? 0,
  );
  postProcessing.outputNode = scenePassColor.add(bloomPass);

  // ---- Resize + loop ----
  const resize = () => {
    const { width, height } = size();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(parent);

  // The camera never moves, but we still render every frame: the disk swirl is time-driven.
  renderer.setAnimationLoop(() => {
    postProcessing.render();
  });

  return {
    uniforms,
    camera,
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      noiseTexture.dispose();
      starsTexture.dispose();
      cachedTexturesPromise = null;
      postProcessing.dispose?.();
      renderer.dispose();
    },
  };
}
