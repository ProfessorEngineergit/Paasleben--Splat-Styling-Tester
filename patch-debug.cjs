const fs = require('fs');

let content = fs.readFileSync('src/main.js', 'utf-8');

const debugJs = `
  // --- Debug Panel ---
  const debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel';
  document.body.appendChild(debugPanel);
  
  const state = {
    splatX: 0,
    splatY: 0,
    splatZ: 0,
    splatRotY: -28
  };
  
  const createSlider = (labelStr, min, max, step, key) => {
    const row = document.createElement('div');
    const label = document.createElement('label');
    label.innerText = labelStr;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = state[key];
    const val = document.createElement('span');
    val.className = 'val';
    val.innerText = state[key];
    
    input.addEventListener('input', (e) => {
      state[key] = parseFloat(e.target.value);
      val.innerText = state[key].toFixed(2);
      
      if (viewer.splatMesh) {
        if (key === 'splatRotY') {
          const rad = THREE.MathUtils.degToRad(state[key]);
          // Re-apply initial rotation along with translation
          viewer.splatMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), rad);
        } else {
          viewer.splatMesh.position.set(state.splatX, state.splatY, state.splatZ);
        }
      }
    });
    
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    return row;
  };
  
  const headerSplat = document.createElement('h3');
  headerSplat.innerText = 'Splat Adjustments';
  debugPanel.appendChild(headerSplat);
  
  debugPanel.appendChild(createSlider('Splat X', -10, 10, 0.1, 'splatX'));
  debugPanel.appendChild(createSlider('Splat Y', -10, 10, 0.1, 'splatY'));
  debugPanel.appendChild(createSlider('Splat Z', -10, 10, 0.1, 'splatZ'));
  debugPanel.appendChild(createSlider('Splat Rot Y', -180, 180, 1, 'splatRotY'));

  const headerCam = document.createElement('h3');
  headerCam.innerText = 'Camera Stats';
  headerCam.style.marginTop = '10px';
  debugPanel.appendChild(headerCam);
  
  const camPosBox = document.createElement('div');
  camPosBox.style.display = 'block';
  camPosBox.style.userSelect = 'text';
  camPosBox.style.cursor = 'text';
  camPosBox.style.fontFamily = 'monospace';
  debugPanel.appendChild(camPosBox);

  // Allow interaction on the panel by dropping custom cursor locally if needed,
  // but cursor:none is on html. We can just add .cursor-auto to #debug-panel or override.
`;

const animateLoc = content.indexOf('const animate = () => {');

content = content.slice(0, animateLoc) + debugJs + content.slice(animateLoc);

const camUpdateStr = `const animate = () => {
      orbitControls.update();
      viewer.update();
      viewer.render();

      camPosBox.innerHTML = \`
        <b>Cam Pos:</b> \${camera.position.x.toFixed(2)}, \${camera.position.y.toFixed(2)}, \${camera.position.z.toFixed(2)}<br/>
        <b>Target:</b> \${orbitControls.target.x.toFixed(2)}, \${orbitControls.target.y.toFixed(2)}, \${orbitControls.target.z.toFixed(2)}<br/>
        <b>Splat:</b> POS(\${state.splatX}, \${state.splatY}, \${state.splatZ}) ROT: \${state.splatRotY}
      \`;
`;

content = content.replace(/const animate = \(\) => \{\n\s*orbitControls\.update\(\);\n\s*viewer\.update\(\);\n\s*viewer\.render\(\);/gs, camUpdateStr);

fs.writeFileSync('src/main.js', content);
