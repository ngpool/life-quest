import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.querySelector('#battle-canvas');
if (!canvas) { window.battle3D = { available: false }; }
else {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    console.error('Three.js renderer could not start:', error);
    window.battle3D = { available: false };
  }

  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#76816f', 0.016);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 180);
    const sunDirection = new THREE.Vector3(-9, 15, 8).normalize();
    const skyUniforms = (sky) => {
      sky.scale.setScalar(450000);
      sky.material.uniforms.turbidity.value = 8.5;
      sky.material.uniforms.rayleigh.value = 1.05;
      sky.material.uniforms.mieCoefficient.value = 0.0028;
      sky.material.uniforms.mieDirectionalG.value = 0.76;
      sky.material.uniforms.sunPosition.value.copy(sunDirection);
    };
    const sky = new Sky();
    skyUniforms(sky);
    scene.add(sky);
    const environmentSky = new Sky();
    skyUniforms(environmentSky);
    const environmentScene = new THREE.Scene();
    environmentScene.add(environmentSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(environmentScene, 0.04, 1, 450000);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();

    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    const ambientOcclusion = new GTAOPass(scene, camera, 1, 1);
    ambientOcclusion.blendIntensity = 0.82;
    ambientOcclusion.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.1, thickness: 0.08, samples: 12 });
    composer.addPass(ambientOcclusion);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.08, 0.34, 0.94));
    composer.addPass(new OutputPass());
    const hemi = new THREE.HemisphereLight('#dce8e0', '#27281e', 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe0ad', 2.5);
    sun.position.set(-9, 15, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    sun.shadow.camera.left = -19; sun.shadow.camera.right = 19;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    const world = new THREE.Group(); scene.add(world);
    const terrainHeightAt = (x, z) => Math.sin(x * .23 + z * .09) * .24 + Math.cos(z * .3) * .19
      + Math.sin(x * 1.7 + z * .31) * .035 + Math.cos(z * 2.2 - x * .47) * .025;
    const groundGeo = new THREE.PlaneGeometry(180, 260, 180, 260);
    groundGeo.rotateX(-Math.PI / 2);
    const groundPos = groundGeo.attributes.position;
    const groundColors = [];
    const groundColor = new THREE.Color();
    for (let i = 0; i < groundPos.count; i++) {
      const x = groundPos.getX(i), z = groundPos.getZ(i);
      groundPos.setY(i, terrainHeightAt(x, z));
      const path = Math.exp(-Math.pow(x / 2.2, 2));
      groundColor.set('#777b65').lerp(new THREE.Color('#987f5b'), path * .62);
      groundColor.multiplyScalar(.92 + (Math.sin(x * 11 + z * 8) * .5 + .5) * .08);
      groundColors.push(groundColor.r, groundColor.g, groundColor.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
    groundGeo.computeVertexNormals();
    const groundMaps = new THREE.TextureLoader();
    const groundDiffuse = groundMaps.load('/assets/hunt/forest-ground/forest-ground-diffuse-2k.jpg');
    const groundNormal = groundMaps.load('/assets/hunt/forest-ground/forest-ground-normal-2k.jpg');
    const groundRoughness = groundMaps.load('/assets/hunt/forest-ground/forest-ground-roughness-2k.jpg');
    groundDiffuse.colorSpace = THREE.SRGBColorSpace;
    for (const map of [groundDiffuse, groundNormal, groundRoughness]) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(90, 130);
      map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    }
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: groundDiffuse, normalMap: groundNormal, roughnessMap: groundRoughness, vertexColors: true, roughness: 1, metalness: 0 }));
    ground.receiveShadow = true; world.add(ground);

    const bark = new THREE.MeshStandardMaterial({ color: '#473626', roughness: .96 });
    const barkLight = new THREE.MeshStandardMaterial({ color: '#67513a', roughness: .92 });
    const trunkGeo = new THREE.CylinderGeometry(.17, .34, 1, 9, 3);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, -.5);
    leafShape.bezierCurveTo(-.14, -.28, -.2, .18, 0, .5);
    leafShape.bezierCurveTo(.2, .18, .14, -.28, 0, -.5);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 10);
    const leafCanvas = document.createElement('canvas'); leafCanvas.width = 128; leafCanvas.height = 256;
    const leafCtx = leafCanvas.getContext('2d');
    const leafGradient = leafCtx.createLinearGradient(18, 0, 108, 256);
    leafGradient.addColorStop(0, '#9eaa62'); leafGradient.addColorStop(.45, '#526b38'); leafGradient.addColorStop(1, '#263c2a');
    leafCtx.fillStyle = leafGradient; leafCtx.beginPath(); leafCtx.moveTo(64, 0);
    leafCtx.bezierCurveTo(18, 42, 12, 190, 64, 256); leafCtx.bezierCurveTo(116, 190, 110, 42, 64, 0); leafCtx.fill();
    leafCtx.strokeStyle = 'rgba(209,211,139,.8)'; leafCtx.lineWidth = 2; leafCtx.beginPath(); leafCtx.moveTo(64, 8); leafCtx.lineTo(64, 246); leafCtx.stroke();
    leafCtx.strokeStyle = 'rgba(210,216,151,.38)'; leafCtx.lineWidth = 1;
    for (let y = 45; y < 225; y += 25) { leafCtx.beginPath(); leafCtx.moveTo(64, y); leafCtx.lineTo(28, y - 13); leafCtx.moveTo(64, y); leafCtx.lineTo(100, y - 13); leafCtx.stroke(); }
    const leafTexture = new THREE.CanvasTexture(leafCanvas); leafTexture.colorSpace = THREE.SRGBColorSpace;
    const leafMaterial = new THREE.MeshStandardMaterial({ map: leafTexture, alphaTest: .35, side: THREE.DoubleSide, roughness: .88, metalness: 0 });
    leafMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = { value: 0 };
      leafMaterial.userData.windUniform = shader.uniforms.uWindTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindTime;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat windPhase = uWindTime * 1.25 + instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.11;\ntransformed.x += sin(windPhase + position.y * 3.0) * 0.055 * (position.y + 0.5);\ntransformed.z += cos(windPhase * 0.73 + position.y * 2.0) * 0.025 * (position.y + 0.5);');
    };
    const rockMats = ['#535349', '#625c4c', '#474a40'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .98 }));
    let seed = 9817;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const treeCount = 320;
    const treeTrunks = [bark, barkLight].map((material) => new THREE.InstancedMesh(trunkGeo, material, treeCount));
    treeTrunks.forEach((mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); });
    const branchGeo = new THREE.CylinderGeometry(.035, .11, 1, 8, 2);
    const branches = new THREE.InstancedMesh(branchGeo, barkLight, treeCount * 4);
    branches.castShadow = true; branches.receiveShadow = true; world.add(branches);
    const trunkCounts = [0, 0];
    let branchCount = 0;
    const leavesPerTree = 160;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMaterial, treeCount * leavesPerTree);
    leaves.castShadow = true; leaves.receiveShadow = true; world.add(leaves);
    let leafCount = 0;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 18 - random() * 230;
      const x = side * (7 + random() * 43);
      const height = 5.8 + random() * 7.6;
      const baseY = terrainHeightAt(x, z);
      const trunkIndex = random() > .45 ? 0 : 1;
      // CylinderGeometry is centered and one unit tall: scale by 0.78h and lift by half of it.
      const trunkScaleY = height * .78;
      dummy.position.set(x, baseY + trunkScaleY * .5, z); dummy.rotation.set(.02, random() * Math.PI * 2, 0); dummy.scale.set(.78 + random() * .7, trunkScaleY, .78 + random() * .7); dummy.updateMatrix();
      treeTrunks[trunkIndex].setMatrixAt(trunkCounts[trunkIndex]++, dummy.matrix);
      for (let branch = 0; branch < 4; branch++) {
        const angle = random() * Math.PI * 2;
        const length = height * (.2 + random() * .1);
        const direction = new THREE.Vector3(Math.cos(angle), .68 + random() * .32, Math.sin(angle)).normalize();
        dummy.position.set(x + direction.x * length * .42, baseY + height * (.34 + branch * .075), z + direction.z * length * .42);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        dummy.scale.set(.75, length, .75); dummy.updateMatrix();
        branches.setMatrixAt(branchCount++, dummy.matrix);
      }
      for (let j = 0; j < leavesPerTree; j++) {
        const vertical = random() * 2 - 1;
        const radial = Math.sqrt(1 - vertical * vertical) * (.55 + random() * .45);
        const angle = random() * Math.PI * 2;
        dummy.position.set(x + Math.cos(angle) * radial * height * .34, baseY + height * (.73 + vertical * .25), z + Math.sin(angle) * radial * height * .3);
        dummy.rotation.set((random() - .5) * 1.3, random() * Math.PI * 2, (random() - .5) * 1.1);
        const size = .62 + random() * .7;
        dummy.scale.set(size, size * (1.15 + random() * .6), size * .18); dummy.updateMatrix();
        leaves.setMatrixAt(leafCount, dummy.matrix);
        leaves.setColorAt(leafCount, new THREE.Color().setHSL(.22 + random() * .08, .28 + random() * .22, .22 + random() * .2));
        leafCount++;
      }
    }
    treeTrunks.forEach((mesh, i) => { mesh.count = trunkCounts[i]; mesh.instanceMatrix.needsUpdate = true; });
    branches.count = branchCount; branches.instanceMatrix.needsUpdate = true;
    leaves.count = leafCount; leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    const rockGeo = new THREE.IcosahedronGeometry(.56, 2);
    const rockPositions = rockGeo.attributes.position;
    for (let i = 0; i < rockPositions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(rockPositions, i);
      const n = point.clone().normalize();
      const roughness = Math.sin(n.x * 13 + n.y * 7) * Math.cos(n.z * 11 - n.x * 5) * .11;
      point.multiplyScalar(1 + roughness);
      rockPositions.setXYZ(i, point.x, point.y, point.z);
    }
    rockGeo.computeVertexNormals();
    const rockCount = 560;
    const rockMeshes = rockMats.map((material) => new THREE.InstancedMesh(rockGeo, material, rockCount));
    const rockCounts = [0, 0, 0];
    for (let i = 0; i < rockCount; i++) {
      const side = random() > .5 ? 1 : -1, z = 18 - random() * 245;
      const x = side * (1.3 + random() * 3.5);
      const materialIndex = Math.floor(random() * rockMeshes.length);
      dummy.scale.set(.3 + random() * 1.05, .35 + random() * .85, .3 + random() * 1.05); dummy.position.set(x, terrainHeightAt(x, z) + dummy.scale.y * .53, z); dummy.rotation.set(random(), random() * 5, random()); dummy.updateMatrix();
      rockMeshes[materialIndex].setMatrixAt(rockCounts[materialIndex]++, dummy.matrix);
    }
    rockMeshes.forEach((mesh, i) => { mesh.count = rockCounts[i]; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; world.add(mesh); });
    const fernMat = new THREE.MeshStandardMaterial({ color: '#40533a', roughness: .88, side: THREE.DoubleSide });
    const fernGeo = new THREE.ConeGeometry(.15, .95, 5, 1);
    const fernCount = 650;
    const fernMesh = new THREE.InstancedMesh(fernGeo, fernMat, fernCount);
    for (let i = 0; i < fernCount; i++) {
      const side = random() > .5 ? 1 : -1, x = side * (2.2 + random() * 3.8), z = 18 - random() * 230;
      dummy.scale.set(.55 + random() * .9, .4 + random() * .65, .55 + random()); dummy.position.set(x, terrainHeightAt(x, z) + .475 * dummy.scale.y, z); dummy.rotation.set(0, random() * Math.PI, (random() - .5) * .45); dummy.updateMatrix(); fernMesh.setMatrixAt(i, dummy.matrix);
    }
    fernMesh.castShadow = true; fernMesh.instanceMatrix.needsUpdate = true; world.add(fernMesh);

    const hunterRoot = new THREE.Group();
    scene.add(hunterRoot);
    const characters = [];
    function profileColor(profile, index) {
      const colors = ['#8e4936', '#586c42', '#526d82', '#81643b', '#645477'];
      let hash = index * 13;
      for (const char of String(profile?.profession || '') + String(profile?.industry || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      return colors[hash % colors.length];
    }
    const loader = new GLTFLoader();
    let hunterAsset = null, hunterAnimations = [];
    const mixers = [];
    function setCharacters(players, currentId) {
      characters.splice(0).forEach((group) => { hunterRoot.remove(group); });
      mixers.splice(0);
      const party = [...(players || [])].slice(0, 2).sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
      party.forEach((profile, index) => {
        const wrapper = new THREE.Group();
        wrapper.position.set(index ? -1.28 : 0, 0, index ? 4.7 : 3.25);
        wrapper.rotation.y = Math.PI;
        const accent = profileColor(profile, index);
        if (hunterAsset) {
          const model = cloneSkinned(hunterAsset);
          fitModel(model, 1.77);
          model.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; if (object.material) object.material.side = THREE.FrontSide; } });
          wrapper.add(model);
          if (hunterAnimations.length) {
            const mixer = new THREE.AnimationMixer(model); mixers.push(mixer);
            const walk = hunterAnimations.find((clip) => /brisk|walk|run/i.test(clip.name));
            const idle = hunterAnimations.find((clip) => /idle/i.test(clip.name));
            wrapper.userData.idleAction = mixer.clipAction(idle || walk || hunterAnimations[0]);
            wrapper.userData.idleAction.play();
            wrapper.userData.walkAction = walk ? mixer.clipAction(walk) : null;
          }
        } else {
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .78, 5, 12), new THREE.MeshStandardMaterial({ color: accent, roughness: .72 }));
          body.position.y = .92; body.castShadow = true; wrapper.add(body);
          const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 24, 18), new THREE.MeshStandardMaterial({ color: '#c38e6a', roughness: .82 })); head.position.y = 1.58; head.castShadow = true; wrapper.add(head);
        }
        hunterRoot.add(wrapper); wrapper.userData.profile = profile; wrapper.userData.index = index; characters.push(wrapper);
      });
    }
    function fitModel(model, height) {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const factor = height / Math.max(size.y, .01);
      model.scale.multiplyScalar(factor);
      model.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(model);
      model.position.y -= fitted.min.y;
    }
    let loadedAssetCount = 0;
    const finishAssetLoad = () => { if (++loadedAssetCount >= 2) { const loading = document.querySelector('#battle-loading'); if (loading) loading.hidden = true; } };
    loader.load('/assets/hunt/hunter-animated.glb', (gltf) => {
      hunterAsset = gltf.scene; hunterAnimations = gltf.animations || [];
      setCharacters(window.__huntParty || [], window.__huntCurrentId);
      finishAssetLoad();
    }, undefined, (error) => { console.warn('Hunter model unavailable; using fallback:', error); finishAssetLoad(); });

    const monsterRoot = new THREE.Group(); scene.add(monsterRoot);
    const monsterFallback = new THREE.Group(); monsterFallback.visible = false; monsterRoot.add(monsterFallback);
    const goldMaterial = new THREE.MeshStandardMaterial({ color: '#bd8b46', roughness: .37, metalness: .68 });
    const attackSlashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0a1', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const attackSlash = new THREE.Mesh(new THREE.TorusGeometry(1.45, .045, 8, 48), attackSlashMaterial);
    attackSlash.visible = false; scene.add(attackSlash);
    const monsterRig = { body: null, paws: [], tail: null };
    let monsterForwardReach = 1.8, approachOffset = 0, enemyTargetCursor = 0, enemyAttackTarget = null, gameOver = false;
    const enemyImpactPoint = new THREE.Vector3();
    let fallbackBody = null, fallbackHead = null;
    function makeFallbackMonster(type) {
      monsterFallback.clear();
      monsterFallback.rotation.set(0, 0, 0); monsterFallback.scale.setScalar(1);
      fallbackBody = null; fallbackHead = null;
      const bodyMat = new THREE.MeshStandardMaterial({ color: type === 'golem' ? '#625e52' : type === 'goblin' ? '#718044' : type === 'slime' ? '#58a887' : '#7d7355', roughness: type === 'slime' ? .22 : .78, metalness: type === 'slime' ? .08 : .12, transparent: type === 'slime', opacity: type === 'slime' ? .92 : 1 });
      const body = new THREE.Mesh(type === 'slime' ? new THREE.SphereGeometry(1, 36, 28) : new THREE.IcosahedronGeometry(type === 'golem' ? 1.45 : type === 'goblin' ? .72 : 1.25, 3), bodyMat);
      body.position.y = type === 'slime' ? .95 : type === 'goblin' ? 1.1 : 1.45;
      body.scale.set(type === 'goblin' ? .82 : 1.38, type === 'slime' ? 1.05 : .85, type === 'goblin' ? .78 : .95); body.castShadow = true; body.receiveShadow = true; monsterFallback.add(body);
      fallbackBody = { object: body, scale: body.scale.clone(), position: body.position.clone() };
      if (type === 'slime') {
        const eyeMat = new THREE.MeshStandardMaterial({ color: '#101912', roughness: .2 });
        for (const side of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), eyeMat); eye.position.set(side * .3, 1.15, .87); monsterFallback.add(eye); }
        monsterFallback.scale.setScalar(.88);
        return;
      }
      if (type === 'goblin') {
        const head = new THREE.Mesh(new THREE.SphereGeometry(.39, 28, 20), bodyMat); head.position.set(-.58, 1.8, .08); head.castShadow = true; monsterFallback.add(head);
        fallbackHead = { object: head, position: head.position.clone(), rotation: head.rotation.clone() };
        for (const side of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(.17, .72, 12), bodyMat); ear.position.set(-.58 + side * .42, 1.92, .03); ear.rotation.z = side * -.72; ear.castShadow = true; monsterFallback.add(ear); }
        return;
      }
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .76, 4, 10), bodyMat); leg.position.set(side * .82, .62, .1); leg.rotation.z = side * -.17; leg.castShadow = true; monsterFallback.add(leg);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(.24, 1.05, 12), goldMaterial); horn.position.set(side * .48, 2.55, .02); horn.rotation.z = side * -.52; horn.castShadow = true; monsterFallback.add(horn);
      }
      for (let i = 0; i < 7; i++) {
        const scale = .28 + (i % 3) * .07;
        const plate = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? '#536047' : '#7a8061', roughness: .95 }));
        plate.position.set(-.9 + i * .3, 2.2 + (i % 2) * .17, -.28); plate.castShadow = true; monsterFallback.add(plate);
      }
    }
    makeFallbackMonster('greatbeast');
    let activeMonster = null, monsterType = 'greatbeast', monsterDefeated = false;
    let monsterBaseZ = -3.7;
    loader.load('/assets/hunt/crescent-horn-kaiju.glb', (gltf) => {
      activeMonster = gltf.scene; fitModel(activeMonster, 4.5);
      // This GLB faces +X; turn its nose toward the hunters (+Z) so a forward
      // lunge doesn't read as a sideways strafe.
      activeMonster.rotation.y = -Math.PI / 2;
      activeMonster.updateMatrixWorld(true);
      const monsterBounds = new THREE.Box3().setFromObject(activeMonster);
      monsterForwardReach = THREE.MathUtils.clamp(monsterBounds.max.z, 1.2, 3.2);
      activeMonster.userData.motionScale = 1 / Math.max(activeMonster.scale.x, .01);
      activeMonster.traverse((object) => {
        if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
        const name = object.name.toLowerCase();
        if (name.includes('continuous anatomical skin')) monsterRig.body = { object, base: object.position.clone(), rotation: object.rotation.clone() };
        if (name.includes('rounded paw')) monsterRig.paws.push({ object, base: object.position.clone(), rotation: object.rotation.clone(), side: monsterRig.paws.length });
        if (name.includes('paddle tail')) monsterRig.tail = { object, base: object.position.clone(), rotation: object.rotation.clone() };
      });
      monsterRoot.add(activeMonster); activeMonster.visible = monsterType === 'greatbeast'; monsterFallback.visible = !activeMonster.visible;
      positionMonster();
      finishAssetLoad();
    }, undefined, (error) => { console.warn('Creature model unavailable; using fallback:', error); finishAssetLoad(); });
    function positionMonster() {
      monsterBaseZ = -3.7 + (journeyMode && !encountered ? -Math.max(0, 5 - journeySteps) * 2.3 : 0);
      approachOffset = 0;
      monsterRoot.position.set(0, 0, monsterBaseZ);
    }

    const glow = new THREE.PointLight('#e29c48', 18, 19, 2);
    glow.position.set(-4, 6.5, -12); scene.add(glow);
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 300, dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) { dustPositions[i * 3] = (random() - .5) * 34; dustPositions[i * 3 + 1] = random() * 9 + .3; dustPositions[i * 3 + 2] = 13 - random() * 38; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#d8c69b', size: .04, transparent: true, opacity: .48, sizeAttenuation: true })); scene.add(dust);

    let journeyMode = false, encountered = true, journeySteps = 0;
    let enemyAttackStart = -1, nextEnemyAttackAt = 2.4, enemyAttackSent = false;
    const enemyAttackDuration = 2.15;
    let moving = false, moveX = 0, moveZ = 0;
    const keyState = new Set();
    let yaw = 0, cameraDistance = 8.6, pointer = null;
    const keysForMovement = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
    const movementKey = (event) => event.code.startsWith('Arrow') ? event.code.toLowerCase() : event.code.slice(-1).toLowerCase();
    window.addEventListener('keydown', (event) => {
      if (!document.body.classList.contains('in-hunt') || !keysForMovement.has(event.code)) return;
      event.preventDefault(); keyState.add(movementKey(event)); moving = true;
    }, true);
    window.addEventListener('keyup', (event) => { keyState.delete(movementKey(event)); moving = keyState.size > 0; }, true);
    window.addEventListener('blur', () => { keyState.clear(); moving = false; });
    canvas.addEventListener('pointerdown', (event) => { pointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointer) return;
      yaw -= (event.clientX - pointer.x) * .004;
      pointer = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', () => { pointer = null; });
    canvas.addEventListener('wheel', (event) => { cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * .008, 5, 13); }, { passive: true });

    const desiredCamera = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    const clock = new THREE.Clock();
    let renderWidth = 0, renderHeight = 0;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const width = Math.round(rect.width * renderer.getPixelRatio()), height = Math.round(rect.height * renderer.getPixelRatio());
      if (width !== renderWidth || height !== renderHeight) {
        renderer.setSize(rect.width, rect.height, false);
        composer.setSize(rect.width, rect.height);
        renderWidth = width; renderHeight = height;
      }
      camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); return true;
    }
    function animate() {
      requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), .04), elapsed = clock.elapsedTime;
      if (!monsterDefeated && document.body.classList.contains('in-hunt') && enemyAttackStart < 0 && elapsed >= nextEnemyAttackAt) {
        enemyAttackStart = elapsed;
        enemyAttackSent = false;
        nextEnemyAttackAt = elapsed + 3.2 + random() * 1.2;
      }
      let enemyLunge = 0, enemyShake = 0;
      if (enemyAttackStart >= 0) {
        const attackProgress = (elapsed - enemyAttackStart) / enemyAttackDuration;
        if (attackProgress >= 1) enemyAttackStart = -1;
        else {
          const smooth = (value) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
          enemyLunge = smooth((attackProgress - .19) / .34) * (1 - smooth((attackProgress - .61) / .37));
          enemyShake = smooth((attackProgress - .49) / .05) * (1 - smooth((attackProgress - .66) / .14)) * .12;
        }
      }
      if (leafMaterial.userData.windUniform) leafMaterial.userData.windUniform.value = elapsed;
      if (moving && characters.length) {
        const step = 4.1 * delta;
        const forward = Number(keyState.has('arrowup') || keyState.has('w')) - Number(keyState.has('arrowdown') || keyState.has('s'));
        const side = Number(keyState.has('arrowright') || keyState.has('d')) - Number(keyState.has('arrowleft') || keyState.has('a'));
        // Move in the camera's ground-plane directions: up is always toward the view center.
        const moveDX = side * Math.cos(yaw) - forward * Math.sin(yaw);
        const moveDZ = -side * Math.sin(yaw) - forward * Math.cos(yaw);
        const moveLength = Math.hypot(moveDX, moveDZ) || 1;
        moveX = THREE.MathUtils.clamp(moveX + moveDX / moveLength * step, -18, 18);
        moveZ = THREE.MathUtils.clamp(moveZ + moveDZ / moveLength * step, -220, 6);
        characters[0].position.x = moveX;
        characters[0].position.z = 3.25 + moveZ;
        characters[0].rotation.y = Math.atan2(moveDX, moveDZ);
        if (characters[0].userData.walkAction) {
          characters[0].userData.idleAction?.stop();
          characters[0].userData.walkAction.play();
          characters[0].userData.walkAction.setEffectiveTimeScale(1.05);
        }
      } else if (characters[0]?.userData.walkAction) {
        characters[0].userData.walkAction.stop();
        characters[0].userData.idleAction?.play();
      }
      if (characters[1]) { characters[1].position.x = -1.28 + Math.sin(elapsed * .7) * .16; characters[1].position.z = 4.7 + Math.sin(elapsed * 1.9) * .025; }
      mixers.forEach((mixer) => mixer.update(delta));
      if (monsterDefeated) {
        monsterRoot.position.set(0, -.7, monsterBaseZ);
        monsterRoot.rotation.set(0, 0, 0);
        attackSlash.visible = false;
      } else {
        // Keep its feet planted and animate the body parts; use a deliberate forward lunge for attacks.
        const windup = enemyAttackStart < 0 ? 0 : Math.max(0, 1 - Math.abs((elapsed - enemyAttackStart) / enemyAttackDuration - .25) * 5);
        const attackDistance = THREE.MathUtils.clamp(3.25 + moveZ - monsterBaseZ - 1.2, 2, 9);
        const monsterZ = monsterBaseZ + Math.sin(elapsed * .46) * .04 + enemyLunge * attackDistance;
        const leap = enemyLunge * (1 - enemyLunge) * 4;
        monsterRoot.position.set(0, Math.sin(elapsed * 1.35) * .045 - windup * .18 + leap * .34, monsterZ);
        monsterRoot.rotation.set(windup * .09 - leap * .1, 0, 0);
        if (monsterRig.body) {
          const { object, base, rotation } = monsterRig.body;
          const motionScale = activeMonster?.userData.motionScale || 1;
          object.position.y = base.y + (Math.sin(elapsed * 1.35) * .06 - windup * .1) * motionScale;
          object.userData.baseBreathScale ??= object.scale.y;
          object.scale.y = object.userData.baseBreathScale * (1 + Math.sin(elapsed * 1.35) * .018);
          object.rotation.x = rotation.x + windup * .06;
        }
        monsterRig.paws.forEach(({ object, base, rotation, side }) => {
          const stride = Math.sin(elapsed * 2.4 + side * Math.PI);
          const motionScale = activeMonster?.userData.motionScale || 1;
          object.position.set(base.x, base.y + (Math.max(0, stride) * .22 + enemyLunge * .14) * motionScale, base.z);
          object.rotation.copy(rotation);
        });
        if (monsterRig.tail) {
          const { object, base, rotation } = monsterRig.tail;
          object.rotation.x = rotation.x + Math.sin(elapsed * .9) * .12;
        }
        if (monsterFallback.visible) {
          if (fallbackBody) {
            const { object, scale, position } = fallbackBody;
            object.scale.y = scale.y * (1 + Math.sin(elapsed * 1.8) * .035);
            object.position.y = position.y + Math.sin(elapsed * 1.8) * .025;
          }
          if (fallbackHead) {
            fallbackHead.object.position.y = fallbackHead.position.y + Math.sin(elapsed * 1.1) * .035;
          }
        }
        const strikeProgress = enemyAttackStart < 0 ? -1 : (elapsed - enemyAttackStart) / enemyAttackDuration;
        if (strikeProgress >= .53 && !enemyAttackSent) {
          enemyAttackSent = true;
          window.dispatchEvent(new CustomEvent('lifequest:enemy-strike'));
        }
        attackSlash.visible = strikeProgress > .48 && strikeProgress < .69;
        if (attackSlash.visible) {
          const slashPower = Math.sin(((strikeProgress - .48) / .21) * Math.PI);
          attackSlash.position.set(moveX, 1.45, 3.25 + moveZ - .8);
          attackSlash.rotation.set(0, 0, -Math.PI * .22 + (strikeProgress - .48) * 2.6);
          attackSlash.scale.setScalar(.75 + slashPower * .45);
          attackSlashMaterial.opacity = slashPower * .9;
        } else attackSlashMaterial.opacity = 0;
      }
      dust.rotation.y = elapsed * .012;
      const chaseX = moveX, chaseZ = 3.25 + moveZ;
      const walkBob = moving ? Math.abs(Math.sin(elapsed * 8.2)) * .075 : Math.sin(elapsed * .75) * .012;
      desiredCamera.set(chaseX + Math.sin(yaw) * cameraDistance, 3.35 + cameraDistance * .12 + walkBob + Math.abs(enemyShake) * .3, chaseZ + Math.cos(yaw) * cameraDistance);
      desiredLook.set(chaseX * .35, 1.25 + walkBob * .42, -2.1 + chaseZ * .17);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 3.1)); camera.lookAt(desiredLook);
      sun.position.set(-9 + moveX * .15, 15, 8 + moveZ * .15); sun.target.position.set(moveX, 0, -3); sun.target.updateMatrixWorld();
      if (resize()) composer.render();
    }
    setCharacters([], undefined);
    animate();

    window.battle3D = {
      available: true,
      setMonster(type, isDefeated = false) { monsterType = type || 'greatbeast'; monsterDefeated = !!isDefeated; enemyAttackStart = -1; nextEnemyAttackAt = clock.elapsedTime + 1.8; makeFallbackMonster(monsterType); if (activeMonster) activeMonster.visible = monsterType === 'greatbeast'; monsterFallback.visible = !activeMonster || monsterType !== 'greatbeast'; positionMonster(); },
      setParty(players, currentId) { window.__huntParty = players || []; window.__huntCurrentId = currentId; setCharacters(window.__huntParty, currentId); },
      setJourney(steps, met, x = moveX, z = moveZ) { const next = Number(steps) || 0; if (next !== journeySteps) journeySteps = next; journeyMode = !met; encountered = !!met; moveX = Number(x) || 0; moveZ = Number(z) || 0; positionMonster(); },
      travel() { moving = true; window.setTimeout(() => { moving = false; }, 450); },
      attack() { monsterDefeated = false; },
    };
  }
}
