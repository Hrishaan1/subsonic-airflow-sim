import * as THREE from 'three';
import { Colormap } from './colormap.js';

export class STLViewer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.wireframeMesh = null;
    this.originalGeometry = null;

    this.displayMode = 'cfd_pressure'; // 'cfd_pressure', 'carbon', 'clay', 'metallic'
    this.showWireframe = false;
    this.colormapScheme = 'turbo'; // 'turbo', 'coolwarm', 'viridis', 'jet'

    this.pressureColors = null; // Float32Array for vertex colors
  }

  /**
   * Set the active 3D geometry to display
   */
  setGeometry(geometry) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.wireframeMesh) this.scene.remove(this.wireframeMesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    this.originalGeometry = geometry;
    const geom = geometry.clone();
    geom.computeVertexNormals();

    const count = geom.attributes.position.count;
    this.pressureColors = new Float32Array(count * 3);
    geom.setAttribute('color', new THREE.BufferAttribute(this.pressureColors, 3));

    // Create primary mesh
    const material = this.createMaterial();
    this.mesh = new THREE.Mesh(geom, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    // Create wireframe overlay
    const wireGeom = new THREE.WireframeGeometry(geom);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.15,
      depthTest: true,
    });
    this.wireframeMesh = new THREE.LineSegments(wireGeom, wireMat);
    this.wireframeMesh.visible = this.showWireframe;
    this.scene.add(this.wireframeMesh);
  }

  createMaterial() {
    switch (this.displayMode) {
      case 'carbon':
        return new THREE.MeshStandardMaterial({
          color: 0x1a1e26,
          metalness: 0.7,
          roughness: 0.35,
        });

      case 'clay':
        return new THREE.MeshLambertMaterial({
          color: 0xe0e6ed,
        });

      case 'metallic':
        return new THREE.MeshStandardMaterial({
          color: 0xb0c4de,
          metalness: 0.9,
          roughness: 0.2,
        });

      case 'cfd_pressure':
      default:
        // Vertex colors driven by CFD surface pressure Cp
        return new THREE.MeshStandardMaterial({
          vertexColors: true,
          metalness: 0.15,
          roughness: 0.45,
          shadowSide: THREE.DoubleSide,
        });
    }
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    if (this.mesh) {
      this.mesh.material.dispose();
      this.mesh.material = this.createMaterial();
      this.mesh.material.needsUpdate = true;
    }
  }

  setColormap(scheme) {
    this.colormapScheme = scheme;
  }

  setWireframeVisible(visible) {
    this.showWireframe = visible;
    if (this.wireframeMesh) {
      this.wireframeMesh.visible = visible;
    }
  }

  setOpacity(opacity) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.transparent = opacity < 1.0;
      this.mesh.material.opacity = opacity;
    }
  }

  /**
   * Update surface pressure heatmap from CFD flow solver
   * @param {import('../cfd/flowSolver.js').FlowSolver} flowSolver
   */
  updateSurfacePressure(flowSolver) {
    if (!this.mesh || this.displayMode !== 'cfd_pressure') return;

    const geom = this.mesh.geometry;
    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    const colorAttr = geom.attributes.color;
    const count = pos.count;

    const travelDir = flowSolver.travelDirection;
    // Relative wind enters in -travelDir
    const windDir = travelDir.clone().negate().normalize();
    const alphaRad = (flowSolver.angleAttack * Math.PI) / 180;

    const vPos = new THREE.Vector3();
    const vNorm = new THREE.Vector3();

    // Map surface pressure coefficient Cp from ~ -1.5 (suction) to +1.0 (stagnation)
    for (let i = 0; i < count; i++) {
      vPos.fromBufferAttribute(pos, i);
      vNorm.fromBufferAttribute(norm, i);

      // Dot product of surface normal with incoming wind:
      // Facing wind (cosTheta < 0 since normal points outward) -> stagnation point!
      const dotWind = vNorm.dot(windDir);

      // Sample local LBM density/pressure
      const sampledRho = flowSolver.getPressureAt(vPos);
      const lbmPressureDelta = (sampledRho - 1.0) * 12.0;

      // Theoretical surface pressure: Cp = 1 - (V/V_inf)^2
      // At stagnation point (dotWind = -1): Cp = +1.0
      // Over suction peaks (upper curved surfaces): Cp becomes negative
      let cp = -dotWind * 0.95 + lbmPressureDelta;

      // Lift effect: upper surfaces (vNorm.y > 0) have suction when positive AoA
      if (alphaRad > 0 && vNorm.y > 0.1) {
        cp -= 0.65 * Math.sin(alphaRad) * vNorm.y;
      } else if (alphaRad < 0 && vNorm.y < -0.1) {
        cp -= 0.65 * Math.sin(-alphaRad) * (-vNorm.y);
      }

      // Trailing wake pressure defect
      if (vPos.dot(travelDir) < -0.2) {
        cp = Math.max(-0.4, cp * 0.5 - 0.2);
      }

      // Normalize Cp from [-1.2, +1.0] to [0, 1] for colormap
      const normalizedCp = Math.max(0, Math.min(1, (cp + 1.2) / 2.2));
      const col = Colormap.getColor(normalizedCp, this.colormapScheme);

      colorAttr.setXYZ(i, col.r, col.g, col.b);
    }

    colorAttr.needsUpdate = true;
  }
}
