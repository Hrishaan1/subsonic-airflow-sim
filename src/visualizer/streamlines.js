import * as THREE from 'three';
import { Colormap } from './colormap.js';

export class StreamlineVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.linesGroup = new THREE.Group();
    this.scene.add(this.linesGroup);

    this.streamlinesMesh = null;
    this.lineCount = 64;
    this.stepSize = 0.045;
    this.maxSteps = 80;
    this.visible = true;
    this.colormapScheme = 'turbo';
    this.colorBy = 'velocity'; // 'velocity' or 'pressure'

    // Flow animation pulse
    this.pulsePhase = 0;
  }

  setVisible(visible) {
    this.visible = visible;
    this.linesGroup.visible = visible;
  }

  setLineCount(count) {
    this.lineCount = count;
  }

  setColormap(scheme) {
    this.colormapScheme = scheme;
  }

  setColorBy(mode) {
    this.colorBy = mode;
  }

  /**
   * Generate 3D seed points upstream of the model for arbitrary wind direction
   * @param {THREE.Vector3} windDir - incoming relative wind direction
   * @param {THREE.Vector3} domainMin
   * @param {THREE.Vector3} domainMax
   */
  generateSeedPoints(windDir, domainMin, domainMax) {
    const seeds = [];
    const domMin = domainMin || new THREE.Vector3(-1.8, -0.9, -0.9);
    const domMax = domainMax || new THREE.Vector3(1.8, 0.9, 0.9);

    // Compute distance to upstream domain boundary along ray: P(t) = -t * windDir
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
    const upstreamCenter = windDir.clone().negate().multiplyScalar(tUpstream);

    // Compute two orthogonal basis vectors perpendicular to windDir
    let perp1 = new THREE.Vector3(0, 1, 0).cross(windDir);
    if (perp1.lengthSq() < 0.01) {
      perp1 = new THREE.Vector3(1, 0, 0).cross(windDir);
    }
    perp1.normalize();
    const perp2 = windDir.clone().cross(perp1).normalize();

    // Rectangular grid rake
    const nY = Math.max(4, Math.floor(Math.sqrt(this.lineCount)));
    const nZ = Math.ceil(this.lineCount / nY);

    const span1 = 0.95;
    const span2 = 0.95;

    for (let j = 0; j < nY; j++) {
      const vNorm = (j / (nY - 1) - 0.5) * span1;
      for (let k = 0; k < nZ; k++) {
        const uNorm = (k / (nZ - 1) - 0.5) * span2;

        const seed = upstreamCenter.clone()
          .addScaledVector(perp1, uNorm)
          .addScaledVector(perp2, vNorm);

        // Clamp seed safely inside fluid domain
        seed.x = Math.max(domMin.x * 0.94, Math.min(domMax.x * 0.94, seed.x));
        seed.y = Math.max(domMin.y * 0.94, Math.min(domMax.y * 0.94, seed.y));
        seed.z = Math.max(domMin.z * 0.94, Math.min(domMax.z * 0.94, seed.z));

        seeds.push(seed);
      }
    }

    return seeds;
  }

  /**
   * Integrate streamlines through 3D velocity field using 4th-Order Runge-Kutta (RK4)
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   */
  update(flowSolver) {
    if (!this.visible || !flowSolver || !flowSolver.voxelData) {
      if (this.streamlinesMesh) this.streamlinesMesh.visible = false;
      return;
    }

    const windDir = flowSolver.travelDirection.clone().negate().normalize();
    const seeds = this.generateSeedPoints(windDir, flowSolver.domainMin, flowSolver.domainMax);

    const positions = [];
    const colors = [];

    const k1 = new THREE.Vector3();
    const k2 = new THREE.Vector3();
    const k3 = new THREE.Vector3();
    const k4 = new THREE.Vector3();
    const tempPos = new THREE.Vector3();
    const vel = new THREE.Vector3();

    const dt = this.stepSize;
    const domMin = flowSolver.domainMin;
    const domMax = flowSolver.domainMax;

    // Streamline velocity reference for coloring
    const vInf = 0.07;

    for (let s = 0; s < seeds.length; s++) {
      let currentPos = seeds[s].clone();

      for (let step = 0; step < this.maxSteps; step++) {
        // Domain bounds check
        if (
          currentPos.x < domMin.x || currentPos.x > domMax.x ||
          currentPos.y < domMin.y || currentPos.y > domMax.y ||
          currentPos.z < domMin.z || currentPos.z > domMax.z
        ) {
          break;
        }

        // RK4 Step
        flowSolver.getVelocityAt(currentPos, k1);
        const speed1 = k1.length();
        if (speed1 < 0.001) break; // Inside obstacle or stagnation

        tempPos.copy(currentPos).addScaledVector(k1, 0.5 * dt);
        flowSolver.getVelocityAt(tempPos, k2);

        tempPos.copy(currentPos).addScaledVector(k2, 0.5 * dt);
        flowSolver.getVelocityAt(tempPos, k3);

        tempPos.copy(currentPos).addScaledVector(k3, dt);
        flowSolver.getVelocityAt(tempPos, k4);

        const nextPos = currentPos.clone().add(
          k1.clone().addScaledVector(k2, 2).addScaledVector(k3, 2).add(k4).multiplyScalar(dt / 6)
        );

        // Compute local scalar for coloring
        vel.copy(k1);
        const localSpeed = vel.length();
        let scalar = 0.5;

        if (this.colorBy === 'velocity') {
          scalar = Math.max(0, Math.min(1, localSpeed / (vInf * 1.8)));
        } else {
          // Pressure
          const p = flowSolver.getPressureAt(currentPos);
          scalar = Math.max(0, Math.min(1, (p - 0.94) / 0.12));
        }

        const col = Colormap.getColor(scalar, this.colormapScheme);

        // Add segment
        positions.push(currentPos.x, currentPos.y, currentPos.z);
        positions.push(nextPos.x, nextPos.y, nextPos.z);

        colors.push(col.r, col.g, col.b);
        colors.push(col.r, col.g, col.b);

        currentPos = nextPos;
      }
    }

    if (this.streamlinesMesh) {
      this.linesGroup.remove(this.streamlinesMesh);
      this.streamlinesMesh.geometry.dispose();
      this.streamlinesMesh.material.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      linewidth: 2,
    });

    this.streamlinesMesh = new THREE.LineSegments(geometry, material);
    this.linesGroup.add(this.streamlinesMesh);
  }

  animate(deltaTime) {
    this.pulsePhase = (this.pulsePhase + deltaTime * 2.0) % 1.0;
  }
}
