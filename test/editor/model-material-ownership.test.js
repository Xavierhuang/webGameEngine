const assert = require('node:assert/strict');
const test = require('node:test');
const THREE = require('three');

const {
  cloneSceneWithOwnedMaterials,
  mountOwnedMaterialScene,
} = require('../.build/components/editor/modelMaterialOwnership.js');

function meshMaterials(scene) {
  const materials = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) materials.push(object.material);
  });
  return materials;
}

test('each runtime clone owns materials while sharing geometry and textures', () => {
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const texture = new THREE.Texture();
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: '#dc2626', map: texture });
  source.add(
    new THREE.Mesh(geometry, sourceMaterial),
    new THREE.Mesh(geometry, sourceMaterial)
  );

  const first = cloneSceneWithOwnedMaterials(source);
  const second = cloneSceneWithOwnedMaterials(source);
  const [firstMaterialA, firstMaterialB] = meshMaterials(first.scene);
  const [secondMaterialA, secondMaterialB] = meshMaterials(second.scene);
  const [firstMesh] = first.scene.children;

  assert.notEqual(firstMaterialA, sourceMaterial);
  assert.notEqual(secondMaterialA, sourceMaterial);
  assert.notEqual(firstMaterialA, secondMaterialA);
  assert.equal(firstMaterialA, firstMaterialB);
  assert.equal(secondMaterialA, secondMaterialB);
  assert.equal(firstMesh.geometry, geometry);
  assert.equal(firstMaterialA.map, texture);

  firstMaterialA.color.set('#2563eb');
  assert.equal(sourceMaterial.color.getHexString(), 'dc2626');
  assert.equal(secondMaterialA.color.getHexString(), 'dc2626');
});

test('runtime cleanup disposes only the materials owned by that clone', () => {
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const texture = new THREE.Texture();
  const sourceMaterial = new THREE.MeshStandardMaterial({ map: texture });
  source.add(new THREE.Mesh(geometry, sourceMaterial));

  const first = cloneSceneWithOwnedMaterials(source);
  const second = cloneSceneWithOwnedMaterials(source);
  const [firstMaterial] = meshMaterials(first.scene);
  const [secondMaterial] = meshMaterials(second.scene);
  let firstMaterialDisposals = 0;
  let secondMaterialDisposals = 0;
  let sourceMaterialDisposals = 0;
  let geometryDisposals = 0;
  let textureDisposals = 0;
  firstMaterial.dispose = () => { firstMaterialDisposals += 1; };
  secondMaterial.dispose = () => { secondMaterialDisposals += 1; };
  sourceMaterial.dispose = () => { sourceMaterialDisposals += 1; };
  geometry.dispose = () => { geometryDisposals += 1; };
  texture.dispose = () => { textureDisposals += 1; };

  first.dispose();

  assert.equal(firstMaterialDisposals, 1);
  assert.equal(secondMaterialDisposals, 0);
  assert.equal(sourceMaterialDisposals, 0);
  assert.equal(geometryDisposals, 0);
  assert.equal(textureDisposals, 0);
});

test('repeated lifecycle cleanup re-disposes retained owned materials', () => {
  const source = new THREE.Group();
  const sourceMaterial = new THREE.MeshStandardMaterial();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial));

  const instance = cloneSceneWithOwnedMaterials(source);
  const [ownedMaterial] = meshMaterials(instance.scene);
  let disposalCount = 0;
  ownedMaterial.dispose = () => { disposalCount += 1; };

  instance.dispose();
  instance.dispose();

  assert.equal(disposalCount, 2);
});

test('StrictMode setup-cleanup-setup-unmount disposes every committed clone', () => {
  const source = new THREE.Group();
  source.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  ));
  const mountedInstances = [];
  const disposalCounts = [];
  const mount = (instance) => {
    const instanceIndex = mountedInstances.length;
    mountedInstances.push(instance);
    disposalCounts.push(0);
    for (const material of instance.materials) {
      material.dispose = () => { disposalCounts[instanceIndex] += 1; };
    }
  };

  const syntheticCleanup = mountOwnedMaterialScene(source, mount);
  syntheticCleanup();
  const realUnmountCleanup = mountOwnedMaterialScene(source, mount);
  realUnmountCleanup();

  assert.equal(mountedInstances.length, 2);
  assert.notEqual(mountedInstances[0].scene, mountedInstances[1].scene);
  assert.deepEqual(disposalCounts, [1, 1]);
});
