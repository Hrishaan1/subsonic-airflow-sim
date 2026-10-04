import * as THREE from 'three';

export class Voxelizer {
  /**
   * Voxelizes a THREE.BufferGeometry onto a 3D Cartesian grid [Nx, Ny, Nz]
   * Domain spans [domainMin, domainMax] in 3D space
   * @param {THREE.BufferGeometry} geometry
   * @param {Object} options
   */
  static voxelize(geometry, options = {}) {
    const {
      nx = 64,
      ny = 32,
      nz = 32,
      domainMin = new THREE.Vector3(-1.8, -0.9, -0.9),
      domainMax = new THREE.Vector3(1.8, 0.9, 0.9),
    } = options;

    const dx = (domainMax.x - domainMin.x) / nx;
    const dy = (domainMax.y - domainMin.y) / ny;
    const dz = (domainMax.z - domainMin.z) / nz;

    const totalCells = nx * ny * nz;
    const solidMask = new Uint8Array(totalCells);
    const boundaryMask = new Uint8Array(totalCells);

    // Surface normal vectors at boundary cells (nx, ny, nz flattened into Float32Array)
    const boundaryNormals = new Float32Array(totalCells * 3);

    // Prepare triangles
    const pos = geometry.attributes.position;
    const count = pos.count;

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const e0 = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const triNormal = new THREE.Vector3();
    const triBox = new THREE.Box3();

    const cellMin = new THREE.Vector3();
    const cellMax = new THREE.Vector3();
    const cellCenter = new THREE.Vector3();
    const boxHalfSize = new THREE.Vector3(dx * 0.5, dy * 0.5, dz * 0.5);

    // Helper for 1D grid index
    const getIndex = (i, j, k) => i + j * nx + k * nx * ny;

    let solidCount = 0;

    for (let t = 0; t < count; t += 3) {
      vA.fromBufferAttribute(pos, t);
      vB.fromBufferAttribute(pos, t + 1);
      vC.fromBufferAttribute(pos, t + 2);

      // Triangle bounding box
      triBox.makeEmpty();
      triBox.expandByPoint(vA);
      triBox.expandByPoint(vB);
      triBox.expandByPoint(vC);

      // Grid index bounds for this triangle
      const iStart = Math.max(0, Math.floor((triBox.min.x - domainMin.x) / dx));
      const iEnd = Math.min(nx - 1, Math.floor((triBox.max.x - domainMin.x) / dx));

      const jStart = Math.max(0, Math.floor((triBox.min.y - domainMin.y) / dy));
      const jEnd = Math.min(ny - 1, Math.floor((triBox.max.y - domainMin.y) / dy));

      const kStart = Math.max(0, Math.floor((triBox.min.z - domainMin.z) / dz));
      const kEnd = Math.min(nz - 1, Math.floor((triBox.max.z - domainMin.z) / dz));

      // Triangle edges and face normal
      e0.subVectors(vB, vA);
      e1.subVectors(vC, vB);
      e2.subVectors(vA, vC);
      triNormal.crossVectors(e0, e1).normalize();

      for (let k = kStart; k <= kEnd; k++) {
        const cz = domainMin.z + (k + 0.5) * dz;
        for (let j = jStart; j <= jEnd; j++) {
          const cy = domainMin.y + (j + 0.5) * dy;
          for (let i = iStart; i <= iEnd; i++) {
            const idx = getIndex(i, j, k);
            if (solidMask[idx] === 1) continue;

            const cx = domainMin.x + (i + 0.5) * dx;
            cellCenter.set(cx, cy, cz);

            // Test intersection between triangle (vA, vB, vC) and AABB box at cellCenter with boxHalfSize
            if (this.triangleAABBIntersection(vA, vB, vC, e0, e1, e2, triNormal, cellCenter, boxHalfSize)) {
              solidMask[idx] = 1;
              solidCount++;

              // Accumulate normal for boundary
              boundaryNormals[idx * 3] += triNormal.x;
              boundaryNormals[idx * 3 + 1] += triNormal.y;
              boundaryNormals[idx * 3 + 2] += triNormal.z;
            }
          }
        }
      }
    }

    // Interior cavity fill (flood fill or raycast on solid grid so enclosed hulls are fully solid)
    this.fillInterior(solidMask, nx, ny, nz);

    // Identify boundary cells (solid cells having at least one non-solid 6-neighbor)
    let boundaryCount = 0;
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = getIndex(i, j, k);
          if (solidMask[idx] === 1) {
            // Check 6 neighbors
            const isBoundary = (
              solidMask[getIndex(i + 1, j, k)] === 0 ||
              solidMask[getIndex(i - 1, j, k)] === 0 ||
              solidMask[getIndex(i, j + 1, k)] === 0 ||
              solidMask[getIndex(i, j - 1, k)] === 0 ||
              solidMask[getIndex(i, j, k + 1)] === 0 ||
              solidMask[getIndex(i, j, k - 1)] === 0
            );

            if (isBoundary) {
              boundaryMask[idx] = 1;
              boundaryCount++;

              // If normal not set by triangle, estimate via neighbor gradient
              const nX = (solidMask[getIndex(i - 1, j, k)] - solidMask[getIndex(i + 1, j, k)]);
              const nY = (solidMask[getIndex(i, j - 1, k)] - solidMask[getIndex(i, j + 1, k)]);
              const nZ = (solidMask[getIndex(i, j, k - 1)] - solidMask[getIndex(i, j, k + 1)]);
              const len = Math.hypot(nX, nY, nZ);
              if (len > 0.001) {
                boundaryNormals[idx * 3] = nX / len;
                boundaryNormals[idx * 3 + 1] = nY / len;
                boundaryNormals[idx * 3 + 2] = nZ / len;
              }
            }
          }
        }
      }
    }

    return {
      nx,
      ny,
      nz,
      dx,
      dy,
      dz,
      domainMin,
      domainMax,
      solidMask,
      boundaryMask,
      boundaryNormals,
      solidCount,
      boundaryCount,
    };
  }

  /**
   * Fast Separating Axis Theorem (SAT) test for Triangle vs 3D Box
   */
  static triangleAABBIntersection(v0, v1, v2, e0, e1, e2, normal, boxCenter, boxHalf) {
    // Translate triangle so box center is at origin
    const v0x = v0.x - boxCenter.x;
    const v0y = v0.y - boxCenter.y;
    const v0z = v0.z - boxCenter.z;

    const v1x = v1.x - boxCenter.x;
    const v1y = v1.y - boxCenter.y;
    const v1z = v1.z - boxCenter.z;

    const v2x = v2.x - boxCenter.x;
    const v2y = v2.y - boxCenter.y;
    const v2z = v2.z - boxCenter.z;

    // Test 1: AABB face normals (X, Y, Z axes)
    let min = Math.min(v0x, v1x, v2x);
    let max = Math.max(v0x, v1x, v2x);
    if (min > boxHalf.x || max < -boxHalf.x) return false;

    min = Math.min(v0y, v1y, v2y);
    max = Math.max(v0y, v1y, v2y);
    if (min > boxHalf.y || max < -boxHalf.y) return false;

    min = Math.min(v0z, v1z, v2z);
    max = Math.max(v0z, v1z, v2z);
    if (min > boxHalf.z || max < -boxHalf.z) return false;

    // Test 2: Triangle plane normal
    const d = normal.x * v0x + normal.y * v0y + normal.z * v0z;
    const r = boxHalf.x * Math.abs(normal.x) + boxHalf.y * Math.abs(normal.y) + boxHalf.z * Math.abs(normal.z);
    if (Math.abs(d) > r) return false;

    // Test 3: 9 Cross-product axes (edges e0, e1, e2 cross coordinate axes)
    // Axis a00 = (0, -e0.z, e0.y)
    let p0 = -v0y * e0.z + v0z * e0.y;
    let p2 = -v2y * e0.z + v2z * e0.y;
    let rad = boxHalf.y * Math.abs(e0.z) + boxHalf.z * Math.abs(e0.y);
    if (Math.min(p0, p2) > rad || Math.max(p0, p2) < -rad) return false;

    // Axis a10 = (0, -e1.z, e1.y)
    p0 = -v0y * e1.z + v0z * e1.y;
    let p1 = -v1y * e1.z + v1z * e1.y;
    rad = boxHalf.y * Math.abs(e1.z) + boxHalf.z * Math.abs(e1.y);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    // Axis a20 = (0, -e2.z, e2.y)
    p0 = -v0y * e2.z + v0z * e2.y;
    p1 = -v1y * e2.z + v1z * e2.y;
    rad = boxHalf.y * Math.abs(e2.z) + boxHalf.z * Math.abs(e2.y);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    // Axis a01 = (e0.z, 0, -e0.x)
    p0 = v0x * e0.z - v0z * e0.x;
    p2 = v2x * e0.z - v2z * e0.x;
    rad = boxHalf.x * Math.abs(e0.z) + boxHalf.z * Math.abs(e0.x);
    if (Math.min(p0, p2) > rad || Math.max(p0, p2) < -rad) return false;

    // Axis a11 = (e1.z, 0, -e1.x)
    p0 = v0x * e1.z - v0z * e1.x;
    p1 = v1x * e1.z - v1z * e1.x;
    rad = boxHalf.x * Math.abs(e1.z) + boxHalf.z * Math.abs(e1.x);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    // Axis a21 = (e2.z, 0, -e2.x)
    p0 = v0x * e2.z - v0z * e2.x;
    p1 = v1x * e2.z - v1z * e2.x;
    rad = boxHalf.x * Math.abs(e2.z) + boxHalf.z * Math.abs(e2.x);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    // Axis a02 = (-e0.y, e0.x, 0)
    p0 = -v0x * e0.y + v0y * e0.x;
    p2 = -v2x * e0.y + v2y * e0.x;
    rad = boxHalf.x * Math.abs(e0.y) + boxHalf.y * Math.abs(e0.x);
    if (Math.min(p0, p2) > rad || Math.max(p0, p2) < -rad) return false;

    // Axis a12 = (-e1.y, e1.x, 0)
    p0 = -v0x * e1.y + v0y * e1.x;
    p1 = -v1x * e1.y + v1y * e1.x;
    rad = boxHalf.x * Math.abs(e1.y) + boxHalf.y * Math.abs(e1.x);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    // Axis a22 = (-e2.y, e2.x, 0)
    p0 = -v0x * e2.y + v0y * e2.x;
    p1 = -v1x * e2.y + v1y * e2.x;
    rad = boxHalf.x * Math.abs(e2.y) + boxHalf.y * Math.abs(e2.x);
    if (Math.min(p0, p1) > rad || Math.max(p0, p1) < -rad) return false;

    return true;
  }

  /**
   * Fills enclosed cavities inside closed STL meshes so the inside is solid
   */
  static fillInterior(solidMask, nx, ny, nz) {
    const total = nx * ny * nz;
    const isOutside = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const getIdx = (i, j, k) => i + j * nx + k * nx * ny;

    // Seed flood-fill from all 6 external domain boundaries
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i of [0, nx - 1]) {
          const idx = getIdx(i, j, k);
          if (solidMask[idx] === 0 && isOutside[idx] === 0) {
            isOutside[idx] = 1;
            queue[tail++] = idx;
          }
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        for (let j of [0, ny - 1]) {
          const idx = getIdx(i, j, k);
          if (solidMask[idx] === 0 && isOutside[idx] === 0) {
            isOutside[idx] = 1;
            queue[tail++] = idx;
          }
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        for (let k of [0, nz - 1]) {
          const idx = getIdx(i, j, k);
          if (solidMask[idx] === 0 && isOutside[idx] === 0) {
            isOutside[idx] = 1;
            queue[tail++] = idx;
          }
        }
      }
    }

    // BFS Flood Fill outer fluid cells
    while (head < tail) {
      const curr = queue[head++];
      const i = curr % nx;
      const rem = Math.floor(curr / nx);
      const j = rem % ny;
      const k = Math.floor(rem / ny);

      const neighbors = [
        [i + 1, j, k],
        [i - 1, j, k],
        [i, j + 1, k],
        [i, j - 1, k],
        [i, j, k + 1],
        [i, j, k - 1],
      ];

      for (const [ni, nj, nk] of neighbors) {
        if (ni >= 0 && ni < nx && nj >= 0 && nj < ny && nk >= 0 && nk < nz) {
          const nIdx = getIdx(ni, nj, nk);
          if (solidMask[nIdx] === 0 && isOutside[nIdx] === 0) {
            isOutside[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    // Any cell that is NOT reached by flood fill from the outer domain is inside the STL!
    for (let idx = 0; idx < total; idx++) {
      if (isOutside[idx] === 0) {
        solidMask[idx] = 1;
      }
    }
  }
}
