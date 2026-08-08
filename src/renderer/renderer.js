// UI constants
const SCROLL_STEP = 500;       // px per arrow-key/button press
const APPLY_CLOSE_DELAY = 300; // ms before closing after applying wallpaper
const CARD_FADE_DURATION = 220; // ms for card delete animation

const CARD_WIDTH = 160;
const CARD_GAP = 10;
const ITEM_WIDTH = CARD_WIDTH + CARD_GAP;
const OVERSCAN_BUFFER = 6;

let allWallpapers = [];
let favoritePaths = new Set();
let currentSort = 'name-asc';
let focusedCardIndex = -1;

let activeFilteredWallpapers = [];
let lastStartIndex = -1;
let lastEndIndex = -1;

const mountedCards = new Map();   // id -> HTMLElement card
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

            const card = mountedCards.get(id);
            if (card) {
                const img = card.querySelector('.preview-media');
                if (img) img.src = versionedUrl;
            }
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

        if (!activeFilteredWallpapers.length) return;

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
            const card = mountedCards.get(wall.id);
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
                sortBtn.textContent = (opt.textContent.replace('⭐ ', '') || 'Sort') + ' ▾';
                sortDropdown.classList.add('hidden');
                filterAndRender();
            });
        });
    }

    document.getElementById('nav-left').addEventListener('click', () => scrollTrack(-SCROLL_STEP));
    document.getElementById('nav-right').addEventListener('click', () => scrollTrack(SCROLL_STEP));

    // Frame-Coalesced Wheel & Virtual Windowing Scroll Listener
    const wrapper = document.getElementById('slices-wrapper');
    const track = document.getElementById('slices-track');
    if (wrapper && track) {
        let pendingWheelDelta = 0;
        let wheelFrame = null;

        wrapper.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                e.preventDefault();
                pendingWheelDelta += e.deltaY * 1.2;

                if (!wheelFrame) {
                    wheelFrame = requestAnimationFrame(() => {
                        track.scrollLeft += pendingWheelDelta;
                        pendingWheelDelta = 0;
                        wheelFrame = null;
                    });
                }
            }
        }, { passive: false });

        let scrollTicking = false;
        track.addEventListener('scroll', () => {
            if (!scrollTicking) {
                scrollTicking = true;
                requestAnimationFrame(() => {
                    renderVirtualWindow();
                    scrollTicking = false;
                });
            }
        }, { passive: true });
    }
}

function setFocusedCard(index) {
    if (!activeFilteredWallpapers.length) return;

    focusedCardIndex = Math.max(0, Math.min(index, activeFilteredWallpapers.length - 1));

    const track = document.getElementById('slices-track');
    if (track) {
        const targetLeft = focusedCardIndex * ITEM_WIDTH - (track.clientWidth - CARD_WIDTH) / 2;
        track.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }

    renderVirtualWindow();
}

function scrollTrack(delta) {
    const track = document.getElementById('slices-track');
    if (track) track.scrollLeft += delta;
}

async function loadWallpapers() {
    const track = document.getElementById('slices-track');
    track.innerHTML = '<div class="loading-msg">⚡ Loading wallpapers...</div>';

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

function filterAndRender() {
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
    renderFilteredWallpapers(sorted);
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

function renderFilteredWallpapers(wallpapers) {
    const track = document.getElementById('slices-track');
    document.getElementById('wall-count').textContent = `${wallpapers.length} wallpapers`;

    activeFilteredWallpapers = wallpapers;
    lastStartIndex = -1;
    lastEndIndex = -1;
    focusedCardIndex = -1;
    if (track) track.scrollLeft = 0;

    if (wallpapers.length === 0) {
        if (track) track.innerHTML = '<div class="loading-msg">No wallpapers found...</div>';
        mountedCards.clear();
        return;
    }

    renderVirtualWindow(true);
}

function renderVirtualWindow(force = false) {
    const track = document.getElementById('slices-track');
    if (!track || !activeFilteredWallpapers.length) return;

    let canvas = track.querySelector('.virtual-canvas');
    if (!canvas) {
        track.innerHTML = '';
        canvas = document.createElement('div');
        canvas.className = 'virtual-canvas';
        track.appendChild(canvas);
        mountedCards.clear();
    }

    const totalWidth = Math.max(0, activeFilteredWallpapers.length * ITEM_WIDTH - CARD_GAP);
    canvas.style.width = `${totalWidth}px`;

    const scrollLeft = track.scrollLeft;
    const viewportWidth = track.clientWidth || window.innerWidth;

    const visibleStartIndex = Math.floor(scrollLeft / ITEM_WIDTH);
    const visibleEndIndex = Math.ceil((scrollLeft + viewportWidth) / ITEM_WIDTH);

    const startIndex = Math.max(0, visibleStartIndex - OVERSCAN_BUFFER);
    const endIndex = Math.min(activeFilteredWallpapers.length, visibleEndIndex + OVERSCAN_BUFFER);

    if (!force && startIndex === lastStartIndex && endIndex === lastEndIndex) {
        return;
    }

    lastStartIndex = startIndex;
    lastEndIndex = endIndex;

    const requiredIds = new Set();

    for (let i = startIndex; i < endIndex; i++) {
        const wall = activeFilteredWallpapers[i];
        requiredIds.add(wall.id);

        let card = mountedCards.get(wall.id);
        if (!card) {
            card = createCard(wall, i);
            mountedCards.set(wall.id, card);
            canvas.appendChild(card);
        } else {
            card.dataset.cardIndex = i;
            if (i === focusedCardIndex) card.classList.add('keyboard-focused');
            else card.classList.remove('keyboard-focused');
        }

        card.style.transform = `translateX(${i * ITEM_WIDTH}px)`;
    }

    // Keyed DOM Recycling: remove offscreen cards
    for (const [id, card] of mountedCards) {
        if (!requiredIds.has(id)) {
            card.remove();
            mountedCards.delete(id);
        }
    }
}

function createCard(wall, cardIndex) {
    const card = document.createElement('div');
    const favoriteKey = wall.favoriteKey;
    const isFav = favoritePaths.has(favoriteKey);
    const isFocused = cardIndex === focusedCardIndex;
    card.className = `slice-card${isFav ? ' is-favorite' : ''}${isFocused ? ' keyboard-focused' : ''}`;
    card.dataset.cardIndex = cardIndex;
    card.title = `${wall.name} (${wall.sizeFormatted || ''})`;

    const img = document.createElement('img');
    img.className = 'preview-media';
    img.decoding = 'async';
    img.src = thumbOverrides.get(wall.id) || wall.thumbUrl;
    img.dataset.wallpaperId = wall.id;

    const favBtn = document.createElement('div');
    favBtn.className = `favorite-btn${isFav ? ' active' : ''}`;
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

    favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updatedFavs = await window.wallpaperAPI.toggleFavorite(wall.id);
        favoritePaths = new Set(updatedFavs || []);

        const nowFav = favoritePaths.has(favoriteKey);
        favBtn.className = `favorite-btn${nowFav ? ' active' : ''}`;
        favBtn.textContent = nowFav ? '★' : '☆';
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

    const badge = document.createElement('span');
    badge.className = `fmt-badge${wall.type === 'VIDEO' ? ' video' : ''}`;
    badge.textContent = wall.ext;

    const sizeBadge = document.createElement('span');
    sizeBadge.className = 'size-badge';
    sizeBadge.textContent = wall.sizeFormatted || '';

    card.appendChild(img);
    card.appendChild(favBtn);
    card.appendChild(badge);
    if (wall.sizeFormatted) card.appendChild(sizeBadge);

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
    icon.textContent = '🗑️';

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
            card.style.transform = 'scale(0.75) rotateY(-20deg)';
            setTimeout(() => {
                card.remove();
                mountedCards.delete(wall.id);
                filterAndRender();
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
