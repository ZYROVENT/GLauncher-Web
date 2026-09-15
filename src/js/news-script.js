document.addEventListener('DOMContentLoaded', () => {
    const versionsContainer = document.getElementById('versions-feed-container');
    const paginationContainer = document.getElementById('pagination-container');
    const searchInput = document.getElementById('version-search-input');
    
    const MOJANG_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    const CACHE_KEY = 'glauncher_mojang_versions_v7_exact_banners';
    const CACHE_EXPIRY = 1000 * 60 * 30; // 30 minutos

    const ITEMS_PER_PAGE = 12;
    let currentPage = 1;
    let allVersions = [];
    let filteredVersions = [];
    let currentFilter = 'all';
    let searchQuery = '';

    // Cache en memoria para datos de la wiki
    const wikiDataCache = {};

    /**
     * Construye todos los posibles nombres de File: para la Wiki según el tipo de versión.
     *
     * Convenciones de Minecraft Wiki:
     *   Release 1.0 – 1.21.11 :  File:1.21.4_banner.jpg  →  File:1.21_banner.jpg
     *   Release 1.26+          :  File:1.26.1_banner.jpg  →  File:1.26_banner.jpg  (mismo patrón)
     *   Release Candidate      :  File:1.21-rc1.jpg  /  File:1.26-rc1.jpg
     *   Pre-release            :  File:1.21-pre1.jpg  /  File:1.26-pre1.jpg
     *   Snapshot semanal       :  File:24w10a-snapshot-1.jpg  /  File:26w03a-snapshot-1.jpg
     *
     * El patrón File:{versionId}_banner.jpg cubre tanto las versiones antiguas
     * (1.0–1.21.x) como las nuevas desde 1.26 en adelante. La función extrae
     * el major (ej: "1.26" de "1.26.1") como fallback automático.
     */
    function buildBannerCandidates(versionId) {
        // major = primeros dos segmentos: "1.21" de "1.21.4",  "1.26" de "1.26.1"
        const majorMatch = versionId.match(/^(\d+\.\d+)/);
        const majorVer = majorMatch ? majorMatch[1] : null;
        const candidates = [];

        // ── Release Candidate ────────────────────────────────────────────────
        // Ej: 1.21-rc1 | 1.21.4-rc1 | 1.26-rc1 | 1.26.1-rc2
        const rcMatch = versionId.match(/^(\d+\.\d+(?:\.\d+)?)-rc(\d+)$/i);
        if (rcMatch) {
            candidates.push(`File:${versionId}.jpg`);
            candidates.push(`File:${versionId}.png`);
            candidates.push(`File:${rcMatch[1]}-rc${rcMatch[2]}.jpg`);
            if (majorVer && majorVer !== rcMatch[1]) {
                candidates.push(`File:${majorVer}-rc${rcMatch[2]}.jpg`);
            }
            if (majorVer) candidates.push(`File:${majorVer}_banner.jpg`);
            return candidates;
        }

        // ── Pre-release ──────────────────────────────────────────────────────
        // Ej: 1.21-pre1 | 1.21.4-pre2 | 1.26-pre1 | "1.26 Pre-Release 1"
        const preMatch = versionId.match(/^(\d+\.\d+(?:\.\d+)?)-pre(\d+)$/i)
            || versionId.match(/^(\d+\.\d+(?:\.\d+)?)\s+Pre-?Release\s+(\d+)$/i);
        if (preMatch) {
            candidates.push(`File:${preMatch[1]}-pre${preMatch[2]}.jpg`);
            candidates.push(`File:${preMatch[1]}-pre${preMatch[2]}.png`);
            candidates.push(`File:${versionId}.jpg`);
            if (majorVer && majorVer !== preMatch[1]) {
                candidates.push(`File:${majorVer}-pre${preMatch[2]}.jpg`);
            }
            if (majorVer) candidates.push(`File:${majorVer}_banner.jpg`);
            return candidates;
        }

        // ── Snapshot semanal ─────────────────────────────────────────────────
        // Ej: 24w10a | 25w05b | 26w03a
        const snapshotMatch = versionId.match(/^\d{2}w\d{2}[a-z]$/i);
        if (snapshotMatch) {
            candidates.push(`File:${versionId}-snapshot-1.jpg`);
            candidates.push(`File:${versionId}-snapshot-1.png`);
            candidates.push(`File:${versionId}_banner.jpg`);
            candidates.push(`File:${versionId}.jpg`);
            return candidates;
        }

        // ── Release estándar ─────────────────────────────────────────────────
        // Versiones antiguas (1.0 → 1.21.x): File:1.21.4_banner.jpg / File:1.21_banner.jpg
        // Versiones nuevas  (1.26+)         : File:1.26.1_banner.jpg / File:1.26_banner.jpg
        candidates.push(`File:${versionId}_banner.jpg`);
        candidates.push(`File:${versionId}_banner.png`);
        if (majorVer && majorVer !== versionId) {
            candidates.push(`File:${majorVer}_banner.jpg`);
            candidates.push(`File:${majorVer}_banner.png`);
        }
        candidates.push(`File:${versionId}.jpg`);
        return candidates;
    }

    /**
     * Consulta la API de Minecraft Wiki con los candidatos de banner exactos por tipo de versión.
     */
    async function fetchExactWikiBannerAndDetails(versionId) {
        if (wikiDataCache[versionId]) return wikiDataCache[versionId];

        try {
            const majorMatch = versionId.match(/^(\d+\.\d+)/);
            const majorVer = majorMatch ? majorMatch[1] : versionId;
            const fileCandidates = buildBannerCandidates(versionId);

            // Consultar todos los candidatos de archivo + página de la versión en una sola petición
            const titlesToQuery = [...fileCandidates, `Java Edition ${versionId}`].join('|');
            const url = `https://minecraft.wiki/api.php?action=query&titles=${encodeURIComponent(titlesToQuery)}&prop=imageinfo|pageimages|extracts&iiprop=url&piprop=original|thumbnail&pithumbsize=600&exintro=1&explaintext=1&format=json&origin=*`;

            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();

            let bannerUrl = null;
            let extractText = null;

            if (data.query && data.query.pages) {
                const pages = data.query.pages;

                // Buscar el primer candidato que tenga imageinfo (respeta el orden de prioridad)
                for (const candidate of fileCandidates) {
                    for (const pid in pages) {
                        const page = pages[pid];
                        if (page.title === candidate && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
                            bannerUrl = page.imageinfo[0].url;
                            break;
                        }
                    }
                    if (bannerUrl) break;
                }

                // Extraer descripción del artículo de la versión
                for (const pid in pages) {
                    const page = pages[pid];
                    if (page.title === `Java Edition ${versionId}`) {
                        if (page.extract) extractText = page.extract.trim();
                        if (!bannerUrl) {
                            if (page.original && page.original.source) bannerUrl = page.original.source;
                            else if (page.thumbnail && page.thumbnail.source) bannerUrl = page.thumbnail.source;
                        }
                    }
                }
            }

            // Último fallback: URL directa canónica con el primer candidato
            if (!bannerUrl && fileCandidates.length > 0) {
                const firstFile = fileCandidates[0].replace('File:', '');
                bannerUrl = `https://minecraft.wiki/images/${encodeURIComponent(firstFile)}`;
            }

            const result = { banner: bannerUrl, extract: extractText };
            wikiDataCache[versionId] = result;
            return result;
        } catch (e) {
            // Silencioso
        }
        return null;
    }

    /**
     * Base de conocimiento con novedades de changelog estructuradas en español
     */
    const VERSION_CHANGELOG_PRESETS = {
        '1.21.4': [
            'Adición del bioma pálido The Pale Garden y el mob hostil The Creaking.',
            'Nuevo Corazón de Creaking, madera de roble pálido y resina decorativa.',
            'Ajustes de sincronización y rendimiento en combate multijugador.'
        ],
        '1.21.3': [
            'Solución de fallos en la generación procedural de Trial Chambers.',
            'Mejoras en el uso de bolsas (Bundles) y tintado de colores.',
            'Optimizaciones en la carga de texturas y shaders de iluminación.'
        ],
        '1.21.2': [
            'Lanzamiento oficial de las Bolsas (Bundles) para gestión de inventario.',
            'Actualización del comportamiento de los lobos y murciélagos.',
            'Mejoras en comandos del servidor y paquetes de datos.'
        ],
        '1.21.1': [
            'Corrección de vulnerabilidades y estabilidad en servidores Realms.',
            'Parches de sincronización en el protocolo de red multijugador.'
        ],
        '1.21': [
            'Tricky Trials: Nuevas estructuras subterráneas Trial Chambers y mob The Breeze.',
            'Arma pesada de ataque: La Maza (Mace) y cargas de viento (Wind Charges).',
            'Bloques de Cobre y Toba cincelada, bombillas y puertas automáticas.',
            'Efecto Omen rediseñado y generadores de desafíos con recompensas únicas.'
        ],
        '1.20.4': [
            'Corrección de un bug crítico en la pérdida de ítems en jarrones decorativos.',
            'Parches de estabilidad en servidores multijugador.'
        ],
        '1.20.2': [
            'Optimización en la velocidad de renderizado de chunks en PvP.',
            'Rebalanceo de libros de encantamientos en aldeanos bibliotecarios.',
            'Actualización del protocolo de red de conexiones.'
        ],
        '1.20': [
            'Trails & Tales: Camellos montables, mob Sniffer y bioma de Cerezos (Cherry Grove).',
            'Sistema de Arqueología: Pincel, arena sospechosa y fragmentos de cerámica.',
            'Adornos de Armadura (Armor Trims) y madera de bambú artesanal.'
        ],
        '1.19.4': [
            'Nuevos comandos `/damage` y `/ride` incorporados.',
            'Ajustes de accesibilidad y optimización en renderizado de luz.'
        ],
        '1.19': [
            'The Wild Update: Ciudades Antiguas (Ancient Cities) y criatura The Warden.',
            'Bioma Deep Dark con sensores y catalizadores Sculk.',
            'Manglares de lodo, ranas, renacuajos y barcas con cofre.'
        ],
        '1.18.2': [
            'Mejoras en el comando `/locate` y soporte de tags personalizados.',
            'Corrección de bugs de renderizado de cuevas de estalactitas.'
        ],
        '1.18': [
            'Caves & Cliffs Parte II: Expansión de altura del mundo de Y -64 a Y 320.',
            'Generación de montañas colosales y mega cuevas de queso, espagueti y fideos.',
            'Nueva mezcla de biomas (Biome Blend) y música ambiental de Lena Raine.'
        ],
        '1.17.1': [
            'Ajustes en la reproducción de axolotes y obtención de diamantes.',
            'Parches de seguridad y compatibilidad Java 16+.'
        ],
        '1.16.5': [
            'Parches críticos de estabilidad y exploits en servidores multijugador.',
            'Versión más popular para modpacks de rendimiento y mods técnicos.'
        ],
        '1.16': [
            'Nether Update: Netherita (Netherite), Piglins, Hoglins y Zoglins.',
            'Biomas del Nether: Crimson Forest, Warped Forest, Soul Sand Valley y Basalt Deltas.',
            'Anclas de reaparición (Respawn Anchor) y magnetita.'
        ],
        '1.15.2': [
            'Buzzy Bees: Abejas, colmenas, panales, bloques de miel y botellas de miel.',
            'Corrección de más de 300 bugs y optimización del motor de físicas.'
        ],
        '1.14.4': [
            'Village & Pillage: Rediseño total de aldeas, saqueadores (Pillagers), Illagers y Raids.',
            'Nuevas mesas de trabajo (Herrería, Cartografía, Fletchero, Ahumador, Alto Horno).'
        ],
        '1.13.2': [
            'Update Aquatic: Océanos completos con corales, delfines, ahogados, tridentes y barcos hundidos.',
            'Nueva física de agua en bloques y conductos marinos.'
        ],
        '1.12.2': [
            'La versión dorada y estándar histórica del modding de Forge en Minecraft.',
            'World of Color Update: Bloques de concreto, terracota vidriada y loros.',
            'Sistema de libro de recetas y logros por avances (Advancements).'
        ],
        '1.8.9': [
            'La versión reina definitiva de PvP clásico sin cooldown de ataque.',
            'Monumento Oceánico, Guardianes, Prismarina y esponjas húmedas.',
            'Banderas personalizadas, soporte de bloques de slime rebotantes y armaduras.'
        ],
        '1.7.10': [
            'The Update that Changed the World: Clásico indiscutible del modding.',
            'Generación masiva de nuevos biomas (Mesa, Savanna, Roofed Forest, etc).',
            'Nuevos tipos de madera: Acacia y Roble Oscuro.'
        ]
    };

    /**
     * Obtiene los cambios clave para una versión
     */
    function getVersionChanges(v) {
        if (VERSION_CHANGELOG_PRESETS[v.id]) {
            return VERSION_CHANGELOG_PRESETS[v.id];
        }

        if (v.id.startsWith('24w') || v.id.startsWith('25w')) {
            return [
                `Instantánea semanal de desarrollo oficial de Mojang (${v.id}).`,
                'Pruebas del bioma Pale Garden, Creaking y nuevas mecánicas experimentales.',
                'Ajustes internos de paquetes de datos y optimización de entidades.'
            ];
        } else if (v.id.startsWith('23w')) {
            return [
                `Instantánea de desarrollo para la actualización 1.21 Tricky Trials (${v.id}).`,
                'Generación de estructuras Trial Chambers y mob The Breeze.',
                'Nuevos bloques de cobre decorativo y generadores de combate.'
            ];
        } else if (v.type === 'release') {
            return [
                `Lanzamiento oficial estable para la rama Java ${v.id}.`,
                'Optimización del motor de renderizado y sincronización multijugador.',
                'Corrección de errores reportados en las versiones pre-release previas.'
            ];
        } else if (v.type === 'snapshot') {
            if (v.id.includes('-pre') || v.id.includes('Pre-Release')) {
                return [
                    `Pre-Release de prueba oficial enfocada en estabilidad.`,
                    'Correcciones en físicas de bloques e interacciones con entidades.',
                    'Preparación final del protocolo de red antes de la Release.'
                ];
            } else if (v.id.includes('-rc') || v.id.includes('RC')) {
                return [
                    `Candidata de lanzamiento final (Release Candidate).`,
                    'Parches críticos de bugs de último momento.',
                    'Verificación de compatibilidad con paquetes de recursos.'
                ];
            }
            return [
                `Instantánea semanal de desarrollo (${v.id}).`,
                'Nuevas mecánicas experimentales y ajustes en la IA de criaturas.',
                'Actualización de tags de datos, recetas y comandos del juego.'
            ];
        } else if (v.type === 'old_beta') {
            return [
                'Actualización del código base de la era Beta clásica de Minecraft.',
                'Adición de mecánicas clásicas de supervivencia y generación de terreno.'
            ];
        } else {
            return [
                'Compilación temprana del motor clásico de Minecraft.',
                'Registro histórico de desarrollo preservado por Mojang.'
            ];
        }
    }

    /**
     * Crear tarjeta visual de versión con banner exacto de la wiki
     */
    function createVersionCard(v) {
        const card = document.createElement('div');
        
        const isRelease = v.type === 'release';
        const isSnapshot = v.type === 'snapshot';
        const badgeClass = isRelease ? 'badge-release' : (isSnapshot ? 'badge-snapshot' : 'badge-old');
        const cardTypeClass = isRelease ? 'is-release' : (isSnapshot ? 'is-snapshot' : '');
        
        const badgeLabel = isRelease 
            ? '<i class="fas fa-check-circle"></i> Release Oficial' 
            : (isSnapshot ? '<i class="fas fa-flask"></i> Snapshot / Beta' : '<i class="fas fa-archive"></i> Clásica');

        card.className = `version-card ${cardTypeClass}`;

        const relDate = new Date(v.releaseTime);
        const formattedRelDate = relDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        
        // Intento directo del banner de la wiki para esta versión
        const directBannerCandidate = `https://minecraft.wiki/images/${encodeURIComponent(v.id)}_banner.jpg`;
        const fallbackBanner = `https://minecraft.wiki/images/1.21_banner.jpg`;

        const changesList = getVersionChanges(v);
        const wikiSearchUrl = `https://minecraft.wiki/w/Java_Edition_${encodeURIComponent(v.id)}`;
        const changesHtml = changesList.map(item => `<li><i class="fas fa-chevron-right"></i> <span>${item}</span></li>`).join('');
        const safeId = v.id.replace(/[^a-zA-Z0-9]/g, '-');

        card.innerHTML = `
            <!-- Banner Oficial de la Versión con Badges Superpuestos -->
            <div class="version-media-wrapper">
                <span class="version-badge-overlay ${badgeClass}">${badgeLabel}</span>
                <span class="version-date-overlay"><i class="fas fa-calendar-alt"></i> ${formattedRelDate}</span>
                <img id="wiki-banner-${safeId}" src="${directBannerCandidate}" alt="Banner Minecraft ${v.id}" class="version-screenshot-img" loading="lazy" onerror="this.onerror=null;this.src='${fallbackBanner}';">
            </div>

            <!-- Cuerpo de la Tarjeta -->
            <div class="version-card-body">
                <h3 class="version-card-title">
                    <i class="fas fa-cube text-neon-green"></i> ${v.id}
                </h3>

                <!-- Resumen oficial extraído de Wiki -->
                <p id="wiki-summary-${safeId}" class="version-card-desc">
                    Compilación oficial registrada en el Manifiesto de Mojang para Minecraft Java Edition.
                </p>

                <!-- Caja de Cambios Clave -->
                <div class="version-changes-box">
                    <div class="changes-title">
                        <i class="fas fa-list-check"></i> Novedades & Cambios Clave
                    </div>
                    <ul class="changes-list">
                        ${changesHtml}
                    </ul>
                </div>

                <!-- Botones de Acción -->
                <div class="version-actions">
                    <a href="${v.url}" target="_blank" rel="noopener noreferrer" class="btn-manifest-json" title="Ver archivo de metadatos oficial JSON en Mojang">
                        <i class="fas fa-file-code"></i> JSON Mojang
                    </a>
                    <a href="${wikiSearchUrl}" target="_blank" rel="noopener noreferrer" class="btn-wiki-link" title="Ver changelog y banner original en Minecraft Wiki">
                        <i class="fas fa-book-open"></i> Wiki
                    </a>
                </div>
            </div>
        `;

        // Consultar la API de la Wiki para obtener la URL exacta del archivo y el extracto
        fetchExactWikiBannerAndDetails(v.id).then(details => {
            if (details) {
                if (details.banner) {
                    const imgEl = card.querySelector(`#wiki-banner-${safeId}`);
                    if (imgEl && imgEl.src !== details.banner) {
                        imgEl.src = details.banner;
                    }
                }
                if (details.extract) {
                    const descEl = card.querySelector(`#wiki-summary-${safeId}`);
                    if (descEl) {
                        const cleanExtract = details.extract.split('\n')[0].substring(0, 160) + '...';
                        descEl.textContent = cleanExtract;
                    }
                }
            }
        });

        return card;
    }

    /**
     * Renderizar versiones con filtros y búsqueda
     */
    function renderVersions() {
        if (!versionsContainer) return;
        versionsContainer.innerHTML = '';

        let results = filteredVersions;
        if (searchQuery) {
            results = results.filter(v => 
                v.id.toLowerCase().includes(searchQuery) ||
                v.type.toLowerCase().includes(searchQuery)
            );
        }

        if (results.length === 0) {
            versionsContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: #94a3b8;">
                    <i class="fas fa-cube" style="font-size: 3rem; margin-bottom: 15px; color: var(--neon-pink);"></i>
                    <h3 style="color: #fff; margin-bottom: 8px;">No se encontró la versión "${searchQuery}"</h3>
                    <p>Prueba buscando con otro término (ej: 1.21.4, 1.20, 24w, 1.8.9, snapshot).</p>
                </div>
            `;
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = results.slice(start, end);

        pageItems.forEach(v => versionsContainer.appendChild(createVersionCard(v)));
        renderPagination(results.length);
    }

    /**
     * Renderizar barra de paginación
     */
    function renderPagination(totalItems) {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;

        // Botón Anterior
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => changePage(currentPage - 1);
        paginationContainer.appendChild(prevBtn);

        // Ventana de páginas
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        if (startPage > 1) {
            const firstBtn = document.createElement('button');
            firstBtn.className = 'pagination-btn';
            firstBtn.textContent = '1';
            firstBtn.onclick = () => changePage(1);
            paginationContainer.appendChild(firstBtn);
            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.color = '#64748b';
                dots.style.padding = '0 5px';
                paginationContainer.appendChild(dots);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => changePage(i);
            paginationContainer.appendChild(btn);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.color = '#64748b';
                dots.style.padding = '0 5px';
                paginationContainer.appendChild(dots);
            }
            const lastBtn = document.createElement('button');
            lastBtn.className = 'pagination-btn';
            lastBtn.textContent = totalPages;
            lastBtn.onclick = () => changePage(totalPages);
            paginationContainer.appendChild(lastBtn);
        }

        // Botón Siguiente
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => changePage(currentPage + 1);
        paginationContainer.appendChild(nextBtn);
    }

    function changePage(page) {
        currentPage = page;
        renderVersions();
        window.scrollTo({ top: 320, behavior: 'smooth' });
    }

    /**
     * Procesar respuesta del Manifest
     */
    function processManifestData(manifest) {
        const statLatestRelease = document.getElementById('stat-latest-release');
        const statLatestSnapshot = document.getElementById('stat-latest-snapshot');
        const statTotalVersions = document.getElementById('stat-total-versions');

        if (manifest.latest) {
            if (statLatestRelease) statLatestRelease.textContent = manifest.latest.release || 'N/A';
            if (statLatestSnapshot) statLatestSnapshot.textContent = manifest.latest.snapshot || 'N/A';
        }
        if (manifest.versions && statTotalVersions) {
            statTotalVersions.textContent = manifest.versions.length;
        }

        allVersions = manifest.versions || [];
        filteredVersions = allVersions;

        // Contadores
        let relCount = 0, snapCount = 0, oldAlphaCount = 0, oldBetaCount = 0;
        allVersions.forEach(v => {
            if (v.type === 'release') relCount++;
            else if (v.type === 'snapshot') snapCount++;
            else if (v.type === 'old_alpha') oldAlphaCount++;
            else if (v.type === 'old_beta') oldBetaCount++;
        });

        const cAll = document.getElementById('vcount-all');
        const cRel = document.getElementById('vcount-release');
        const cSnap = document.getElementById('vcount-snapshot');
        const cOld = document.getElementById('vcount-old');

        if (cAll) cAll.textContent = `(${allVersions.length})`;
        if (cRel) cRel.textContent = `(${relCount})`;
        if (cSnap) cSnap.textContent = `(${snapCount})`;
        if (cOld) cOld.textContent = `(${oldAlphaCount + oldBetaCount})`;

        renderVersions();
    }

    /**
     * Cargar Manifest desde Mojang API o Caché Ligero
     */
    async function loadManifest() {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                const now = new Date().getTime();
                if (now - parsed.timestamp < CACHE_EXPIRY) {
                    processManifestData(parsed.data);
                    return;
                }
            } catch(e) {}
        }

        try {
            const res = await fetch(MOJANG_MANIFEST_URL);
            if (!res.ok) throw new Error("Error al obtener Version Manifest de Mojang");
            const data = await res.json();

            try {
                const lightweightData = {
                    latest: data.latest,
                    versions: (data.versions || []).map(v => ({
                        id: v.id,
                        type: v.type,
                        url: v.url,
                        time: v.time,
                        releaseTime: v.releaseTime
                    }))
                };
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: new Date().getTime(),
                    data: lightweightData
                }));
            } catch(storageErr) {}

            processManifestData(data);
        } catch (error) {
            console.error("Error al cargar Version Manifest:", error);
            if (versionsContainer) {
                versionsContainer.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--neon-pink);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; margin-bottom: 10px;"></i>
                        <p>No se pudo sincronizar con el Version Manifest de Mojang. Inténtalo de nuevo más tarde.</p>
                    </div>
                `;
            }
        }
    }

    // Filtros de categoría de versión
    const filterBtns = document.querySelectorAll('.v-pill');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentFilter = btn.dataset.vtype;
            if (currentFilter === 'all') {
                filteredVersions = allVersions;
            } else if (currentFilter === 'old') {
                filteredVersions = allVersions.filter(v => v.type === 'old_alpha' || v.type === 'old_beta');
            } else {
                filteredVersions = allVersions.filter(v => v.type === currentFilter);
            }
            currentPage = 1;
            renderVersions();
        });
    });

    // Búsqueda en vivo
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.toLowerCase().trim();
                currentPage = 1;
                renderVersions();
            }, 200);
        });
    }

    // Iniciar carga del manifest
    loadManifest();
});