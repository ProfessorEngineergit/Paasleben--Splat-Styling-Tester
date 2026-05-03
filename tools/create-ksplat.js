// Local KSplat converter — uses the modules already installed in node_modules.
// Usage:
//   node tools/create-ksplat.js <input.splat|.ply> <output.ksplat> [compressionLevel=1] [alphaThreshold=1] [center="0,0,0"] [blockSize=5.0] [bucketSize=256] [shDegree=0]
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';
import * as fs from 'fs';

if (process.argv.length < 4) {
  console.log('Usage: node tools/create-ksplat.js <input.splat|.ply> <output.ksplat> [compressionLevel=1] [alphaThreshold=1] [center="0,0,0"] [blockSize=5.0] [bucketSize=256] [shDegree=0]');
  process.exit(1);
}

const inputFile  = process.argv[2];
const outputFile = process.argv[3];
const compressionLevel        = (process.argv.length >= 5)  ? parseInt(process.argv[4])  : 1;
const splatAlphaRemoval       = (process.argv.length >= 6)  ? parseInt(process.argv[5])  : 1;
const sceneCenter             = (process.argv.length >= 7)  ? new THREE.Vector3().fromArray(process.argv[6].split(',').map(Number)) : undefined;
const blockSize               = (process.argv.length >= 8)  ? parseFloat(process.argv[7]) : undefined;
const bucketSize              = (process.argv.length >= 9)  ? parseInt(process.argv[8])   : undefined;
const outSphericalHarmonicsDegree = (process.argv.length >= 10) ? parseInt(process.argv[9]) : undefined;
const sectionSize = 0;

console.log(`→ reading ${inputFile}`);
const fileData = fs.readFileSync(inputFile);
const path = inputFile.toLowerCase().trim();
const format = GaussianSplats3D.LoaderUtils.sceneFormatFromPath(path);
console.log(`→ converting (compression=${compressionLevel}, alpha≥${splatAlphaRemoval})`);
const splatBuffer = fileBufferToSplatBuffer(fileData.buffer, format, compressionLevel, splatAlphaRemoval);
fs.writeFileSync(outputFile, Buffer.from(splatBuffer.bufferData));
const inSize  = (fileData.length / (1024 * 1024)).toFixed(2);
const outSize = (splatBuffer.bufferData.byteLength / (1024 * 1024)).toFixed(2);
console.log(`✓ wrote ${outputFile}  (${inSize} MB → ${outSize} MB)`);

function fileBufferToSplatBuffer(fileBufferData, format, compression, alphaThreshold) {
  if (format === GaussianSplats3D.SceneFormat.Ply || format === GaussianSplats3D.SceneFormat.Splat) {
    const splatArray = (format === GaussianSplats3D.SceneFormat.Ply)
      ? GaussianSplats3D.PlyParser.parseToUncompressedSplatArray(fileBufferData, outSphericalHarmonicsDegree)
      : GaussianSplats3D.SplatParser.parseStandardSplatToUncompressedSplatArray(fileBufferData);
    const gen = GaussianSplats3D.SplatBufferGenerator.getStandardGenerator(
      alphaThreshold, compression, sectionSize, sceneCenter, blockSize, bucketSize,
    );
    return gen.generateFromUncompressedSplatArray(splatArray);
  }
  return new GaussianSplats3D.SplatBuffer(fileBufferData);
}
