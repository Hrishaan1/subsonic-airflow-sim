import * as THREE from 'three';
import { Colormap } from './colormap.js';

export class SliceViewer {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.planeAxis = 'z'; // 'x', 'y', 'z'
    this.slicePosition = 0.0; // [-0.8, 0.8]
    this.fieldMode = 'velocity'; // 'velocity', 'pressure'
    this.colormapScheme = 'turbo';

    // 2D dynamic canvas for slice texture
    this.canvasWidth = 128;
    this.canvasHeight = 64;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Slice plane mesh (DoubleSided)
    const geom = new THREE.PlaneGeometry(3.6, 1.8);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.visible = this.visible;
    this.scene.add(this.mesh);

    // Border line outline
    const borderGeom = new THREE.EdgesGeometry(geom);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, linewidth: 2 });
    this.border = new THREE.LineSegments(borderGeom, borderMat);
    this.mesh.add(this.border);

    this.updatePlaneTransform();
  }

  setVisible(visible) {
    this.visible = visible;
    this.mesh.visible = visible;
  }

  setAxis(axis) {
    this.planeAxis = axis;
    this.updatePlaneTransform();
  }

  setPosition(pos) {
    this.slicePosition = pos;
    this.updatePlaneTransform();
  }

  setFieldMode(mode) {
    this.fieldMode = mode;
  }

  setColormap(scheme) {
    this.colormapScheme = scheme;
  }

  updatePlaneTransform() {
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.set(0, 0, 0);

    if (this.planeAxis === 'z') {
      // Spanwise slice (XY plane at Z = slicePosition)
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(3.6, 1.8);
      this.mesh.position.z = this.slicePosition;
      this.mesh.rotation.y = 0;
    } else if (this.planeAxis === 'y') {
      // Planform / Top slice (XZ plane at Y = slicePosition)
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(3.6, 1.8);
      this.mesh.rotation.x = Math.PI / 2;
      this.mesh.position.y = this.slicePosition;
    } else if (this.planeAxis === 'x') {
      // Cross-sectional slice (YZ plane at X = slicePosition)
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(1.8, 1.8);
      this.mesh.rotation.y = Math.PI / 2;
      this.mesh.position.x = this.slicePosition;
    }
  }

  /**
   * Sample 3D CFD field onto the 2D slice canvas texture
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   */
  update(flowSolver) {
    if (!this.visible || !flowSolver || !flowSolver.voxelData) return;

    const imgData = this.ctx.createImageData(this.canvasWidth, this.canvasHeight);
    const data = imgData.data;

    const domMin = flowSolver.domainMin;
    const domMax = flowSolver.domainMax;
    const samplePos = new THREE.Vector3();
    const vel = new THREE.Vector3();

    const vInf = 0.07;

    for (let py = 0; py < this.canvasHeight; py++) {
      // Note: canvas y=0 is top, in 3D domain y is vertical
      const vNorm = 1.0 - py / (this.canvasHeight - 1);

      for (let px = 0; px < this.canvasWidth; px++) {
        const uNorm = px / (this.canvasWidth - 1);

        if (this.planeAxis === 'z') {
          samplePos.x = domMin.x + uNorm * (domMax.x - domMin.x);
          samplePos.y = domMin.y + vNorm * (domMax.y - domMin.y);
          samplePos.z = this.slicePosition;
        } else if (this.planeAxis === 'y') {
          samplePos.x = domMin.x + uNorm * (domMax.x - domMin.x);
          samplePos.y = this.slicePosition;
          samplePos.z = domMin.z + vNorm * (domMax.z - domMin.z);
        } else {
          samplePos.x = this.slicePosition;
          samplePos.y = domMin.y + vNorm * (domMax.y - domMin.y);
          samplePos.z = domMin.z + uNorm * (domMax.z - domMin.z);
        }

        let scalar = 0.5;
        if (this.fieldMode === 'velocity') {
          flowSolver.getVelocityAt(samplePos, vel);
          scalar = Math.max(0, Math.min(1, vel.length() / (vInf * 1.8)));
        } else {
          // Pressure
          const p = flowSolver.getPressureAt(samplePos);
          scalar = Math.max(0, Math.min(1, (p - 0.94) / 0.12));
        }

        const col = Colormap.getColor(scalar, this.colormapScheme);
        const pIdx = (py * this.canvasWidth + px) * 4;

        data[pIdx + 0] = Math.round(col.r * 255);
        data[pIdx + 1] = Math.round(col.g * 255);
        data[pIdx + 2] = Math.round(col.b * 255);
        data[pIdx + 3] = 220; // Slight transparency
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
    this.texture.needsUpdate = true;
  }
}
