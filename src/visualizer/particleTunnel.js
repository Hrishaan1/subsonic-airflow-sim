import * as THREE from 'three';
import { Colormap } from './colormap.js';

export class ParticleTunnel {
  constructor(scene, maxParticles = 6000) {
    this.scene = scene;
    this.maxParticles = maxParticles;
    this.visible = true;
    this.speedMultiplier = 1.0;
    this.colormapScheme = 'turbo';

    // Particle arrays
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.lifetimes = new Float32Array(maxParticles); // current age
    this.maxLifetimes = new Float32Array(maxParticles);

    // Initial random spread
    for (let i = 0; i < maxParticles; i++) {
      this.resetParticle(i, true);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom smoke particle texture
    const texture = this.createSmokeTexture();

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      map: texture,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    // Temp scratch vector
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3();
  }

  createSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(240, 250, 255, 0.7)');
    grad.addColorStop(0.7, 'rgba(200, 225, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  setVisible(visible) {
    this.visible = visible;
    this.points.visible = visible;
  }

  setSpeed(val) {
    this.speedMultiplier = val;
  }

  setColormap(scheme) {
    this.colormapScheme = scheme;
  }

  /**
   * Reset single particle to upstream emitter rake for arbitrary wind direction
   */
  resetParticle(index, randomInitialSpread = false, flowSolver = null) {
    let windDir = new THREE.Vector3(1, 0, 0);
    const domMin = flowSolver ? flowSolver.domainMin : new THREE.Vector3(-1.8, -0.9, -0.9);
    const domMax = flowSolver ? flowSolver.domainMax : new THREE.Vector3(1.8, 0.9, 0.9);

    if (flowSolver) {
      windDir = flowSolver.travelDirection.clone().negate().normalize();
    }

    // Dynamic distance to upstream domain boundary along ray: P(t) = -t * windDir
    let tBoundary = 1e6;
    if (Math.abs(windDir.x) > 1e-4) {
      const tx = (windDir.x < 0 ? domMax.x : domMin.x) / (-windDir.x);
      if (tx > 0) tBoundary = Math.min(tBoundary, tx);
    }
    if (Math.abs(windDir.y) > 1e-4) {
      const ty = (windDir.y < 0 ? domMax.y : domMin.y) / (-windDir.y);
      if (ty > 0) tBoundary = Math.min(tBoundary, ty);
    }
    if (Math.abs(windDir.z) > 1e-4) {
      const tz = (windDir.z < 0 ? domMax.z : domMin.z) / (-windDir.z);
      if (tz > 0) tBoundary = Math.min(tBoundary, tz);
    }
    const tUpstream = Math.max(0.4, tBoundary * 0.92);
    const center = windDir.clone().negate().multiplyScalar(tUpstream);

    // Coordinate basis orthogonal to wind
    let perp1 = new THREE.Vector3(0, 1, 0).cross(windDir);
    if (perp1.lengthSq() < 0.01) perp1 = new THREE.Vector3(1, 0, 0).cross(windDir);
    perp1.normalize();
    const perp2 = windDir.clone().cross(perp1).normalize();

    // Rake emitter dimensions safely within domain
    const spread1 = (Math.random() - 0.5) * 1.1;
    const spread2 = (Math.random() - 0.5) * 1.1;

    let initPos = center.clone()
      .addScaledVector(perp1, spread1)
      .addScaledVector(perp2, spread2);

    // Clamp inside domain
    initPos.x = Math.max(domMin.x * 0.94, Math.min(domMax.x * 0.94, initPos.x));
    initPos.y = Math.max(domMin.y * 0.94, Math.min(domMax.y * 0.94, initPos.y));
    initPos.z = Math.max(domMin.z * 0.94, Math.min(domMax.z * 0.94, initPos.z));

    if (randomInitialSpread) {
      // Distribute particles along entire tunnel at startup
      initPos.addScaledVector(windDir, Math.random() * (tUpstream * 1.8));
    }

    const i3 = index * 3;
    this.positions[i3 + 0] = initPos.x;
    this.positions[i3 + 1] = initPos.y;
    this.positions[i3 + 2] = initPos.z;

    this.lifetimes[index] = randomInitialSpread ? Math.random() * 120 : 0;
    this.maxLifetimes[index] = 120 + Math.random() * 60;
    this.sizes[index] = 0.035 + Math.random() * 0.025;

    // Initial neutral color
    this.colors[i3 + 0] = 0.4;
    this.colors[i3 + 1] = 0.8;
    this.colors[i3 + 2] = 1.0;
  }

  /**
   * Advect particles through 3D CFD velocity field
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   * @param {number} deltaTime
   */
  update(flowSolver, deltaTime = 0.016) {
    if (!this.visible || !flowSolver || !flowSolver.voxelData) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;

    const dt = Math.min(0.04, deltaTime) * this.speedMultiplier * 26.0;
    const posAttr = this.points.geometry.attributes.position;
    const colorAttr = this.points.geometry.attributes.color;

    const domMin = flowSolver.domainMin;
    const domMax = flowSolver.domainMax;
    const vInf = 0.07;

    for (let i = 0; i < this.maxParticles; i++) {
      const i3 = i * 3;
      this.pos.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);

      this.lifetimes[i]++;

      // Exceeded lifetime or left domain -> reset upstream
      if (
        this.lifetimes[i] > this.maxLifetimes[i] ||
        this.pos.x < domMin.x - 0.2 || this.pos.x > domMax.x + 0.2 ||
        this.pos.y < domMin.y - 0.2 || this.pos.y > domMax.y + 0.2 ||
        this.pos.z < domMin.z - 0.2 || this.pos.z > domMax.z + 0.2
      ) {
        this.resetParticle(i, false, flowSolver);
        continue;
      }

      // Sample local velocity
      flowSolver.getVelocityAt(this.pos, this.vel);
      const speed = this.vel.length();

      // If particle entered solid obstacle, deflect outward
      if (speed < 0.005) {
        this.pos.add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05
        ));
      } else {
        // Advect
        this.pos.addScaledVector(this.vel, dt);
      }

      this.positions[i3 + 0] = this.pos.x;
      this.positions[i3 + 1] = this.pos.y;
      this.positions[i3 + 2] = this.pos.z;

      // Colorize particle based on local velocity
      const normalizedSpeed = Math.max(0, Math.min(1, speed / (vInf * 1.8)));
      const col = Colormap.getColor(normalizedSpeed, this.colormapScheme);

      this.colors[i3 + 0] = col.r;
      this.colors[i3 + 1] = col.g;
      this.colors[i3 + 2] = col.b;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }
}
