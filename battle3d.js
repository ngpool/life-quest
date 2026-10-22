import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#a4afa2');
    scene.fog = new THREE.FogExp2('#a4afa2', 0.027);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 180);
    const hemi = new THREE.HemisphereLight('#dce8e0', '#27281e', 1.45);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe0ad', 3.1);
    sun.position.set(-9, 15, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -19; sun.shadow.camera.right = 19;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    const world = new THREE.Group(); scene.add(world);
    const groundGeo = new THREE.PlaneGeometry(90, 100, 100, 110);
    groundGeo.rotateX(-Math.PI / 2);
    const groundPos = groundGeo.attributes.position;
    const groundColors = [];
    const groundColor = new THREE.Color();
    for (let i = 0; i < groundPos.count; i++) {
      const x = groundPos.getX(i), z = groundPos.getZ(i);
      const ridge = Math.sin(x * .23 + z * .09) * .24 + Math.cos(z * .3) * .19;
      const noise = Math.sin(x * 1.7 + z * .31) * .035 + Math.cos(z * 2.2 - x * .47) * .025;
      groundPos.setY(i, ridge + noise);
      const path = Math.exp(-Math.pow(x / 2.2, 2));
      groundColor.set('#34402d').lerp(new THREE.Color('#60513a'), path * .76);
      groundColor.multiplyScalar(.83 + (Math.sin(x * 11 + z * 8) * .5 + .5) * .18);
      groundColors.push(groundColor.r, groundColor.g, groundColor.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    ground.receiveShadow = true; world.add(ground);

    const bark = new THREE.MeshStandardMaterial({ color: '#473626', roughness: .96 });
    const barkLight = new THREE.MeshStandardMaterial({ color: '#67513a', roughness: .92 });
    const leafMats = ['#243729', '#304632', '#3e5137', '#526141'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .92, flatShading: false }));
    const trunkGeo = new THREE.CylinderGeometry(.17, .34, 1, 9, 3);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 2);
    const rockMats = ['#535349', '#625c4c', '#474a40'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .98 }));
    let seed = 9817;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const treeTrunks = [bark, barkLight].map((material) => new THREE.InstancedMesh(trunkGeo, material, 94));
    treeTrunks.forEach((mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); });
    const trunkCounts = [0, 0];
    const canopyMeshes = leafMats.map((material) => new THREE.InstancedMesh(canopyGeo, material, 94 * 6));
    canopyMeshes.forEach((mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); });
    const treeCounts = [0, 0, 0, 0];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 94; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 13 - random() * 69;
      const x = side * (5.3 + random() * 20);
      const height = 5.8 + random() * 7.6;
      const trunkIndex = random() > .45 ? 0 : 1;
      dummy.position.set(x, height * .39, z); dummy.rotation.set(.02, random() * Math.PI * 2, 0); dummy.scale.set(.78 + random() * .7, height * .39, .78 + random() * .7); dummy.updateMatrix();
      treeTrunks[trunkIndex].setMatrixAt(trunkCounts[trunkIndex]++, dummy.matrix);
      for (let j = 0; j < 6; j++) {
        const canopyIndex = Math.floor(random() * canopyMeshes.length);
        const level = j / 5;
        dummy.position.set(x + (random() - .5) * height * .29, height * (.48 + level * .55), z + (random() - .5) * height * .24);
        const size = height * (.22 - level * .105) * (.78 + random() * .45);
        dummy.scale.set(size * (1.1 + random() * .45), size * (.78 + random() * .32), size * (1.05 + random() * .4));
        dummy.rotation.set(random() * .3, random() * 6, random() * .3); dummy.updateMatrix();
        canopyMeshes[canopyIndex].setMatrixAt(treeCounts[canopyIndex]++, dummy.matrix);
      }
    }
    treeTrunks.forEach((mesh, i) => { mesh.count = trunkCounts[i]; mesh.instanceMatrix.needsUpdate = true; });
    canopyMeshes.forEach((mesh, i) => { mesh.count = treeCounts[i]; mesh.instanceMatrix.needsUpdate = true; });
    const rockGeo = new THREE.DodecahedronGeometry(.56, 0);
    const rockMeshes = rockMats.map((material) => new THREE.InstancedMesh(rockGeo, material, 230));
    const rockCounts = [0, 0, 0];
    for (let i = 0; i < 230; i++) {
      const side = random() > .5 ? 1 : -1, z = 15 - random() * 75;
      const x = side * (1.3 + random() * 3.5);
      const materialIndex = Math.floor(random() * rockMeshes.length);
      dummy.position.set(x, -.02, z); dummy.scale.set(.3 + random() * 1.05, .35 + random() * .85, .3 + random() * 1.05); dummy.rotation.set(random(), random() * 5, random()); dummy.updateMatrix();
      rockMeshes[materialIndex].setMatrixAt(rockCounts[materialIndex]++, dummy.matrix);
    }
    rockMeshes.forEach((mesh, i) => { mesh.count = rockCounts[i]; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; world.add(mesh); });
    const fernMat = new THREE.MeshStandardMaterial({ color: '#40533a', roughness: .88, side: THREE.DoubleSide });
    const fernGeo = new THREE.ConeGeometry(.15, .95, 5, 1);
    const fernMesh = new THREE.InstancedMesh(fernGeo, fernMat, 270);
    for (let i = 0; i < 270; i++) {
      const side = random() > .5 ? 1 : -1, x = side * (2.2 + random() * 3.8), z = 12 - random() * 53;
      dummy.position.set(x, .42, z); dummy.rotation.set(0, random() * Math.PI, (random() - .5) * .45); dummy.scale.set(.55 + random() * .9, .4 + random() * .65, .55 + random()); dummy.updateMatrix(); fernMesh.setMatrixAt(i, dummy.matrix);
    }
    fernMesh.castShadow = true; fernMesh.instanceMatrix.needsUpdate = true; world.add(fernMesh);

    const hunterMaterial = new THREE.MeshStandardMaterial({ color: '#8b6845', roughness: .72, metalness: .16 });
    const leatherMaterial = new THREE.MeshStandardMaterial({ color: '#33251c', roughness: .86 });
    const steelMaterial = new THREE.MeshStandardMaterial({ color: '#87928e', roughness: .29, metalness: .78 });
    const goldMaterial = new THREE.MeshStandardMaterial({ color: '#bd8b46', roughness: .37, metalness: .68 });
    const hunterRoot = new THREE.Group();
    scene.add(hunterRoot);
    const characters = [];
    const armorGeometry = new THREE.SphereGeometry(1, 24, 18);
    function addArmor(character, accent) {
      const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: .48, metalness: .38 });
      const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), hunterMaterial);
      chest.position.set(0, 1.13, .02); chest.scale.set(.38, .33, .25); chest.castShadow = true; character.add(chest);
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(armorGeometry, accentMat); pauldron.position.set(side * .38, 1.42, 0); pauldron.scale.set(.24, .15, .3); pauldron.castShadow = true; character.add(pauldron);
        const bracer = new THREE.Mesh(new THREE.CylinderGeometry(.095, .14, .43, 12), steelMaterial); bracer.position.set(side * .4, .91, .03); bracer.rotation.z = side * -.16; bracer.castShadow = true; character.add(bracer);
      }
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(.26, .28, .13, 18), leatherMaterial); belt.position.y = .87; belt.castShadow = true; character.add(belt);
      const sword = new THREE.Group(); sword.position.set(.48, .83, .08); sword.rotation.z = -.28;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(.075, .9, .035), steelMaterial); blade.position.y = .51; blade.castShadow = true; sword.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(.34, .075, .12), goldMaterial); guard.position.y = .12; sword.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .32, 10), leatherMaterial); grip.position.y = -.08; sword.add(grip); character.add(sword);
      const cape = new THREE.Mesh(new THREE.BoxGeometry(.58, .78, .055), new THREE.MeshStandardMaterial({ color: accent, roughness: .94, side: THREE.DoubleSide }));
      cape.position.set(0, .88, -.24); cape.rotation.x = -.14; character.add(cape);
    }
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
        addArmor(wrapper, accent);
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
    function makeFallbackMonster(type) {
      monsterFallback.clear();
      const bodyMat = new THREE.MeshStandardMaterial({ color: type === 'golem' ? '#625e52' : type === 'goblin' ? '#718044' : type === 'slime' ? '#58a887' : '#7d7355', roughness: type === 'slime' ? .22 : .78, metalness: type === 'slime' ? .08 : .12, transparent: type === 'slime', opacity: type === 'slime' ? .92 : 1 });
      const body = new THREE.Mesh(type === 'slime' ? new THREE.SphereGeometry(1, 36, 28) : new THREE.IcosahedronGeometry(type === 'golem' ? 1.45 : type === 'goblin' ? .72 : 1.25, 3), bodyMat);
      body.position.y = type === 'slime' ? .95 : type === 'goblin' ? 1.1 : 1.45;
      body.scale.set(type === 'goblin' ? .82 : 1.38, type === 'slime' ? 1.05 : .85, type === 'goblin' ? .78 : .95); body.castShadow = true; body.receiveShadow = true; monsterFallback.add(body);
      if (type === 'slime') {
        const eyeMat = new THREE.MeshStandardMaterial({ color: '#101912', roughness: .2 });
        for (const side of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), eyeMat); eye.position.set(side * .3, 1.15, .87); monsterFallback.add(eye); }
        monsterFallback.scale.setScalar(.88);
        return;
      }
      if (type === 'goblin') {
        const head = new THREE.Mesh(new THREE.SphereGeometry(.39, 28, 20), bodyMat); head.position.set(-.58, 1.8, .08); head.castShadow = true; monsterFallback.add(head);
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
    loader.load('/assets/hunt/crescent-horn-kaiju.glb', (gltf) => {
      activeMonster = gltf.scene; fitModel(activeMonster, 4.5);
      activeMonster.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
      monsterRoot.add(activeMonster); activeMonster.visible = monsterType === 'greatbeast'; monsterFallback.visible = !activeMonster.visible;
      positionMonster();
      finishAssetLoad();
    }, undefined, (error) => { console.warn('Creature model unavailable; using fallback:', error); finishAssetLoad(); });
    function positionMonster() {
      monsterRoot.position.set(0, 0, -3.7 + (journeyMode && !encountered ? -Math.max(0, 5 - journeySteps) * 2.3 : 0));
      monsterRoot.rotation.y = Math.PI + Math.sin(performance.now() * .00023) * .035;
    }

    const glow = new THREE.PointLight('#e29c48', 18, 19, 2);
    glow.position.set(-4, 6.5, -12); scene.add(glow);
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 300, dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) { dustPositions[i * 3] = (random() - .5) * 34; dustPositions[i * 3 + 1] = random() * 9 + .3; dustPositions[i * 3 + 2] = 13 - random() * 38; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#d8c69b', size: .04, transparent: true, opacity: .48, sizeAttenuation: true })); scene.add(dust);

    let journeyMode = false, encountered = true, journeySteps = 0;
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
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const width = Math.round(rect.width * renderer.getPixelRatio()), height = Math.round(rect.height * renderer.getPixelRatio());
      if (canvas.width !== width || canvas.height !== height) renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); return true;
    }
    function animate() {
      requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), .04), elapsed = clock.elapsedTime;
      if (moving && characters.length) {
        const step = 4.1 * delta;
        const forward = Number(keyState.has('arrowup') || keyState.has('w')) - Number(keyState.has('arrowdown') || keyState.has('s'));
        const side = Number(keyState.has('arrowright') || keyState.has('d')) - Number(keyState.has('arrowleft') || keyState.has('a'));
        moveZ = THREE.MathUtils.clamp(moveZ + forward * step, -7, 4.5);
        moveX = THREE.MathUtils.clamp(moveX + side * step, -3.2, 3.2);
        characters[0].position.x = moveX;
        characters[0].position.z = 3.25 + moveZ;
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
      monsterRoot.position.y = monsterDefeated ? -.7 : Math.sin(elapsed * 1.7) * .055;
      monsterRoot.rotation.y = Math.PI + Math.sin(elapsed * .29) * .06;
      dust.rotation.y = elapsed * .012;
      const chaseX = moveX, chaseZ = 3.25 + moveZ;
      desiredCamera.set(chaseX + Math.sin(yaw) * cameraDistance, 3.35 + cameraDistance * .12, chaseZ + Math.cos(yaw) * cameraDistance);
      desiredLook.set(chaseX * .35, 1.25, -2.1 + chaseZ * .17);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 3.1)); camera.lookAt(desiredLook);
      sun.position.set(-9 + moveX * .15, 15, 8 + moveZ * .15); sun.target.position.set(moveX, 0, -3); sun.target.updateMatrixWorld();
      if (resize()) renderer.render(scene, camera);
    }
    setCharacters([], undefined);
    animate();

    window.battle3D = {
      available: true,
      setMonster(type, isDefeated = false) { monsterType = type || 'greatbeast'; monsterDefeated = !!isDefeated; makeFallbackMonster(monsterType); if (activeMonster) activeMonster.visible = monsterType === 'greatbeast'; monsterFallback.visible = !activeMonster || monsterType !== 'greatbeast'; positionMonster(); },
      setParty(players, currentId) { window.__huntParty = players || []; window.__huntCurrentId = currentId; setCharacters(window.__huntParty, currentId); },
      setJourney(steps, met, x = moveX, z = moveZ) { const next = Number(steps) || 0; if (next !== journeySteps) journeySteps = next; journeyMode = !met; encountered = !!met; moveX = Number(x) || 0; moveZ = Number(z) || 0; positionMonster(); },
      travel() { moving = true; window.setTimeout(() => { moving = false; }, 450); },
      attack() { monsterDefeated = false; },
    };
  }
}
