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

const hashBytes = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashDataUrl = (dataUrl) => hashBytes(new TextEncoder().encode(dataUrl));

// Bild clientseitig verkleinern, bis die data-URL unter das Limit passt.
const fileToDataUrl = async (file) => {
  const bitmap = await createImageBitmap(file);
  let edge = Math.min(MAX_EDGE_PX, Math.max(bitmap.width, bitmap.height));
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const scale = edge / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
    canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
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
          <input class="image-alt" type="text" placeholder="Alt-Text (Beschreibung)" />
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

  const uploadFiles = async (files) => {
    if (!current || !files.length) return;
    await loadUploadedLibrary();
    for (const [idx, file] of [...files].entries()) {
      if (!file.type.startsWith('image/')) continue;
      setStatus(`Lade hoch… (${idx + 1}/${files.length})`);
      try {
        const sourceHash = await hashBytes(await file.arrayBuffer());
        const staticDuplicate = imageLibrary.find((item) => item.sha256 === sourceHash);
        if (staticDuplicate) {
          if (!current.images.some((image) => image.url === staticDuplicate.path)) {
            current.images.push({ url: staticDuplicate.path, alt: '', order: current.images.length });
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
        }
      } catch (err) {
        console.error('Upload fehlgeschlagen:', err);
        setStatus(`„${file.name}" konnte nicht hochgeladen werden: ${err.message}`);
        return;
      }
    }
    setStatus('');
    commit();
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
