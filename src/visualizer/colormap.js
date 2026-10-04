import * as THREE from 'three';

/**
 * Scientific CFD Colormaps:
 * - Turbo: Google AI's perceptually uniform rainbow colormap (ideal for CFD)
 * - Viridis: Classic perceptually linear scientific colormap
 * - CoolWarm: Blue-White-Red diverging colormap (ideal for negative/positive Cp)
 * - Jet: Classic engineering rainbow
 */
export class Colormap {
  /**
   * Evaluates Turbo colormap polynomial approximation
   * @param {number} t - normalized value [0, 1]
   */
  static turbo(t) {
    const x = Math.max(0, Math.min(1, t));
    const r = Math.max(0, Math.min(1, 0.1357 + x * (4.61539 - x * (42.6603 - x * (132.131 - x * (152.552 - x * 61.6447))))));
    const g = Math.max(0, Math.min(1, 0.0914 + x * (2.19418 + x * (4.84297 - x * (14.1850 + x * (4.27729 + x * 2.82956))))));
    const b = Math.max(0, Math.min(1, 0.1067 + x * (12.5925 - x * (60.1818 - x * (109.074 - x * (88.5085 - x * 26.8183))))));
    return new THREE.Color(r, g, b);
  }

  /**
   * Cool-to-Warm (Blue - Cyan - White - Orange - Red) Diverging colormap
   * Ideal for Pressure Coefficient Cp (negative suction in blue, positive stagnation in red)
   */
  static coolwarm(t) {
    const x = Math.max(0, Math.min(1, t));
    let r, g, b;

    if (x < 0.5) {
      const f = x * 2; // 0 to 1
      r = 0.15 + 0.75 * f;
      g = 0.35 + 0.55 * f;
      b = 0.95;
    } else {
      const f = (x - 0.5) * 2; // 0 to 1
      r = 0.95;
      g = 0.9 - 0.7 * f;
      b = 0.9 - 0.75 * f;
    }

    return new THREE.Color(r, g, b);
  }

  /**
   * Viridis colormap
   */
  static viridis(t) {
    const x = Math.max(0, Math.min(1, t));
    // Sample points interpolation
    const r = Math.max(0, Math.min(1, -0.003 + x * (0.804 + x * (0.198))));
    const g = Math.max(0, Math.min(1, 0.01 + x * (1.35 - x * 0.42)));
    const b = Math.max(0, Math.min(1, 0.33 + x * (0.45 - x * 0.65)));
    return new THREE.Color(r, g, b);
  }

  /**
   * Classic Jet rainbow
   */
  static jet(t) {
    const x = Math.max(0, Math.min(1, t));
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(x * 4 - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(x * 4 - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(x * 4 - 1)));
    return new THREE.Color(r, g, b);
  }

  /**
   * Get color by scheme name
   */
  static getColor(t, scheme = 'turbo') {
    switch (scheme) {
      case 'coolwarm':
        return this.coolwarm(t);
      case 'viridis':
        return this.viridis(t);
      case 'jet':
        return this.jet(t);
      case 'turbo':
      default:
        return this.turbo(t);
    }
  }

  /**
   * Generate a 256-pixel gradient canvas to use as a dynamic lookup texture in GLSL shaders
   */
  static createGradientTexture(scheme = 'turbo') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 1);

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const col = this.getColor(t, scheme);
      imgData.data[i * 4 + 0] = Math.round(col.r * 255);
      imgData.data[i * 4 + 1] = Math.round(col.g * 255);
      imgData.data[i * 4 + 2] = Math.round(col.b * 255);
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
}
