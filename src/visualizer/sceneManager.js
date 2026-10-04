import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  constructor(containerElement) {
    this.container = containerElement;

    // Three.js Core
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a13);
    this.scene.fog = new THREE.FogExp2(0x070a13, 0.05);

    // Camera
    const width = containerElement.clientWidth || window.innerWidth || 1200;
    const height = containerElement.clientHeight || window.innerHeight || 800;
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(3.2, 2.0, 3.2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerElement.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 0.5;
    this.controls.target.set(0, 0, 0);

    // Setup Lighting & Environment
    this.setupLighting();
    this.setupWindTunnelChamber();

    // Resize observer
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xddeeff, 0.85);
    this.scene.add(ambient);

    // Main Studio Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Aerodynamic Blue Rim/Fill Light
    const fillLight = new THREE.DirectionalLight(0x00f2fe, 1.4);
    fillLight.position.set(-6, 3, -5);
    this.scene.add(fillLight);

    // Soft warm under-bounce light
    const bounceLight = new THREE.DirectionalLight(0xff8844, 0.6);
    bounceLight.position.set(0, -6, 0);
    this.scene.add(bounceLight);

    // Hemisphere light
    const hemiLight = new THREE.HemisphereLight(0x406080, 0x101520, 0.6);
    this.scene.add(hemiLight);
  }

  setupWindTunnelChamber() {
    this.chamberGroup = new THREE.Group();

    // Ground Grid with aerodynamic measurement markings
    const gridHelper = new THREE.GridHelper(8, 32, 0x00f2fe, 0x16253b);
    gridHelper.position.y = -0.92;
    this.chamberGroup.add(gridHelper);

    // Subtle Wind Tunnel Test Section bounding box: [-1.8, 1.8] x [-0.9, 0.9] x [-0.9, 0.9]
    const boxGeom = new THREE.BoxGeometry(3.6, 1.8, 1.8);
    const boxEdges = new THREE.EdgesGeometry(boxGeom);
    const boxLineMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.18,
      linewidth: 1,
    });
    const boxLines = new THREE.LineSegments(boxEdges, boxLineMat);
    this.chamberGroup.add(boxLines);

    // Transparent wind tunnel acrylic test walls
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1424,
      transparent: true,
      opacity: 0.04,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      depthWrite: false,
    });
    const wallMesh = new THREE.Mesh(boxGeom, wallMat);
    this.chamberGroup.add(wallMesh);

    this.scene.add(this.chamberGroup);
  }

  setTunnelVisibility(visible) {
    this.chamberGroup.visible = visible;
  }

  setCameraView(viewName) {
    const dist = 3.6;
    switch (viewName) {
      case 'top':
        this.camera.position.set(0, dist * 1.2, 0.001);
        this.controls.target.set(0, 0, 0);
        break;
      case 'side':
        this.camera.position.set(0, 0, dist);
        this.controls.target.set(0, 0, 0);
        break;
      case 'front':
        this.camera.position.set(dist, 0, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case 'iso':
      default:
        this.camera.position.set(3.2, 2.0, 3.2);
        this.controls.target.set(0, 0, 0);
        break;
    }
    this.controls.update();
  }

  onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth || window.innerWidth || 1200;
    const height = this.container.clientHeight || window.innerHeight || 800;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
