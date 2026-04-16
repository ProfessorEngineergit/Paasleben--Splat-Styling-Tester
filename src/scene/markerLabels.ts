import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type MarkerLabel = {
  object3d: Object3D;
  element: HTMLDivElement;
};

const _projected = new Vector3();

const formatName = (name: string): string =>
  name.replace(/[_.-]+/g, ' ').trim() || name;

export const loadMarkerLabels = async (
  glbPath: string,
  container: HTMLElement,
): Promise<MarkerLabel[]> => {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbPath);
  const markers: MarkerLabel[] = [];

  gltf.scene.traverse((object) => {
    // Blender empties become plain Object3D nodes (type === 'Object3D').
    // Skip the root scene node itself (no parent) and any unnamed nodes.
    if (object.type !== 'Object3D') return;
    if (!object.parent) return;
    if (!object.name) return;

    const label = document.createElement('div');
    label.className = 'marker-label';
    label.textContent = formatName(object.name);
    label.style.display = 'none';
    container.appendChild(label);

    markers.push({ object3d: object, element: label });
  });

  return markers;
};

export const updateMarkerLabels = (
  markers: MarkerLabel[],
  camera: PerspectiveCamera,
  containerWidth: number,
  containerHeight: number,
): void => {
  for (const { object3d, element } of markers) {
    _projected.setFromMatrixPosition(object3d.matrixWorld).project(camera);

    // Hide labels behind the camera or outside a reasonable frustum range
    if (_projected.z > 1 || _projected.z < -1) {
      element.style.display = 'none';
      continue;
    }

    const x = (_projected.x * 0.5 + 0.5) * containerWidth;
    const y = (-_projected.y * 0.5 + 0.5) * containerHeight;

    element.style.display = 'block';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }
};
