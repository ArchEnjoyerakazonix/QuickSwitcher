const { ipcRenderer } = require('electron');
const path = require('path');

// UI constants
const SCROLL_STEP = 500;       // px per arrow-key/button press
const WHEEL_MULTIPLIER = 3;    // wheel scroll speed multiplier
const APPLY_CLOSE_DELAY = 300; // ms before closing after applying wallpaper
const CARD_FADE_DURATION = 220; // ms for card delete animation

let allWallpapers = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupControls();
    await loadWallpapers();
});

function setupControls() {
    const searchInput = document.getElementById('search-input');
    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') ipcRenderer.send('close-app');
        if (document.activeElement === searchInput) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                return;
            }
        }
        if (e.key === 'ArrowRight') scrollTrack(SCROLL_STEP);
        if (e.key === 'ArrowLeft') scrollTrack(-SCROLL_STEP);
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (!query) {
                renderFilteredWallpapers(allWallpapers);
                return;
            }
            const filtered = allWallpapers.filter(w => {
                const name = path.basename(w.path).toLowerCase();
                return name.includes(query);
            });
            renderFilteredWallpapers(filtered);
        });
    }

    document.getElementById('nav-left').addEventListener('click', () => scrollTrack(-SCROLL_STEP));
    document.getElementById('nav-right').addEventListener('click', () => scrollTrack(SCROLL_STEP));

    // Instant no-lag wheel scroll
    const wrapper = document.getElementById('slices-wrapper');
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        document.getElementById('slices-track').scrollLeft += e.deltaY * WHEEL_MULTIPLIER;
    }, { passive: false });
}

function scrollTrack(delta) {
    const track = document.getElementById('slices-track');
    track.scrollLeft += delta;
}

async function loadWallpapers() {
    const track = document.getElementById('slices-track');
    track.innerHTML = '<div class="loading-msg">⚡ Loading wallpapers...</div>';

    allWallpapers = await ipcRenderer.invoke('get-wallpapers');
    renderFilteredWallpapers(allWallpapers);
}

function renderFilteredWallpapers(wallpapers) {
    const track = document.getElementById('slices-track');
    document.getElementById('wall-count').textContent = `${wallpapers.length} wallpapers`;
    track.innerHTML = '';

    if (wallpapers.length === 0) {
        track.innerHTML = '<div class="loading-msg">No wallpapers found...</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    wallpapers.forEach(wall => frag.appendChild(createCard(wall)));
    track.appendChild(frag);
    track.scrollLeft = 0;
}

function createCard(wall) {
    const card = document.createElement('div');
    card.className = 'slice-card';

    const img = document.createElement('img');
    img.className = 'preview-media';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = `file://${wall.thumb}`;

    const badge = document.createElement('span');
    badge.className = `fmt-badge${wall.type === 'VIDEO' ? ' video' : ''}`;
    badge.textContent = wall.ext;

    card.appendChild(img);
    card.appendChild(badge);

    // apply
    card.addEventListener('click', async () => {
        card.style.outline = '2px solid #89b4fa';
        await ipcRenderer.invoke('apply-wallpaper', { filepath: wall.path });
        setTimeout(() => ipcRenderer.send('close-app'), APPLY_CLOSE_DELAY);
    });

    // delete
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showDeleteDialog(wall, card);
    });

    return card;
}

function showDeleteDialog(wall, card) {
    // Remove any existing dialog
    document.querySelectorAll('.delete-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'delete-overlay';

    const popup = document.createElement('div');
    popup.className = 'delete-popup';

    const icon = document.createElement('div');
    icon.className = 'delete-icon';
    icon.textContent = '🗑️';

    const msg = document.createElement('div');
    msg.className = 'delete-msg';
    msg.textContent = 'Delete wallpaper?';

    const name = document.createElement('div');
    name.className = 'delete-name';
    name.textContent = path.basename(wall.path);

    const btns = document.createElement('div');
    btns.className = 'delete-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
        const res = await ipcRenderer.invoke('delete-wallpaper', { filepath: wall.path });
        if (res.success) {
            overlay.remove();
            card.style.transition = `opacity ${CARD_FADE_DURATION}ms ease, transform ${CARD_FADE_DURATION}ms ease`;
            card.style.opacity = '0';
            card.style.transform = 'scale(0.75) rotateY(-20deg)';
            setTimeout(() => card.remove(), CARD_FADE_DURATION + 20);
        }
    });

    btns.append(cancelBtn, deleteBtn);
    popup.append(icon, msg, name, btns);
    overlay.appendChild(popup);

    // dismiss on backdrop click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}
