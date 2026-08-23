// UI constants
const SCROLL_STEP = 500;       // px per arrow-key/button press
const APPLY_CLOSE_DELAY = 300; // ms before closing after applying wallpaper
const CARD_FADE_DURATION = 220; // ms for card delete animation

const STAR_FILLED_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#f9e2af" stroke="#f9e2af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const STAR_OUTLINE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const TRASH_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f38ba8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

let allWallpapers = [];
let favoritePaths = new Set();
let currentSort = 'name-asc';
let focusedCardIndex = -1;
let activeFilteredWallpapers = [];

const thumbOverrides = new Map(); // id -> versioned thumbUrl
let isApplyingWallpaper = false;

function getBasename(filePath) {
    return filePath ? filePath.split(/[\\/]/).pop() : '';
}

document.addEventListener('DOMContentLoaded', async () => {
    setupControls();
    setupThumbReadyListener();
    await loadWallpapers();
});

function setupThumbReadyListener() {
    if (window.wallpaperAPI && window.wallpaperAPI.onThumbReady) {
        window.wallpaperAPI.onThumbReady((data) => {
            if (!data || !data.id || !data.thumbUrl) return;
            const { id, thumbUrl } = data;
            const sep = thumbUrl.includes('?') ? '&' : '?';
            const versionedUrl = `${thumbUrl}${sep}t=${Date.now()}`;

            thumbOverrides.set(id, versionedUrl);

            const wall = allWallpapers.find(w => w.id === id);
            if (wall) wall.thumbUrl = versionedUrl;

            document.querySelectorAll(`[data-wallpaper-id="${CSS.escape(id)}"]`).forEach(img => {
                img.src = versionedUrl;
            });
        });
    }
}

async function applyWallpaper(wall, cardElement) {
    if (isApplyingWallpaper || !wall) return;
    isApplyingWallpaper = true;
    if (cardElement) cardElement.style.outline = '2px solid #89b4fa';
    try {
        const res = await window.wallpaperAPI.apply(wall.id);
        if (res && res.ok) {
            setTimeout(() => window.wallpaperAPI.close(), APPLY_CLOSE_DELAY);
        } else if (cardElement) {
            cardElement.style.outline = '2px solid #f38ba8';
        }
    } finally {
        isApplyingWallpaper = false;
    }
}

function setupControls() {
    const searchInput = document.getElementById('search-input');
    const sortBtn = document.getElementById('sort-btn');
    const sortDropdown = document.getElementById('sort-dropdown');

    document.getElementById('close-btn').addEventListener('click', () => window.wallpaperAPI.close());
    
    // Keyboard Navigation & Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.activeElement === searchInput) {
                searchInput.blur();
            } else {
                window.wallpaperAPI.close();
            }
        }
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            if (searchInput) searchInput.focus();
            return;
        }

        const cards = document.querySelectorAll('.slice-card');
        if (!cards.length) return;

        if (document.activeElement === searchInput) {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                searchInput.blur();
                setFocusedCard(0);
            }
            return;
        }

        if (e.key === 'ArrowRight' || e.key === 'l') {
            setFocusedCard(focusedCardIndex + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'h') {
            setFocusedCard(focusedCardIndex - 1);
        } else if (e.key === 'Enter' && focusedCardIndex >= 0 && focusedCardIndex < activeFilteredWallpapers.length) {
            const wall = activeFilteredWallpapers[focusedCardIndex];
            const card = cards[focusedCardIndex];
            applyWallpaper(wall, card);
        }
    });

    let searchDebounce = null;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(filterAndRender, 90);
        });
    }

    if (sortBtn && sortDropdown) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!sortDropdown.contains(e.target) && e.target !== sortBtn) {
                sortDropdown.classList.add('hidden');
            }
        });

        document.querySelectorAll('.sort-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.sort-option').forEach(el => el.classList.remove('active'));
                opt.classList.add('active');
                currentSort = opt.getAttribute('data-sort');
                sortBtn.textContent = (opt.textContent || 'Sort') + ' ▾';
                sortDropdown.classList.add('hidden');
                filterAndRender();
            });
        });
    }

    document.getElementById('nav-left').addEventListener('click', () => scrollTrack(-SCROLL_STEP));
    document.getElementById('nav-right').addEventListener('click', () => scrollTrack(SCROLL_STEP));

    // Global Wheel Listener (mouse wheel anywhere in window scrolls track horizontally)
    window.addEventListener('wheel', (e) => {
        const track = document.getElementById('slices-track');
        if (!track) return;
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (delta !== 0) {
            e.preventDefault();
            track.scrollLeft += delta * 1.5;
        }
    }, { passive: false });
}

function setFocusedCard(index) {
    const cards = document.querySelectorAll('.slice-card');
    if (!cards.length) return;

    if (focusedCardIndex >= 0 && focusedCardIndex < cards.length) {
        cards[focusedCardIndex].classList.remove('keyboard-focused');
    }

    focusedCardIndex = Math.max(0, Math.min(index, cards.length - 1));
    const targetCard = cards[focusedCardIndex];
    if (targetCard) {
        targetCard.classList.add('keyboard-focused');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function scrollTrack(delta) {
    const track = document.getElementById('slices-track');
    if (track) track.scrollLeft += delta;
}

async function loadWallpapers() {
    const track = document.getElementById('slices-track');
    track.innerHTML = '<div class="loading-msg">Loading wallpapers...</div>';

    try {
        const [wallpapers, favs] = await Promise.all([
            window.wallpaperAPI.list(),
            window.wallpaperAPI.getFavorites ? window.wallpaperAPI.getFavorites() : []
        ]);
        favoritePaths = new Set(favs || []);
        allWallpapers = wallpapers;
    } catch (e) {
        allWallpapers = await window.wallpaperAPI.list();
    }
    filterAndRender();
}

function filterAndRender(preserveScroll = false) {
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let list = allWallpapers;
    if (query) {
        list = list.filter(w => {
            const name = (w.name).toLowerCase();
            return name.includes(query);
        });
    }

    const sorted = sortWallpapers(list);
    renderFilteredWallpapers(sorted, preserveScroll);
}

function sortWallpapers(list) {
    const arr = [...list];
    switch (currentSort) {
        case 'name-asc':
            return arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        case 'favorites':
            return arr.sort((a, b) => {
                const aFav = favoritePaths.has(a.favoriteKey) ? 1 : 0;
                const bFav = favoritePaths.has(b.favoriteKey) ? 1 : 0;
                if (bFav !== aFav) return bFav - aFav;
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
        case 'size-desc':
            return arr.sort((a, b) => (b.size || 0) - (a.size || 0));
        case 'size-asc':
            return arr.sort((a, b) => (a.size || 0) - (b.size || 0));
        case 'type-img':
            return arr.sort((a, b) => {
                const diff = (a.type === 'IMAGE' ? 0 : 1) - (b.type === 'IMAGE' ? 0 : 1);
                return diff !== 0 ? diff : a.name.localeCompare(b.name);
            });
        case 'type-vid':
            return arr.sort((a, b) => {
                const diff = (a.type === 'VIDEO' ? 0 : 1) - (b.type === 'VIDEO' ? 0 : 1);
                return diff !== 0 ? diff : a.name.localeCompare(b.name);
            });
        case 'date-desc':
            return arr.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        case 'date-asc':
            return arr.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
        default:
            return arr;
    }
}

function renderFilteredWallpapers(wallpapers, preserveScroll = false) {
    const track = document.getElementById('slices-track');
    const savedScroll = track ? track.scrollLeft : 0;
    document.getElementById('wall-count').textContent = `${wallpapers.length} wallpapers`;

    activeFilteredWallpapers = wallpapers;
    focusedCardIndex = -1;
    if (track) {
        track.innerHTML = '';
        if (!preserveScroll) {
            track.scrollLeft = 0;
        }
    }

    if (wallpapers.length === 0) {
        if (track) track.innerHTML = '<div class="loading-msg">No wallpapers found...</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    wallpapers.forEach((wall, index) => {
        frag.appendChild(createCard(wall, index));
    });
    if (track) {
        track.appendChild(frag);
        if (preserveScroll) {
            track.scrollLeft = savedScroll;
        }
    }
}

function createCard(wall, cardIndex) {
    const card = document.createElement('div');
    const favoriteKey = wall.favoriteKey;
    const isFav = favoritePaths.has(favoriteKey);
    card.className = `slice-card${isFav ? ' is-favorite' : ''}`;

    const img = document.createElement('img');
    img.className = 'preview-media';
    img.decoding = 'async';
    img.src = thumbOverrides.get(wall.id) || wall.thumbUrl;
    img.dataset.wallpaperId = wall.id;

    const favBtn = document.createElement('div');
    favBtn.className = `favorite-btn${isFav ? ' active' : ''}`;
    favBtn.innerHTML = isFav ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
    favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

    favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updatedFavs = await window.wallpaperAPI.toggleFavorite(wall.id);
        favoritePaths = new Set(updatedFavs || []);

        const nowFav = favoritePaths.has(favoriteKey);
        favBtn.className = `favorite-btn${nowFav ? ' active' : ''}`;
        favBtn.innerHTML = nowFav ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
        favBtn.title = nowFav ? 'Remove from favorites' : 'Add to favorites';

        if (nowFav) {
            card.classList.add('is-favorite');
        } else {
            card.classList.remove('is-favorite');
        }

        if (currentSort === 'favorites') {
            filterAndRender();
        }
    });

    // Cyberpunk Interactive HUD (appears on hover / focus)
    const hud = document.createElement('div');
    hud.className = 'cyber-hud';

    const hudHeader = document.createElement('div');
    hudHeader.className = 'cyber-hud-header';

    const typeTag = document.createElement('span');
    typeTag.className = `cyber-tag ${wall.type === 'VIDEO' ? 'video' : 'image'}`;
    typeTag.textContent = wall.ext;

    const sizeTag = document.createElement('span');
    sizeTag.className = 'cyber-size';
    sizeTag.textContent = wall.sizeFormatted || '';

    hudHeader.appendChild(typeTag);
    if (wall.sizeFormatted) hudHeader.appendChild(sizeTag);

    const hudTitle = document.createElement('div');
    hudTitle.className = 'cyber-hud-title';
    hudTitle.textContent = wall.name;

    const hudAction = document.createElement('div');
    hudAction.className = 'cyber-hud-action';
    hudAction.textContent = 'CLICK TO APPLY';

    hud.appendChild(hudHeader);
    hud.appendChild(hudTitle);
    hud.appendChild(hudAction);

    card.appendChild(img);
    card.appendChild(favBtn);
    card.appendChild(hud);

    card.addEventListener('click', () => {
        applyWallpaper(wall, card);
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showDeleteDialog(wall, card);
    });

    return card;
}

function showDeleteDialog(wall, card) {
    document.querySelectorAll('.delete-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'delete-overlay';

    const popup = document.createElement('div');
    popup.className = 'delete-popup';

    const icon = document.createElement('div');
    icon.className = 'delete-icon';
    icon.innerHTML = TRASH_SVG;

    const msg = document.createElement('div');
    msg.className = 'delete-msg';
    msg.textContent = 'Delete wallpaper?';

    const name = document.createElement('div');
    name.className = 'delete-name';
    name.textContent = wall.name;

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
        const res = await window.wallpaperAPI.remove(wall.id);
        if (res && res.success) {
            overlay.remove();
            allWallpapers = allWallpapers.filter(w => w.id !== wall.id);
            card.style.transition = `opacity ${CARD_FADE_DURATION}ms ease, transform ${CARD_FADE_DURATION}ms ease`;
            card.style.opacity = '0';
            card.style.transform = 'scale(0.75)';
            setTimeout(() => {
                card.remove();
                filterAndRender(true);
            }, CARD_FADE_DURATION + 20);
        }
    });

    btns.append(cancelBtn, deleteBtn);
    popup.append(icon, msg, name, btns);
    overlay.appendChild(popup);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}
