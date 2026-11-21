import './style.css';
import { store } from './store';
import { World } from './scene';
import { UI } from './ui';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

function boot(): void {
  store.init();
  const supported = webglAvailable();
  const ui = new UI({ webgl: supported });
  let world: World | null = null;
  if (supported) {
    try {
      const sceneCanvas = document.getElementById('scene') as HTMLCanvasElement;
      world = new World(sceneCanvas, ui.sceneHandlers());
      ui.attachWorld(world);
    } catch (err) {
      console.warn('3D renderer unavailable, using 2D fallback', err);
      world = null;
      ui.disableWebGL();
    }
  }
  ui.start();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline cache optional */ });
    });
  }
  const hint = document.getElementById('hint');
  if (hint) hint.remove();
  void world;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
