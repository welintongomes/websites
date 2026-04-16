// Configuração do IndexedDB
        const DB_NAME = 'SitesManagerDB';
        const DB_VERSION = 1;
        const STORE_NAME = 'sites';

        let currentPage = 0;
        const ITEMS_PER_PAGE = 3;

        async function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    }
                };
            });
        }
        
        //variaveis globais
        let sites = [];
        let currentSiteIndex = -1;
        let editingIndex = -1;
        let lastOpenedSiteIndex = -1;
        let siteToExportIndex = -1; // Variável nova para o modal individual

        // ==========================================
        // LÓGICA DO EDITOR HOLOGRÁFICO E BUSCA
        // ==========================================
        let codeMatchPositions = [];
        let currentCodeMatchIndex = -1;
        const textarea = document.getElementById('siteCode');
        const backdrop = document.getElementById('siteCodeBackdrop');

        textarea.addEventListener('scroll', () => {
            backdrop.scrollTop = textarea.scrollTop;
            backdrop.scrollLeft = textarea.scrollLeft;
        });

        textarea.addEventListener('input', () => {
            if (codeMatchPositions.length > 0) resetCodeSearch();
        });

        function resetCodeSearch() {
            document.getElementById('codeSearchInput').value = '';
            document.getElementById('codeSearchCount').textContent = '0/0';
            document.getElementById('clearCodeSearchBtn').style.display = 'none';
            codeMatchPositions = [];
            currentCodeMatchIndex = -1;
            backdrop.innerHTML = ''; 
        }

        function escapeHtml(unsafe) {
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        }

        function performCodeSearch() {
            codeMatchPositions = [];
            currentCodeMatchIndex = -1;
            const query = document.getElementById('codeSearchInput').value.toLowerCase();
            const text = textarea.value;
            const lowerText = text.toLowerCase();

            if (!query) { resetCodeSearch(); return; }

            document.getElementById('clearCodeSearchBtn').style.display = 'block';

            let startIndex = 0, index;
            while ((index = lowerText.indexOf(query, startIndex)) > -1) {
                codeMatchPositions.push({ start: index, end: index + query.length });
                startIndex = index + query.length;
            }

            if (codeMatchPositions.length > 0) {
                let backdropHtml = ''; let lastPos = 0;
                codeMatchPositions.forEach((pos, i) => {
                    backdropHtml += escapeHtml(text.substring(lastPos, pos.start));
                    backdropHtml += `<mark class="mark-match" id="match-${i}">${escapeHtml(text.substring(pos.start, pos.end))}</mark>`;
                    lastPos = pos.end;
                });
                backdropHtml += escapeHtml(text.substring(lastPos));
                if (text.endsWith('\n')) backdropHtml += '\n ';

                backdrop.innerHTML = backdropHtml;
                currentCodeMatchIndex = 0;
                highlightCurrentCodeMatch(); 
            } else {
                backdrop.innerHTML = escapeHtml(text);
                document.getElementById('codeSearchCount').textContent = '0/0';
            }
        }

        function highlightCurrentCodeMatch() {
            if (codeMatchPositions.length === 0) return;
            document.getElementById('codeSearchCount').textContent = `${currentCodeMatchIndex + 1}/${codeMatchPositions.length}`;
            
            document.querySelectorAll('.mark-match').forEach(el => el.classList.remove('mark-active'));
            const currentMark = document.getElementById(`match-${currentCodeMatchIndex}`);
            
            if (currentMark) {
                currentMark.classList.add('mark-active');
                backdrop.scrollTop = currentMark.offsetTop - (backdrop.clientHeight / 2) + (currentMark.clientHeight / 2);
                backdrop.scrollLeft = currentMark.offsetLeft - (backdrop.clientWidth / 2);
                textarea.scrollTop = backdrop.scrollTop;
                textarea.scrollLeft = backdrop.scrollLeft;
            }
        }

        function nextCodeMatch() {
            if (codeMatchPositions.length === 0) return;
            currentCodeMatchIndex = (currentCodeMatchIndex + 1) % codeMatchPositions.length;
            highlightCurrentCodeMatch(); 
        }

        function prevCodeMatch() {
            if (codeMatchPositions.length === 0) return;
            currentCodeMatchIndex = (currentCodeMatchIndex - 1 + codeMatchPositions.length) % codeMatchPositions.length;
            highlightCurrentCodeMatch();
        }

        // Suporte à tecla TAB no editor de código
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + "\t" + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 1;
                if(backdrop.innerHTML !== '') { backdrop.innerHTML = escapeHtml(this.value); resetCodeSearch(); }
            }
        });

        // Carregar sites do armazenamento ou criar site exemplo
        async function loadSites() {
            try {
                const db = await initDB();
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    if (request.result.length > 0) {
                        sites = request.result.map(item => ({
                            name: item.name,
                            description: item.description,
                            code: item.code
                        }));
                    } else {
                        sites = [{
                            name: "Contador de Cliques",
                            description: "Ferramenta simples para contar cliques",
                            code: `<!DOCTYPE html>
<html lang="pt-BR">
<head><style>body { text-align: center; padding: 50px; font-family: sans-serif; }</style></head>
<body>
    <h1>0</h1>
    <button onclick="document.querySelector('h1').innerText = parseInt(document.querySelector('h1').innerText) + 1">Clicar!</button>
</body>
</html>`
                        }];
                        saveSites();
                    }

                    const savedLastOpened = localStorage.getItem('lastOpenedSiteIndex');
                    if (savedLastOpened !== null) {
                        const index = parseInt(savedLastOpened);
                        if (index >= 0 && index < sites.length) {
                            lastOpenedSiteIndex = index;
                        }
                    }

                    renderSites();
                };
            } catch (error) {
                console.error('Erro ao carregar sites:', error);
                renderSites();
            }
        }

        // Salvar sites no armazenamento indexedb
        async function saveSites() {
            try {
                const db = await initDB();
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const clearRequest = store.clear();
                clearRequest.onsuccess = () => {
                    sites.forEach(site => {
                        store.add(site);
                    });
                };
            } catch (error) {
                console.error('Erro ao salvar sites:', error);
            }
        }

        // Renderizar lista de sites
        function renderSites(append = false) {
            const grid = document.getElementById('sitesGrid');

            if (!append) {
                grid.innerHTML = '';
                currentPage = 0;
            }

            let sitesToRender = sites.slice().reverse();
            if (lastOpenedSiteIndex >= 0) {
                const lastOpenedSite = sites[lastOpenedSiteIndex];
                sitesToRender = sitesToRender.filter(site => site !== lastOpenedSite);
                sitesToRender.unshift(lastOpenedSite);
            }

            const start = currentPage * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const pageItems = sitesToRender.slice(start, end);

            pageItems.forEach((site) => {
                const index = sites.indexOf(site);
                const card = document.createElement('div');
                card.className = 'site-card';
                // MODIFICADO: Adicionado botão Exportar no cartão
                card.innerHTML = `
            <h3 onclick="openSite(${index})" title="Clique para abrir a ferramenta">${site.name}</h3>
            <p>${site.description || 'Sem descrição'}</p>
            <div class="site-actions">
                <button class="btn btn-primary" onclick="openSite(${index})">Abrir</button>
                <button class="btn edit-btn" onclick="editSite(${index})">Editar</button>
                <button class="btn btn-secondary" onclick="openExportSingleModal(${index})">Exportar</button>
                <button class="btn btn-danger" onclick="deleteSite(${index})">Excluir</button>
            </div>
        `;
                grid.appendChild(card);
            });

            if (end < sitesToRender.length) {
                const loadBtn = document.createElement('button');
                loadBtn.className = 'btn btn-secondary';
                loadBtn.textContent = `Carregar mais (${sitesToRender.length - end} restantes)`;
                loadBtn.style.cssText = 'width:100%; margin-top:10px; grid-column: 1/-1;';
                loadBtn.onclick = () => {
                    currentPage++;
                    loadBtn.remove();
                    renderSites(true);
                };
                grid.appendChild(loadBtn);
            }
        }

        //Adicionar funcionalidade de pesquisa
        function filterSites(searchTerm) {
            if (!searchTerm.trim()) {
                renderSites();
                return;
            }

            const searchWords = searchTerm.trim().split(/\s+/).map(word => normalizeText(word));

            const filteredSites = sites.filter(site => {
                const normalizedName = normalizeText(site.name);
                const normalizedDesc = site.description ? normalizeText(site.description) : '';

                if (searchWords.length === 1) {
                    return normalizedName.includes(searchWords[0]) || normalizedDesc.includes(searchWords[0]);
                } else {
                    const nameContainsAll = searchWords.every(word => normalizedName.includes(word));
                    const descContainsAll = searchWords.every(word => normalizedDesc.includes(word));
                    return nameContainsAll || descContainsAll;
                }
            });

            const grid = document.getElementById('sitesGrid');
            grid.innerHTML = '';

            if (filteredSites.length === 0) {
                grid.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhum site encontrado</p>';
                return;
            }
            
            let sitesToRender = filteredSites.slice().reverse();
            if (lastOpenedSiteIndex >= 0) {
                const lastOpenedSite = sites[lastOpenedSiteIndex];
                if (filteredSites.includes(lastOpenedSite)) {
                    sitesToRender = sitesToRender.filter(site => site !== lastOpenedSite);
                    sitesToRender.unshift(lastOpenedSite);
                }
            }
            sitesToRender.forEach((site) => {
                const originalIndex = sites.indexOf(site);
                const card = document.createElement('div');
                card.className = 'site-card';
                // MODIFICADO: Adicionado botão Exportar
                card.innerHTML = `
                    <h3 onclick="openSite(${originalIndex})" title="Clique para abrir a ferramenta">${site.name}</h3>
                    <p>${site.description || 'Sem descrição'}</p>
                    <div class="site-actions">
                        <button class="btn btn-primary" onclick="openSite(${originalIndex})">Abrir</button>
                        <button class="btn edit-btn" onclick="editSite(${originalIndex})">Editar</button>
                        <button class="btn btn-secondary" onclick="openExportSingleModal(${originalIndex})">Exportar</button>
                        <button class="btn btn-danger" onclick="deleteSite(${originalIndex})">Excluir</button>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

// Abrir site em tela cheia
        function openSite(index) {
            currentSiteIndex = index;
            lastOpenedSiteIndex = index;
            localStorage.setItem('lastOpenedSiteIndex', index.toString());
            console.log('Site aberto - índice:', index, 'nome:', sites[index].name);
            const site = sites[index];
            document.getElementById('fullscreenTitle').textContent = site.name;
            
            const iframe = document.getElementById('siteFrame');
            iframe.srcdoc = '';
            iframe.srcdoc = site.code;

            document.getElementById('fullscreenOverlay').style.display = 'block';
            
            // 💤 HIBERNAÇÃO CORRIGIDA: Oculta os itens um por um para não esconder o overlay
            document.querySelector('.container').style.display = 'none';
            document.querySelector('.search-container').style.display = 'none';
            document.querySelector('.fundo').style.display = 'none';
            document.querySelector('.add-site-btn').style.display = 'none';
            document.querySelector('.search-random-btn').style.display = 'none';
        }

       
// Fechar tela cheia e Acordar o sistema (COM TRITURADOR DE MEMÓRIA)
        function closeFullscreen() {
            const oldIframe = document.getElementById('siteFrame');
            
            // ☀️ ACORDAR O SISTEMA: Devolve o padrão original de cada botão
            document.querySelector('.container').style.display = '';
            document.querySelector('.search-container').style.display = '';
            document.querySelector('.fundo').style.display = '';
            document.querySelector('.add-site-btn').style.display = '';
            document.querySelector('.search-random-btn').style.display = '';
            
            // 🗑️ LIXEIRA DE IFRAME: Destrói o iframe velho para limpar a memória RAM
            const newIframe = document.createElement('iframe');
            newIframe.className = 'site-frame';
            newIframe.id = 'siteFrame';
            // Recria exatamente com o mesmo estilo do seu HTML original
            newIframe.style.cssText = 'width:100%; height:100%; border:none; background:#fff;';
            
            // Troca o velho pelo novo (isso apaga o site anterior da memória completamente)
            oldIframe.replaceWith(newIframe);
            
            document.getElementById('fullscreenOverlay').style.display = 'none';
            currentSiteIndex = -1;
            renderSites();
        }


        // Abrir modal para adicionar site
        function openAddSiteModal() {
            editingIndex = -1;
            document.getElementById('modalTitle').textContent = 'Adicionar Nova Ferramenta';
            document.getElementById('siteName').value = '';
            document.getElementById('siteDescription').value = '';
            document.getElementById('siteCode').value = '';
            resetCodeSearch(); // <- Limpa a busca anterior
            document.getElementById('siteModal').style.display = 'block';
        }

        // Editar site
        function editSite(index) {
            if (index < 0 || index >= sites.length) {
                console.error('Índice de site inválido:', index);
                return;
            }

            editingIndex = index;
            const site = sites[index];
            document.getElementById('modalTitle').textContent = 'Editar Ferramenta';
            document.getElementById('siteName').value = site.name;
            document.getElementById('siteDescription').value = site.description || '';
            document.getElementById('siteCode').value = site.code;
            resetCodeSearch(); // <- Limpa a busca anterior
            document.getElementById('siteModal').style.display = 'block';
        }
        
        function deleteSite(index) {
            if (index < 0 || index >= sites.length) return;

            const site = sites[index];
            if (confirm(`Tem certeza que deseja excluir "${site.name}"?`)) {
                sites.splice(index, 1);
                if (lastOpenedSiteIndex === index) {
                    lastOpenedSiteIndex = -1;
                    localStorage.removeItem('lastOpenedSiteIndex');
                } else if (lastOpenedSiteIndex > index) {
                    lastOpenedSiteIndex--;
                    localStorage.setItem('lastOpenedSiteIndex', lastOpenedSiteIndex.toString());
                }
                saveSites();
                renderSites();
            }
        }

        function editCurrentSite() {
            if (currentSiteIndex >= 0 && currentSiteIndex < sites.length) {
                const indexToEdit = currentSiteIndex; 
                closeFullscreen();
                setTimeout(() => {
                    editSite(indexToEdit);
                }, 100);
            }
        }

        function closeSiteModal() {
            document.getElementById('siteModal').style.display = 'none';
        }

        document.getElementById('siteForm').addEventListener('submit', function (e) {
            e.preventDefault();

            const name = document.getElementById('siteName').value;
            const description = document.getElementById('siteDescription').value;
            const code = document.getElementById('siteCode').value;

            const siteData = { name, description, code };

            if (editingIndex >= 0) {
                sites[editingIndex] = siteData;
            } else {
                sites.push(siteData);
            }

            saveSites();
            renderSites();
            closeSiteModal();
        });


        // -----------------------------------------------------------
        // LÓGICA DE EXPORTAÇÃO (MODAIS E JSZIP)
        // -----------------------------------------------------------

        function sanitizeFilename(name) { 
            return name.replace(/[^a-z0-9]/gi, '_').toLowerCase(); 
        }

        function openExportAllModal() { document.getElementById('exportAllModal').style.display = 'block'; }
        function closeExportAllModal() { document.getElementById('exportAllModal').style.display = 'none'; }
        
        function openExportSingleModal(index) {
            siteToExportIndex = index;
            document.getElementById('exportSingleModal').style.display = 'block';
        }
        function closeExportSingleModal() {
            siteToExportIndex = -1;
            document.getElementById('exportSingleModal').style.display = 'none';
        }

        window.addEventListener('click', function (e) {
            if (e.target.classList.contains('modal')) e.target.style.display = 'none';
        });

        // Exportação Geral (Botão Inferior)
        function exportAllJSON() {
            const dataStr = JSON.stringify(sites, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = 'meus_sites_backup.json';
            link.click();
            closeExportAllModal();
        }

        function exportAllZip() {
            if (typeof JSZip === 'undefined') { alert('Erro: JSZip não foi carregado. Verifique sua conexão ou se o jszip.min.js existe na pasta.'); return; }
            
            const zip = new JSZip();
            zip.file("sites_backup.json", JSON.stringify(sites, null, 2));
            
            sites.forEach(site => {
                zip.file(`${sanitizeFilename(site.name)}.html`, site.code);
            });
            
            zip.generateAsync({ type: "blob" }).then(content => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = "minhas_ferramentas_completas.zip";
                link.click();
            });
            closeExportAllModal();
        }

        // Exportação Individual (Botão no Cartão)
        function executeExportSingle(format) {
            if (siteToExportIndex < 0 || siteToExportIndex >= sites.length) return;
            
            const site = sites[siteToExportIndex];
            const safeName = sanitizeFilename(site.name);
            const link = document.createElement('a');

            if (format === 'html') {
                const blob = new Blob([site.code], { type: 'text/html' });
                link.href = URL.createObjectURL(blob);
                link.download = `${safeName}.html`;
                link.click();
            } else if (format === 'zip') {
                if (typeof JSZip === 'undefined') { alert("JSZip não carregado"); return; }
                const zip = new JSZip();
                zip.file(`${safeName}.html`, site.code);
                zip.file(`${safeName}_backup.json`, JSON.stringify([site], null, 2));
                
                zip.generateAsync({ type: "blob" }).then(content => {
                    link.href = URL.createObjectURL(content);
                    link.download = `${safeName}.zip`;
                    link.click();
                });
            }
            closeExportSingleModal();
        }


        // -----------------------------------------------------------
        // LÓGICA DE IMPORTAÇÃO (JSON & ZIP)
        // -----------------------------------------------------------

        function importSites(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            // Loop para suportar a importação de VÁRIOS arquivos ao mesmo tempo!
            Array.from(files).forEach(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                if (ext === 'json') {
                    processJSONImport(file);
                } else if (ext === 'zip') {
                    processZIPImport(file);
                } else if (ext === 'html') {
                    processHTMLImport(file); // Nova rota para o .html
                } else {
                    alert(`O arquivo ${file.name} tem um formato inválido. Selecione .zip, .json ou .html`);
                }
            });
            event.target.value = '';
        }

        // NOVA FUNÇÃO: Ler arquivos .html soltos e transformar em ferramenta
        function processHTMLImport(file) {
            const reader = new FileReader();
            reader.onload = async e => {
                const htmlContent = e.target.result;
                // Usa o nome do arquivo como nome da ferramenta (tirando o .html e underlines)
                const siteName = file.name.replace('.html', '').replace(/_/g, ' ');
                
                const newSite = {
                    name: siteName,
                    description: 'Página física importada (.html)',
                    code: htmlContent
                };
                
                sites.push(newSite);
                await saveSites();
                renderSites();
            };
            reader.readAsText(file);
        }

        function processJSONImport(file) {
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const importedSites = JSON.parse(e.target.result);
                    if (Array.isArray(importedSites)) {
                        if (confirm('Deseja ADICIONAR esses sites à sua lista atual? (Se cancelar, todos os atuais serão SUBSTITUÍDOS)')) {
                            sites = sites.concat(importedSites);
                        } else {
                            sites = importedSites;
                        }
                        await saveSites();
                        renderSites();
                        alert('Ferramentas importadas com sucesso!');
                    } else {
                        alert('Arquivo JSON inválido!');
                    }
                } catch (error) {
                    alert('Erro ao importar arquivo JSON: ' + error.message);
                }
            };
            reader.readAsText(file);
        }

        async function processZIPImport(file) {
            if (typeof JSZip === 'undefined') { alert("Biblioteca JSZip ausente."); return; }
            
            try {
                const zip = new JSZip();
                const contents = await zip.loadAsync(file);
                
                let backupFile = Object.keys(contents.files).find(n => n.endsWith('.json'));

                if (backupFile) {
                    // Importando dados puros (JSON) que estavam dentro do ZIP
                    const text = await contents.files[backupFile].async("string");
                    const importedSites = JSON.parse(text);
                    if (Array.isArray(importedSites)) {
                        if (confirm('Backup de sistema encontrado no ZIP! Deseja MISTURAR com seus sites atuais? (Cancelar = Substituir tudo)')) {
                            sites = sites.concat(importedSites);
                        } else {
                            sites = importedSites;
                        }
                        await saveSites();
                        renderSites();
                        alert('Dados restaurados com sucesso a partir do ZIP!');
                    }
                } else {
                    // Sem JSON. Buscar qualquer arquivo HTML solto e cadastrar como nova ferramenta
                    const newSites = [];
                    for (let filename of Object.keys(contents.files)) {
                        if (filename.endsWith('.html')) {
                            const htmlContent = await contents.files[filename].async("string");
                            newSites.push({
                                name: filename.replace('.html', '').replace(/_/g, ' '),
                                description: 'Ferramenta importada fisicamente (.html)',
                                code: htmlContent
                            });
                        }
                    }
                    if (newSites.length > 0) {
                        if (confirm(`Encontradas ${newSites.length} ferramentas HTML no ZIP. Deseja importá-las para sua biblioteca?`)) {
                            sites = sites.concat(newSites);
                            await saveSites();
                            renderSites();
                            alert('Ferramentas HTML instaladas com sucesso!');
                        }
                    } else {
                        alert("Nenhum arquivo JSON de backup ou código HTML encontrado neste arquivo ZIP.");
                    }
                }
            } catch (err) {
                alert('Erro ao processar o arquivo ZIP: ' + err.message);
            }
        }


        function normalizeText(text) {
            return text.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        }

        // Verifica suporte ao reconhecimento de voz
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        // ==========================================
        // BUSCA PRINCIPAL (DIGITAÇÃO E BOTÃO LIMPAR)
        // ==========================================
        let searchTimeout;
        const mainSearchInput = document.getElementById('searchInput');
        const mainClearBtn = document.getElementById('clearSearch');

        if (mainSearchInput && mainClearBtn) {
            // Escuta cada vez que você digita ou apaga uma letra
            mainSearchInput.addEventListener('input', function (e) {
                const searchTerm = e.target.value;

                // Mostra ou esconde o botão "X"
                if (searchTerm.trim() !== '') {
                    mainClearBtn.style.display = 'block';
                } else {
                    mainClearBtn.style.display = 'none';
                }

                // Espera você parar de digitar por 300ms antes de buscar (evita travamentos)
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    filterSites(searchTerm);
                }, 300);
            });

            // O que acontece quando clica no botão "X"
            mainClearBtn.addEventListener('click', function () {
                mainSearchInput.value = '';
                mainClearBtn.style.display = 'none';
                renderSites(); // Mostra todos os sites de novo
                mainSearchInput.focus(); // Mantém o teclado aberto
            });

            // Bônus: Limpar a busca apertando a tecla "Esc" do teclado (se usar no PC)
            mainSearchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    mainSearchInput.value = '';
                    mainClearBtn.style.display = 'none';
                    renderSites();
                }
            });
        }

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'pt-BR'; 
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onresult = function (event) {
                const transcript = event.results[0][0].transcript.trim();

                const searchInput = document.getElementById('searchInput');
                const clearBtn = document.getElementById('clearSearch');

                searchInput.value = transcript;
                clearBtn.style.display = 'block';

                filterSites(transcript);
            };

            recognition.onerror = function (event) {
                console.error('Erro no reconhecimento de voz:', event.error);
            };

            window.startVoiceSearch = function() {
                recognition.start();
            }
        } else {
            window.startVoiceSearch = function() {
                alert('Reconhecimento de voz não suportado neste navegador.');
                console.log("SpeechRecognition não está disponível.");
            }
        }

        //service worker para funcionamento offline
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('./sw.js')
                    .then(function (registration) {
                        console.log('SW registrado com sucesso:', registration.scope);

                        registration.addEventListener('updatefound', function () {
                            console.log('Nova versão do SW disponível');
                        });
                    })
                    .catch(function (error) {
                        console.log('Falha ao registrar SW:', error);
                    });
            });
        }
        
        // Detectar status offline/online
        function updateOnlineStatus() {
            const indicator = document.getElementById('offlineIndicator');
            if (navigator.onLine) {
                indicator.style.display = 'none';
                indicator.textContent = '🌐 Online';
            } else {
                indicator.style.display = 'block';
                indicator.textContent = '📱 Modo Offline - Funcionalidade completa disponível';
            }
        }

        window.addEventListener('load', function () {
            updateOnlineStatus();

            fetch('./manifest.json', { method: 'HEAD', cache: 'no-cache' })
                .then(() => {
                    console.log('Conectividade confirmada');
                })
                .catch(() => {
                    console.log('Sem conectividade real');
                    const indicator = document.getElementById('offlineIndicator');
                    indicator.style.display = 'block';
                    indicator.textContent = '📱 Modo Offline';
                });
        });

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus(); 
        
        // Carregar sites ao iniciar
        (async () => {
            await loadSites();
        })();