// Foto-Verwaltung des Editors: Upload (verkleinert, als Base64-Dokument in
// `paas_images`), gemeinsame Bibliothek aus statischen und hochgeladenen
// Fotos, Reihenfolge, Alt-Texte und Entfernen aus einem Ort.
import {
  collection, doc, setDoc, getDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
// Automatisch generiert aus public/images/** (vite.config.ts) — neue Dateien
// einfach in den Ordner legen, sie erscheinen beim nächsten Reload/Build.
import imageLibrary from 'virtual:paas-image-library';

const IMAGES = 'paas_images';
// Firestore-Dokumente dürfen max. ~1 MiB groß sein — Sicherheitsmarge lassen.
const MAX_DATA_URL_CHARS = 900_000;
const MAX_EDGE_PX = 1600;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// SHA-256 ohne Web Crypto. crypto.subtle gibt es nur auf https — über
// http://paasleben.com scheiterte deshalb bisher jeder Upload, während das
// Auswählen aus der Bibliothek funktionierte.
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const sha256Fallback = (input) => {
  const bytes = new Uint8Array(input);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
};

const hashBytes = async (bytes) => {
  if (!globalThis.crypto?.subtle) return sha256Fallback(bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashDataUrl = (dataUrl) => hashBytes(new TextEncoder().encode(dataUrl));

// iPhone-Fotos (HEIC/HEIF) kommen oft ohne MIME-Typ an und wurden bisher
// stillschweigend übersprungen — deshalb zusätzlich die Dateiendung prüfen.
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic|heif)$/i;
const isHeic = (file) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
export const isImageFile = (file) => file.type.startsWith('image/') || IMAGE_EXT.test(file.name);

const loadViaImgElement = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bildformat wird nicht unterstützt')); };
  img.src = url;
});

// Liefert etwas Zeichenbares mit width/height. Reihenfolge: schnell und
// EXIF-gedreht per createImageBitmap, dann <img> (Safari kann so auch HEIC),
// zuletzt HEIC → JPEG mit heic2any (nur bei Bedarf nachgeladen, ~1 MB).
const decodeImage = async (file) => {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch { /* nächster Weg */ }
  try {
    return await loadViaImgElement(file);
  } catch (err) {
    if (!isHeic(file)) throw err;
  }
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return loadViaImgElement(Array.isArray(converted) ? converted[0] : converted);
};

// Bild clientseitig verkleinern, bis die data-URL unter das Limit passt.
export const fileToDataUrl = async (file, maxEdge = MAX_EDGE_PX) => {
  const bitmap = await decodeImage(file);
  // <img> meldet die echte Größe über naturalWidth/-Height.
  const srcW = bitmap.naturalWidth || bitmap.width;
  const srcH = bitmap.naturalHeight || bitmap.height;
  let edge = Math.min(maxEdge, Math.max(srcW, srcH));
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const scale = edge / Math.max(srcW, srcH);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * Math.min(1, scale)));
    canvas.height = Math.max(1, Math.round(srcH * Math.min(1, scale)));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
    edge = Math.round(edge * 0.8);
  }
  throw new Error('Bild lässt sich nicht klein genug komprimieren.');
};

export const setupImagesUI = ({ onImagesChanged }) => {
  const listEl = document.querySelector('#image-list');
  const uploadInput = document.querySelector('#image-upload');
  const dropZone = document.querySelector('#drop-zone');
  const uploadStatus = document.querySelector('#upload-status');
  const openLibraryBtn = document.querySelector('#open-library');
  const libraryDialog = document.querySelector('#library-dialog');
  const libraryGrid = document.querySelector('#library-grid');
  const baseUrl = import.meta.env.BASE_URL;

  let current = null; // ausgewählter Ort
  let uploadedLibrary = [];
  let uploadedLibraryPromise = null;

  // Alte Uploads werden beim ersten Öffnen der Bibliothek automatisch um
  // Hash/Library-Metadaten ergänzt. Neue identische Uploads verwenden danach
  // dasselbe Dokument statt eine Kopie anzulegen.
  const loadUploadedLibrary = () => {
    if (uploadedLibraryPromise) return uploadedLibraryPromise;
    uploadedLibraryPromise = (async () => {
      const snapshot = await getDocs(collection(db, IMAGES));
      const items = [];
      for (const imageDoc of snapshot.docs) {
        const data = imageDoc.data();
        if (!data?.data) continue;
        const sha256 = data.sha256 || await hashDataUrl(data.data);
        const item = {
          id: imageDoc.id,
          data: data.data,
          sha256,
          sourceSha256: data.sourceSha256 || null,
          fileName: data.fileName || `Upload ${imageDoc.id.slice(0, 8)}`,
          createdAt: data.createdAt || '',
        };
        items.push(item);
        if (!data.sha256 || data.library !== true) {
          setDoc(doc(db, IMAGES, imageDoc.id), { sha256, library: true }, { merge: true }).catch(() => {});
        }
      }
      uploadedLibrary = items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return uploadedLibrary;
    })().catch((err) => {
      uploadedLibraryPromise = null;
      console.warn('Upload-Bibliothek konnte nicht geladen werden:', err);
      return [];
    });
    return uploadedLibraryPromise;
  };

  const setStatus = (msg) => {
    uploadStatus.hidden = !msg;
    uploadStatus.textContent = msg || '';
  };

  const commit = () => {
    if (!current) return;
    current.images = current.images.map((img, i) => ({ ...img, order: i }));
    onImagesChanged(current.id, current.images);
    render();
  };

  const thumbSrcFor = async (img) => {
    if (img.url) return `${baseUrl}${img.url}`;
    if (img.imageId) {
      const cached = uploadedLibrary.find((item) => item.id === img.imageId);
      if (cached) return cached.data;
      const snap = await getDoc(doc(db, IMAGES, img.imageId));
      return snap.exists() ? snap.data().data : null;
    }
    return null;
  };

  const render = () => {
    listEl.innerHTML = '';
    if (!current) return;
    current.images.forEach((img, i) => {
      const li = document.createElement('li');
      li.className = 'image-item';
      li.innerHTML = `
        <img class="image-thumb" alt="" loading="lazy" />
        <div class="image-meta">
          <input class="image-alt" type="text" placeholder="Beschreibung / Bildunterschrift (z. B. Werk, Künstler)" />
          <span class="image-source"></span>
        </div>
        <div class="image-buttons">
          <button type="button" class="btn btn-quiet" data-act="up" title="Nach vorn" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-quiet" data-act="down" title="Nach hinten" ${i === current.images.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-quiet btn-danger-quiet" data-act="remove" title="Entfernen">✕</button>
        </div>
      `;
      const thumb = li.querySelector('.image-thumb');
      thumbSrcFor(img).then((src) => { if (src) thumb.src = src; });
      li.querySelector('.image-source').textContent = img.url ? img.url : 'Upload';
      const altInput = li.querySelector('.image-alt');
      altInput.value = img.alt || '';
      altInput.addEventListener('change', () => {
        img.alt = altInput.value;
        commit();
      });
      li.querySelector('[data-act="up"]').addEventListener('click', () => {
        [current.images[i - 1], current.images[i]] = [current.images[i], current.images[i - 1]];
        commit();
      });
      li.querySelector('[data-act="down"]').addEventListener('click', () => {
        [current.images[i + 1], current.images[i]] = [current.images[i], current.images[i + 1]];
        commit();
      });
      li.querySelector('[data-act="remove"]').addEventListener('click', () => {
        current.images.splice(i, 1);
        // Nur aus diesem Ort entfernen. Das Bild bleibt als wiederverwendbarer
        // Eintrag in der gemeinsamen Bibliothek erhalten.
        commit();
      });
      listEl.appendChild(li);
    });
  };

  const uploadFiles = async (fileList) => {
    const all = [...fileList];
    if (!current || !all.length) return;
    const files = all.filter(isImageFile);
    const skipped = all.filter((file) => !isImageFile(file)).map((file) => file.name);
    const failed = [];
    let added = 0;
    setStatus('Bereite Upload vor…');
    await loadUploadedLibrary();
    for (const [idx, file] of files.entries()) {
      setStatus(`Lade hoch… (${idx + 1}/${files.length}) ${file.name}`);
      try {
        const sourceHash = await hashBytes(await file.arrayBuffer());
        const staticDuplicate = imageLibrary.find((item) => item.sha256 === sourceHash);
        if (staticDuplicate) {
          if (!current.images.some((image) => image.url === staticDuplicate.path)) {
            current.images.push({ url: staticDuplicate.path, alt: '', order: current.images.length });
            added += 1;
          }
          continue;
        }
        let libraryImage = uploadedLibrary.find((item) => item.sourceSha256 === sourceHash);
        let dataUrl = null;
        let sha256 = null;
        if (!libraryImage) {
          dataUrl = await fileToDataUrl(file);
          sha256 = await hashDataUrl(dataUrl);
          libraryImage = uploadedLibrary.find((item) => item.sha256 === sha256);
        }
        if (!libraryImage) {
          const imageId = uid();
          const createdAt = new Date().toISOString();
          await setDoc(doc(db, IMAGES, imageId), {
            data: dataUrl,
            sha256,
            sourceSha256: sourceHash,
            library: true,
            sourceLocationId: current.id,
            fileName: file.name,
            createdAt,
          });
          libraryImage = {
            id: imageId,
            data: dataUrl,
            sha256,
            sourceSha256: sourceHash,
            fileName: file.name,
            createdAt,
          };
          uploadedLibrary.unshift(libraryImage);
        }
        if (!current.images.some((image) => image.imageId === libraryImage.id)) {
          current.images.push({ imageId: libraryImage.id, alt: '', order: current.images.length });
          added += 1;
        }
      } catch (err) {
        // Weitermachen: ein defektes Foto soll die übrigen nicht verwerfen.
        console.error('Upload fehlgeschlagen:', err);
        const reason = err?.code === 'permission-denied'
          ? 'keine Schreibrechte'
          : (isHeic(file) ? `${err.message} — bitte als JPEG exportieren` : err.message);
        failed.push(`„${file.name}“ (${reason})`);
      }
    }
    if (added) commit();
    const notes = [];
    if (added) notes.push(`${added} Foto${added === 1 ? '' : 's'} hinzugefügt ✓`);
    if (failed.length) notes.push(`Nicht hochgeladen: ${failed.join(', ')}`);
    if (skipped.length) notes.push(`Keine Bilddatei, übersprungen: ${skipped.join(', ')}`);
    if (!added && !failed.length && !skipped.length && files.length) notes.push('Bereits an diesem Ort vorhanden.');
    setStatus(notes.join(' · '));
    if (added && !failed.length && !skipped.length) setTimeout(() => setStatus(''), 4000);
  };

  uploadInput.addEventListener('change', () => {
    uploadFiles(uploadInput.files);
    uploadInput.value = '';
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('is-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
    uploadFiles(e.dataTransfer.files);
  });

  // ── Bibliothek (public/images/** + dauerhafte Uploads) ─────────────
  const librarySearch = document.querySelector('#library-search');
  let libraryBuild = 0;
  const buildLibrary = async () => {
    const build = ++libraryBuild;
    const q = librarySearch.value.trim().toLowerCase();
    libraryGrid.innerHTML = '';
    const addItem = ({ src, label, descriptor, used }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'library-item';
      if (used) btn.classList.add('is-used');
      const image = document.createElement('img');
      image.src = src;
      image.alt = '';
      image.loading = 'lazy';
      const caption = document.createElement('span');
      caption.textContent = `${used ? '✓ ' : ''}${label}`;
      btn.append(image, caption);
      btn.addEventListener('click', () => {
        if (!current || current.images.some((item) => (
          descriptor.url ? item.url === descriptor.url : item.imageId === descriptor.imageId
        ))) return;
        current.images.push({ ...descriptor, alt: '', order: current.images.length });
        commit();
        buildLibrary();
      });
      libraryGrid.appendChild(btn);
    };

    for (const libraryImage of imageLibrary) {
      const path = libraryImage.path;
      if (q && !path.toLowerCase().includes(q)) continue;
      const used = current?.images.some((img) => img.url === path);
      addItem({
        src: `${baseUrl}${path}`,
        label: path.replace('images/', ''),
        descriptor: { url: path },
        used,
      });
    }

    const uploads = await loadUploadedLibrary();
    if (build !== libraryBuild) return;
    for (const item of uploads) {
      if (q && !item.fileName.toLowerCase().includes(q)) continue;
      const used = current?.images.some((img) => img.imageId === item.id);
      addItem({
        src: item.data,
        label: `Upload · ${item.fileName}`,
        descriptor: { imageId: item.id },
        used,
      });
    }
  };
  librarySearch.addEventListener('input', buildLibrary);
  openLibraryBtn.addEventListener('click', () => {
    buildLibrary();
    libraryDialog.showModal();
  });
  document.querySelector('#library-close').addEventListener('click', () => libraryDialog.close());

  return {
    setLocation(loc) {
      current = loc;
      setStatus('');
      render();
    },
    refreshLibrary: buildLibrary,
  };
};
