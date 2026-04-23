const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf-8');

// 1. Update STYLE_STATE
code = code.replace(/const STYLE_STATE = \{[\s\S]*?\};/, `const STYLE_STATE = {
  backgroundColor: '#121214',
  paperTextureEnabled: false,
  textureTarget: 'viewport',
  textureIntensity: 0.35,
  sketchLookEnabled: true,
  contrast: 1.15,
  saturation: 0.85,
  splatScale: 1.4,
  splatRotation: -28,
};`);

// 2. Remove DOM panel part
code = code.replace(/<button id="panel-toggle">Styling<\/button>[\s\S]*?<\/aside>/, '');

// 3. Remove controls and event listeners
code = code.replace(/const controls = \{[\s\S]*?applyStylingState\(\);\s*\}\);/, '');

// 4. Update initialCameraPos
code = code.replace(/initialCameraPos\.set\(position\.x, position\.y \+ 3\.5, position\.z \+ 6\);/, 'initialCameraPos.set(position.x, position.y + 2.5, position.z + 4);');

// 5. Clean up controlPanel references in close overlay
code = code.replace(/const controlPanel = document\.querySelector\('#control-panel'\);[\s\S]*?panelToggle\.style\.pointerEvents = 'auto';\s*\}/, '');

// 6. Clean up controlPanel references in label click
code = code.replace(/const controlPanel = document\.querySelector\('#control-panel'\);[\s\S]*?panelToggle\.style\.pointerEvents = 'none';\s*\}/, '');

fs.writeFileSync('src/main.js', code);
