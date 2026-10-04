import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export class STLParser {
  constructor() {
    this.loader = new STLLoader();
  }

  /**
   * Parse an ArrayBuffer into a THREE.BufferGeometry and compute geometric properties
   * @param {ArrayBuffer} buffer
   * @param {string} fileName
   */
  parse(buffer, fileName = 'model.stl') {
    const geometry = this.loader.parse(buffer);
    geometry.computeVertexNormals();

    const analysis = this.analyzeGeometry(geometry, fileName);
    return {
      geometry,
      analysis,
    };
  }

  /**
   * Compute geometric dimensions, areas, and centroid
   * @param {THREE.BufferGeometry} geometry
   * @param {string} fileName
   */
  analyzeGeometry(geometry, fileName = 'model.stl') {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;

    const size = new THREE.Vector3();
    bbox.getSize(size);

    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const pos = geometry.attributes.position;
    const vertexCount = pos.count;
    const triangleCount = vertexCount / 3;

    // Calculate total surface area
    let totalSurfaceArea = 0;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i += 3) {
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);

      ab.subVectors(vB, vA);
      ac.subVectors(vC, vA);
      cross.crossVectors(ab, ac);
      totalSurfaceArea += cross.length() * 0.5;
    }

    return {
      fileName,
      triangleCount,
      vertexCount,
      dimensions: {
        x: size.x,
        y: size.y,
        z: size.z,
      },
      center: {
        x: center.x,
        y: center.y,
        z: center.z,
      },
      maxDimension: Math.max(size.x, size.y, size.z),
      totalSurfaceArea,
      boundingBox: {
        min: bbox.min.clone(),
        max: bbox.max.clone(),
      },
    };
  }

  /**
   * Scale and center geometry so it fits perfectly inside a standard aerodynamic domain [-1, 1]^3
   * @param {THREE.BufferGeometry} geometry
   * @param {number} targetScale - normalized size, e.g. 1.4 units
   */
  normalizeGeometry(geometry, targetScale = 1.4) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);

    // Center geometry at origin (0, 0, 0)
    geometry.translate(-center.x, -center.y, -center.z);

    // Uniformly scale to target bounding size
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? targetScale / maxDim : 1;

    geometry.scale(scaleFactor, scaleFactor, scaleFactor);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    return {
      scaleFactor,
      center,
      normalizedBox: geometry.boundingBox,
    };
  }

  /**
   * Estimate projected frontal area along an arbitrary travel direction vector
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Vector3} travelDirection - normalized vector
   */
  calculateProjectedArea(geometry, travelDirection) {
    const pos = geometry.attributes.position;
    const count = pos.count;
    let projArea = 0;

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const dir = travelDirection.clone().normalize();

    for (let i = 0; i < count; i += 3) {
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);

      ab.subVectors(vB, vA);
      ac.subVectors(vC, vA);
      normal.crossVectors(ab, ac);

      // Dot product with direction: only facing triangles contribute to frontal area
      const dot = normal.dot(dir);
      if (dot > 0) {
        projArea += dot * 0.5;
      }
    }

    return Math.max(projArea, 0.001);
  }
}
