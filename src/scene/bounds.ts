import { Box3, Sphere, Vector3 } from 'three';

export type SceneBounds = {
  box: Box3;
  center: Vector3;
  size: Vector3;
  radius: number;
  sphere: Sphere;
};

const temp = new Vector3();
const OUTLIER_RADIUS_THRESHOLD = 1.8;
const MIN_SAMPLES_FOR_ROBUST_BOUNDS = 50;
const LOWER_BOUNDS_PERCENTILE = 0.02;
const UPPER_BOUNDS_PERCENTILE = 0.98;

const hasAllFiniteCoordinates = (value: Vector3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)));
  return values[index];
};

export const computeSceneBounds = (splatMesh: any, maxSamples = 18000): SceneBounds => {
  const box = new Box3();
  const center = new Vector3();
  const size = new Vector3();
  const sphere = new Sphere();
  const sampledX: number[] = [];
  const sampledY: number[] = [];
  const sampledZ: number[] = [];

  const splatCount: number = Math.max(0, splatMesh?.getSplatCount?.() ?? 0);
  if (splatCount === 0) {
    box.set(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    box.getCenter(center);
    box.getSize(size);
    box.getBoundingSphere(sphere);
    return { box, center, size, radius: sphere.radius, sphere };
  }

  const step = Math.max(1, Math.floor(splatCount / maxSamples));
  let sampled = 0;

  for (let i = 0; i < splatCount; i += step) {
    splatMesh.getSplatCenter(i, temp, true);
    if (!hasAllFiniteCoordinates(temp)) continue;
    box.expandByPoint(temp);
    sampledX.push(temp.x);
    sampledY.push(temp.y);
    sampledZ.push(temp.z);
    sampled++;
  }

  if (sampled < splatCount) {
    splatMesh.getSplatCenter(splatCount - 1, temp, true);
    if (hasAllFiniteCoordinates(temp)) {
      box.expandByPoint(temp);
      sampledX.push(temp.x);
      sampledY.push(temp.y);
      sampledZ.push(temp.z);
    }
  }

  if (sampledX.length === 0 || box.isEmpty()) {
    box.set(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    box.getCenter(center);
    box.getSize(size);
    box.getBoundingSphere(sphere);
    return { box, center, size, radius: sphere.radius, sphere };
  }

  const robustBox = new Box3();
  if (sampledX.length >= MIN_SAMPLES_FOR_ROBUST_BOUNDS) {
    sampledX.sort((a, b) => a - b);
    sampledY.sort((a, b) => a - b);
    sampledZ.sort((a, b) => a - b);
    robustBox.set(
      new Vector3(
        percentile(sampledX, LOWER_BOUNDS_PERCENTILE),
        percentile(sampledY, LOWER_BOUNDS_PERCENTILE),
        percentile(sampledZ, LOWER_BOUNDS_PERCENTILE),
      ),
      new Vector3(
        percentile(sampledX, UPPER_BOUNDS_PERCENTILE),
        percentile(sampledY, UPPER_BOUNDS_PERCENTILE),
        percentile(sampledZ, UPPER_BOUNDS_PERCENTILE),
      ),
    );
  } else {
    robustBox.copy(box);
  }

  const robustSphere = new Sphere();
  robustBox.getBoundingSphere(robustSphere);
  box.getBoundingSphere(sphere);

  const shouldUseRobust = robustSphere.radius > 0 && sphere.radius > robustSphere.radius * OUTLIER_RADIUS_THRESHOLD;
  const selectedBox = shouldUseRobust ? robustBox : box;
  const selectedSphere = shouldUseRobust ? robustSphere : sphere;

  selectedBox.getCenter(center);
  selectedBox.getSize(size);
  sphere.copy(selectedSphere);

  return {
    box: selectedBox.clone(),
    center: center.clone(),
    size: size.clone(),
    radius: sphere.radius,
    sphere: sphere.clone(),
  };
};
