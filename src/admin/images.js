// Foto-Verwaltung des Editors: Upload (verkleinert, als Base64-Dokument in
// `paas_images`), Bibliothek der statischen Fotos (public/images/**),
// Reihenfolge, Alt-Texte, Löschen.
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
// Automatisch generiert aus public/images/** (vite.config.ts) — neue Dateien
// einfach in den Ordner legen, sie erscheinen beim nächsten Reload/Build.
import imageLibrary from 'virtual:paas-image-library';

const IMAGES = 'paas_images';
// Firestore-Dokumente dürfen max. ~1 MiB groß sein — Sicherheitsmarge lassen.
const MAX_DATA_URL_CHARS = 900_000;
const MAX_EDGE_PX = 1600;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      li.querySelector('[data-act="remove"]').addEventListener('click', async () => {
        current.images.splice(i, 1);
        if (img.imageId) {
          try { await deleteDoc(doc(db, IMAGES, img.imageId)); } catch (err) { console.warn(err); }
        }
        commit();
      });
      listEl.appendChild(li);
    });
  };

  const uploadFiles = async (files) => {
    if (!current || !files.length) return;
    for (const [idx, file] of [...files].entries()) {
      if (!file.type.startsWith('image/')) continue;
      setStatus(`Lade hoch… (${idx + 1}/${files.length})`);
      try {
        const dataUrl = await fileToDataUrl(file);
        const imageId = uid();
        await setDoc(doc(db, IMAGES, imageId), {
          data: dataUrl,
          locationId: current.id,
          fileName: file.name,
          createdAt: new Date().toISOString(),
        });
        current.images.push({ imageId, alt: '', order: current.images.length });
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

  // ── Bibliothek (alle Fotos aus public/images/**) ───────────────────
  const librarySearch = document.querySelector('#library-search');
  const buildLibrary = () => {
    const q = librarySearch.value.trim().toLowerCase();
    libraryGrid.innerHTML = '';
    for (const path of imageLibrary) {
      if (q && !path.toLowerCase().includes(q)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'library-item';
      const used = current?.images.some((img) => img.url === path);
      if (used) btn.classList.add('is-used');
      btn.innerHTML = `<img src="${baseUrl}${path}" alt="" loading="lazy" /><span>${used ? '✓ ' : ''}${path.replace('images/', '')}</span>`;
      btn.addEventListener('click', () => {
        if (!current) return;
        current.images.push({ url: path, alt: '', order: current.images.length });
        commit();
        buildLibrary();
      });
      libraryGrid.appendChild(btn);
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
    // Beim Löschen eines Ortes auch dessen hochgeladene Fotos entfernen.
    async deleteUploadedImagesOf(loc) {
      for (const img of loc.images) {
        if (img.imageId) {
          try { await deleteDoc(doc(db, IMAGES, img.imageId)); } catch (err) { console.warn(err); }
        }
      }
    },
  };
};
