// UI constants
const SCROLL_STEP = 500;       // px per arrow-key/button press
const WHEEL_MULTIPLIER = 3;    // wheel scroll speed multiplier
const APPLY_CLOSE_DELAY = 300; // ms before closing after applying wallpaper
const CARD_FADE_DURATION = 220; // ms for card delete animation

let allWallpapers = [];
let favoritePaths = new Set();
let currentSort = 'name-asc';
let focusedCardIndex = -1;

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

            document.querySelectorAll(`[data-wallpaper-id="${CSS.escape(id)}"]`).forEach(img => {
                const sep = thumbUrl.includes('?') ? '&' : '?';
                img.src = `${thumbUrl}${sep}t=${Date.now()}`;
            });
        });
    }
}

function setupControls() {
    const searchInput = document.getElementById('search-input');
    const sortBtn = document.getElementById('sort-btn');
    const sortDropdown = document.getElementById('sort-dropdown');

    document.getElementById('close-btn').addEventListener('click', () => window.wallpaperAPI.close());
    
    // Keyboard Navigation & Shortcuts (R5)
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
            return; // Do not trigger card navigation while typing in search
        }

        if (e.key === 'ArrowRight' || e.key === 'l') {
            setFocusedCard(focusedCardIndex + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'h') {
            setFocusedCard(focusedCardIndex - 1);
        } else if (e.key === 'Enter' && focusedCardIndex >= 0 && focusedCardIndex < cards.length) {
            cards[focusedCardIndex].click();
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

    // Instant no-lag wheel scroll
    const wrapper = document.getElementById('slices-wrapper');
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        document.getElementById('slices-track').scrollLeft += e.deltaY * WHEEL_MULTIPLIER;
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
    targetCard.classList.add('keyboard-focused');

    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function scrollTrack(delta) {
    const track = document.getElementById('slices-track');
    track.scrollLeft += delta;
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
    track.innerHTML = '';
    focusedCardIndex = -1;

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
    const favoriteKey = wall.favoriteKey;
    const isFav = favoritePaths.has(favoriteKey);
    card.className = `slice-card${isFav ? ' is-favorite' : ''}`;
    card.title = `${wall.name} (${wall.sizeFormatted || ''})`;

    const img = document.createElement('img');
    img.className = 'preview-media';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = wall.thumbUrl;
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

    // apply (A3 Fix: Guard against multiple clicks)
    let isApplying = false;
    card.addEventListener('click', async () => {
        if (isApplying) return;
        isApplying = true;
        card.style.outline = '2px solid #89b4fa';
        try {
            const res = await window.wallpaperAPI.apply(wall.id);
            if (res && res.ok) {
                setTimeout(() => window.wallpaperAPI.close(), APPLY_CLOSE_DELAY);
            } else {
                card.style.outline = '2px solid #f38ba8';
            }
        } finally {
            isApplying = false;
        }
    });

    // delete
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
