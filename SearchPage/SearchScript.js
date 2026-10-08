// SearchScript.js - Public Search Page (v2)
// 3 search modes: Name (Nepali/English), Code, Ancestors.
// 4 view buttons common to all modes.

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Supabase
    // ------------------------------------------------------------
    let supabase = null;
    let allMembers = [];
    let currentSelectedMember = null;
    let isNewFormatMode = false;
    let currentRootCode = null;
    let currentRootName = null;

    let MAX_GENERATIONS = 1;
    let currentSearchMode = null;      // null | 'name' | 'code' | 'ancestor'

    // Highlighted indices for the two text-based modes
    let nameHighlightedIndex = -1;
    let nameCurrentResults = [];
    let codeHighlightedIndex = -1;
    let codeCurrentResults = [];

    // Remember what the input holds after a pick, so we can tell when the
    // user has edited it (and reset the pick state accordingly).
    let nameInputRawValue = '';
    let codeInputRawValue = '';
    let namePickedMember = null;
    let codePickedMember = null;

    function initSupabase() {
        if (window.SupabaseConfig && window.SupabaseConfig.supabase) {
            supabase = window.SupabaseConfig.supabase;
            console.log('✅ Supabase client loaded from SupabaseConfig');
            return true;
        }
        console.error('❌ SupabaseConfig.js not loaded!');
        return false;
    }
    initSupabase();

    // ------------------------------------------------------------
    // 2. Roman (transliteration) index
    // ------------------------------------------------------------
    const memberRomanIndex = new Map();

    const DEV_FALLBACK = [
        ['क्‍ष', 'chh'], ['त्र', 'tra'], ['ज्ञ', 'gya'], ['श्र', 'shra'],
        ['क्', 'k'], ['ख्', 'kh'], ['ग्', 'g'], ['घ्', 'gh'], ['ङ्', 'ng'],
        ['च्', 'ch'], ['छ्', 'chh'], ['ज्', 'j'], ['झ्', 'jh'], ['ञ्', 'n'],
        ['ट्', 't'], ['ठ्', 'th'], ['ड्', 'd'], ['ढ्', 'dh'], ['ण्', 'n'],
        ['त्', 't'], ['थ्', 'th'], ['द्', 'd'], ['ध्', 'dh'], ['न्', 'n'],
        ['प्', 'p'], ['फ्', 'ph'], ['ब्', 'b'], ['भ्', 'bh'], ['म्', 'm'],
        ['य्', 'y'], ['र्', 'r'], ['ल्', 'l'], ['व्', 'v'], ['श्', 'sh'],
        ['ष्', 'sh'], ['स्', 's'], ['ह्', 'h'],
        ['ा', 'a'], ['ि', 'i'], ['ी', 'i'], ['ु', 'u'], ['ू', 'u'],
        ['ृ', 'ri'], ['े', 'e'], ['ै', 'ai'], ['ो', 'o'], ['ौ', 'au'],
        ['ं', 'n'], ['ँ', 'n'], ['ः', 'h'], ['्', ''],
        ['अ', 'a'], ['आ', 'aa'], ['इ', 'i'], ['ई', 'i'], ['उ', 'u'],
        ['ऊ', 'u'], ['ऋ', 'ri'], ['ए', 'e'], ['ऐ', 'ai'], ['ओ', 'o'], ['औ', 'au'],
        ['क', 'ka'], ['ख', 'kha'], ['ग', 'ga'], ['घ', 'gha'], ['ङ', 'nga'],
        ['च', 'cha'], ['छ', 'chha'], ['ज', 'ja'], ['झ', 'jha'], ['ञ', 'nya'],
        ['ट', 'ta'], ['ठ', 'tha'], ['ड', 'da'], ['ढ', 'dha'], ['ण', 'na'],
        ['त', 'ta'], ['थ', 'tha'], ['द', 'da'], ['ध', 'dha'], ['न', 'na'],
        ['प', 'pa'], ['फ', 'pha'], ['ब', 'ba'], ['भ', 'bha'], ['म', 'ma'],
        ['य', 'ya'], ['र', 'ra'], ['ल', 'la'], ['व', 'va'], ['श', 'sha'],
        ['ष', 'sha'], ['स', 'sa'], ['ह', 'ha'],
        ['०', '0'], ['१', '1'], ['२', '2'], ['३', '3'], ['४', '4'],
        ['५', '5'], ['६', '6'], ['७', '7'], ['८', '8'], ['९', '9'],
    ];

    function devanagariToRomanFallback(text) {
        let out = String(text);
        for (const [dev, rom] of DEV_FALLBACK) {
            out = out.split(dev).join(rom);
        }
        return out;
    }

    function toRoman(text) {
        if (!text) return '';
        const input = String(text);
        try {
            if (window.Sanscript && typeof window.Sanscript.t === 'function') {
                const raw = window.Sanscript.t(input, 'devanagari', 'itrans');
                const cleaned = String(raw)
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9\s]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (cleaned) return cleaned;
            }
        } catch (e) {
            console.warn('Sanscript failed, using fallback:', e);
        }
        return devanagariToRomanFallback(input)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const ROMAN_OVERRIDES = {
        'ओझा': ['ojha', 'ozha'], 'शर्मा': ['sharma'], 'भट्ट': ['bhatta', 'bhatt'],
        'आचार्य': ['acharya', 'achariya'], 'पौडेल': ['paudel', 'poudel'],
        'अधिकारी': ['adhikari'], 'दाहाल': ['dahal'], 'खनाल': ['khanal'],
        'श्रेष्ठ': ['shrestha', 'srestha'], 'महर्जन': ['maharjan'],
        'गौतम': ['gautam'], 'पाण्डे': ['pandey', 'pande'],
        'त्रिपाठी': ['tripathi', 'tiwari'], 'चौधरी': ['chaudhary', 'chaudhari'],
        'विष्णु': ['bishnu', 'bisnu', 'vishnu'], 'लक्ष्मी': ['laxmi', 'lakshmi'],
        'गणेश': ['ganesh'], 'कृष्ण': ['krishna', 'krisna'],
        'राम': ['ram'], 'श्याम': ['shyam', 'syam'],
        'सीता': ['sita'], 'गीता': ['gita', 'geeta'], 'हरि': ['hari'],
        'विनोद': ['binod', 'vinod'], 'सुशीला': ['sushila', 'susila'],
        'प्रसाद': ['prasad', 'prashad'], 'बहादुर': ['bahadur'],
        'कुमार': ['kumar'], 'देवी': ['devi'], 'लाल': ['lal'],
        'जय': ['jay', 'jai'], 'नारायण': ['narayan', 'narayana'],
        'नारायन': ['narayan', 'narayana'],
    };

    function expandNameWithOverrides(devanagariName) {
        const variants = new Set();
        if (!devanagariName) return variants;
        const name = String(devanagariName);
        Object.keys(ROMAN_OVERRIDES).forEach(key => {
            if (name.includes(key)) {
                ROMAN_OVERRIDES[key].forEach(v => variants.add(v.toLowerCase()));
            }
        });
        return variants;
    }

    function addPrefixVariants(roman, set) {
        const words = roman.split(/\s+/).filter(Boolean);
        words.forEach(word => {
            set.add(word);
            for (let len = 1; len <= word.length; len++) {
                set.add(word.substring(0, len));
            }
        });
    }

    function buildMemberRomanIndex() {
        memberRomanIndex.clear();
        allMembers.forEach(m => {
            if (!m || !m.PersonalCode) return;
            const variants = new Set();

            const romanFull = toRoman(m.FullName || '');
            if (romanFull) {
                variants.add(romanFull);
                romanFull.split(/\s+/).forEach(w => { if (w) variants.add(w); });
                addPrefixVariants(romanFull, variants);
            }

            expandNameWithOverrides(m.FullName || '').forEach(v => variants.add(v));

            if (m.FullNameEn) {
                const en = String(m.FullNameEn).toLowerCase();
                variants.add(en);
                en.split(/\s+/).forEach(w => { if (w) variants.add(w); });
                addPrefixVariants(en, variants);
            }

            variants.add(String(m.PersonalCode).toLowerCase());

            memberRomanIndex.set(m.PersonalCode, variants);
        });
        console.log('✅ Roman name index built for', memberRomanIndex.size, 'members');
    }

    function memberMatchesRoman(member, query) {
        if (!member || !member.PersonalCode) return false;
        const q = (query || '').trim().toLowerCase();
        if (!q) return true;
        const variants = memberRomanIndex.get(member.PersonalCode);
        if (!variants) return false;
        const queryWords = q.split(/\s+/).filter(Boolean);
        const variantsArr = Array.from(variants);
        return queryWords.every(word =>
            variantsArr.some(v => v.includes(word))
        );
    }

    // ------------------------------------------------------------
    // 3. Code + gender helpers
    // ------------------------------------------------------------
    const GENDER_BLOCK_REGEX = /\.([MFN])(\d+)$/;

    function isRootCode(code) { return !!code && /^[A-Z]$/.test(String(code).trim()); }
    function isLegacyRootCode(code) {
        if (!code) return false;
        if (isNewFormatMode) return false;
        return /^[A-Z]\.([MFN])?\d+m*$/.test(String(code).trim());
    }
    function isSpouseCode(code) { return !!code && /m+$/.test(String(code).trim()); }
    function getSpouseRank(code) {
        if (!code) return 0;
        const m = String(code).trim().match(/m+$/);
        return m ? m[0].length : 0;
    }
    function getPartnerCode(code) {
        if (!code) return '';
        return String(code).trim().replace(/m+$/, '');
    }
    function getBaseCode(code) {
        if (!code) return '';
        let clean = String(code).trim();
        if (/^[A-Z]$/.test(clean)) return clean;
        if (/m+$/.test(clean)) return getBaseCode(clean.replace(/m+$/, ''));
        clean = clean.replace(/\.([MFN])(\d+)$/g, '.$2');
        return clean;
    }
    function getGenerationFromCode(code) {
        if (!code) return 0;
        const c = String(code).trim();
        if (/^[A-Z]$/.test(c)) return 0;
        const stripped = c.replace(/m+$/, '');
        if (!isNewFormatMode && /^[A-Z]\.([MFN])?\d+$/.test(stripped)) return 0;
        const parts = stripped.split('.');
        return Math.max(0, parts.length - 1);
    }
    function getParentBranch(code) {
        if (!code) return null;
        const c = String(code).trim();
        if (/^[A-Z]$/.test(c)) return null;
        let cleanCode = c.replace(/m+$/, '');
        if (!isNewFormatMode && /^[A-Z]\.([MFN])?\d+$/.test(cleanCode)) return null;
        const branch = getBaseCode(cleanCode);
        const parts = branch.split('.');
        if (parts.length <= 1) return null;
        return parts.slice(0, -1).join('.');
    }
    function getGenderIndex(code) {
        if (!code) return 0;
        const m = String(code).match(GENDER_BLOCK_REGEX);
        return m ? parseInt(m[2], 10) : 0;
    }
    function getGenderLetter(code) {
        if (!code) return '';
        const m = String(code).match(GENDER_BLOCK_REGEX);
        return m ? m[1] : '';
    }
    function getChildIndex(code) {
        if (!code) return 0;
        let clean = String(code).trim().replace(/m+$/, '');
        const base = getBaseCode(clean);
        const parts = base.split('.');
        const last = parts[parts.length - 1];
        const n = parseInt(last, 10);
        return isNaN(n) ? 0 : n;
    }
    function getDirectChildren(parentCode, members) {
        if (!parentCode) return [];
        const parentBranch = getBaseCode(parentCode);
        return members
            .filter(m => {
                if (!m || !m.PersonalCode) return false;
                return getParentBranch(m.PersonalCode) === parentBranch;
            })
            .sort((a, b) => {
                const ai = getChildIndex(a.PersonalCode);
                const bi = getChildIndex(b.PersonalCode);
                if (ai !== bi) return ai - bi;
                const ag = a.PersonalCode.match(GENDER_BLOCK_REGEX)?.[1] || '';
                const bg = b.PersonalCode.match(GENDER_BLOCK_REGEX)?.[1] || '';
                return ag.localeCompare(bg);
            });
    }
    function findRootMember(members) {
        if (!members || members.length === 0) return null;
        const candidates = members.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return getParentBranch(m.PersonalCode) === null;
        });
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const subtreeSize = (rootCode) => {
            const rootBranch = getBaseCode(rootCode);
            return members.filter(m => {
                if (!m || !m.PersonalCode) return false;
                const c = m.PersonalCode;
                if (c === rootCode) return true;
                if (c.startsWith(rootBranch + '.')) return true;
                return false;
            }).length;
        };
        return candidates.reduce((best, cur) => {
            return subtreeSize(cur.PersonalCode) > subtreeSize(best.PersonalCode) ? cur : best;
        });
    }
    function getMemberByCode(code, members) {
        if (!code) return null;
        const c = String(code).trim();
        return members.find(m => m && String(m.PersonalCode).trim() === c) || null;
    }
    function findAncestorMemberByBranch(branchCode) {
        if (!branchCode) return null;
        const candidates = allMembers.filter(x =>
            x && x.PersonalCode && getBaseCode(x.PersonalCode) === branchCode
        );
        if (candidates.length === 0) return null;
        const maleCandidate = candidates.find(c =>
            /\.M\d+$/.test(String(c.PersonalCode).trim())
        );
        if (maleCandidate) return maleCandidate;
        return null;
    }

    function formatMemberLabel(member) {
        if (!member) return '';
        const code = member.PersonalCode;
        const rank = getSpouseRank(code);
        let genderEmoji = '';
        let spouseLabel = '';

        if (rank > 0) {
            if (member.Gender === 'F') genderEmoji = '♀️ ';
            else if (member.Gender === 'M') genderEmoji = '♂️ ';
            else if (member.Gender === 'N' || member.Gender === 'O') genderEmoji = '⚧️ ';
            if (rank === 1) spouseLabel = '👰 ';
            else if (rank === 2) spouseLabel = '👰(२) ';
            else if (rank === 3) spouseLabel = '👰(३) ';
            else spouseLabel = `👰(${rank}) `;
        } else {
            const gl = getGenderLetter(code);
            if (gl === 'M') genderEmoji = '♂️ ';
            else if (gl === 'F') genderEmoji = '♀️ ';
            else if (gl === 'N') genderEmoji = '⚧️ ';
            else if (isRootCode(code) || isLegacyRootCode(code)) {
                if (member.Gender === 'F') genderEmoji = '♀️ ';
                else if (member.Gender === 'N' || member.Gender === 'O') genderEmoji = '⚧️ ';
                else genderEmoji = '♂️ ';
            }
        }
        return `${spouseLabel}${genderEmoji}${code} - ${member.FullName || ''}`;
    }

    function getGenderLabel(memberOrCode) {
        let genderCode = null;
        if (memberOrCode && typeof memberOrCode === 'object') {
            const g = (memberOrCode.Gender || '').toString().trim().toUpperCase();
            if (g === 'M' || g === 'F' || g === 'N' || g === 'O') genderCode = (g === 'O') ? 'N' : g;
        }
        if (!genderCode && typeof memberOrCode === 'string') {
            const gl = getGenderLetter(memberOrCode);
            if (gl === 'M' || gl === 'F' || gl === 'N') genderCode = gl;
        }
        if (genderCode === 'M') return 'पुरूष (Male)';
        if (genderCode === 'F') return 'महिला (Female)';
        if (genderCode === 'N') return 'अन्य (Other)';
        return 'अन्य (Other)';
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    function formatDob(member) {
        const v = member && member.DOB;
        return (v && String(v).trim() !== '') ? v : '-';
    }
    function getGenerationLabel(genIndex) {
        if (genIndex === 0) return 'मूल';
        return `पुस्ता ${genIndex}`;
    }

    // ------------------------------------------------------------
    // 4. Load Members
    // ------------------------------------------------------------
    async function loadMembers() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('MemberDataTable')
                .select('*')
                .order('PersonalCode');

            if (error) throw error;

            if (!data || data.length === 0) {
                allMembers = [];
                MAX_GENERATIONS = 1;
                currentRootCode = null;
                currentRootName = null;
                updateSubHead();
                buildDropdownsFromDB();
                populateDropdowns();
                buildMemberRomanIndex();
                return;
            }

            allMembers = data;
            console.log('✅ Loaded', allMembers.length, 'members');

            isNewFormatMode = allMembers.some(m =>
                m && m.PersonalCode && /^[A-Z]$/.test(String(m.PersonalCode).trim())
            );
            console.log('📐 Format mode:', isNewFormatMode ? 'NEW' : 'LEGACY');

            const root = findRootMember(allMembers);
            currentRootCode = root ? root.PersonalCode : null;
            currentRootName = root ? (root.FullName || null) : null;
            console.log('🌳 Root detected:', currentRootCode, '|', currentRootName);

            updateSubHead();

            let maxGen = 0;
            allMembers.forEach(m => {
                if (!m || !m.PersonalCode) return;
                const g = getGenerationFromCode(m.PersonalCode);
                if (g > maxGen) maxGen = g;
            });
            MAX_GENERATIONS = maxGen + 1;

            buildDropdownsFromDB();
            populateDropdowns();
            buildMemberRomanIndex();

        } catch(e) {
            console.warn('Could not load members:', e);
            allMembers = [];
            MAX_GENERATIONS = 1;
            currentRootCode = null;
            currentRootName = null;
            updateSubHead();
            buildDropdownsFromDB();
            populateDropdowns();
            memberRomanIndex.clear();
        }
    }

    function updateSubHead() {
        const subHead = document.getElementById('SubHead');
        if (!subHead) return;
        if (currentRootName && String(currentRootName).trim() !== '') {
            subHead.textContent = `(${currentRootName}का सन्तानहरू)`;
        } else {
            subHead.textContent = '(वंशावली)';
        }
    }

    // ------------------------------------------------------------
    // 5. SEARCH MODE MANAGEMENT
    // ------------------------------------------------------------
    const MODE_BOX_IDS = {
        name:     'ModeNameBox',
        code:     'ModeCodeBox',
        ancestor: 'ModeAncestorBox'
    };
    const MODE_BTN_IDS = {
        name:     'btnModeName',
        code:     'btnModeCode',
        ancestor: 'btnModeAncestor'
    };

    function switchSearchMode(mode) {
        currentSearchMode = mode;
        Object.keys(MODE_BOX_IDS).forEach(key => {
            const box = document.getElementById(MODE_BOX_IDS[key]);
            const btn = document.getElementById(MODE_BTN_IDS[key]);
            const isActive = (key === mode);
            if (box) box.classList.toggle('is-active', isActive);
            if (btn) btn.classList.toggle('active', isActive);
        });

        // Clear currently selected member + view panels
        currentSelectedMember = null;
        updateMemberDisplay();

        // Clear any leftover text in the combobox inputs + close dropdowns
        const nameInput  = document.getElementById('NameSearchInput');
        const nameRes    = document.getElementById('NameSearchResults');
        const codeInput  = document.getElementById('CodeSearchInput');
        const codeRes    = document.getElementById('CodeSearchResults');
        if (nameInput) nameInput.value = '';
        if (codeInput) codeInput.value = '';
        closeTextResults(nameRes);
        closeTextResults(codeRes);

        nameInputRawValue = '';
        codeInputRawValue = '';
        namePickedMember  = null;
        codePickedMember  = null;
        nameHighlightedIndex = -1;
        codeHighlightedIndex = -1;
        nameCurrentResults = [];
        codeCurrentResults = [];

        // NOTE: no auto-focus and no auto-open.
    }

    function initSearchModeButtons() {
        document.getElementById('btnModeName')?.addEventListener('click', () => switchSearchMode('name'));
        document.getElementById('btnModeCode')?.addEventListener('click', () => switchSearchMode('code'));
        document.getElementById('btnModeAncestor')?.addEventListener('click', () => switchSearchMode('ancestor'));
    }

    // ------------------------------------------------------------
    // 6. NAME + CODE SEARCH (text comboboxes)
    // ------------------------------------------------------------
    function buildTextSearchRow(member) {
        const code = String(member.PersonalCode || '');
        const gl = getGenderLetter(code) || (member.Gender || '');
        let emoji = '';
        if (gl === 'M') emoji = '♂️';
        else if (gl === 'F') emoji = '♀️';
        else if (gl === 'N' || gl === 'O') emoji = '⚧️';

        const rank = getSpouseRank(code);
        let spouseLabel = '';
        if (rank === 1) spouseLabel = '👰 ';
        else if (rank === 2) spouseLabel = '👰(२) ';
        else if (rank === 3) spouseLabel = '👰(३) ';
        else if (rank > 0) spouseLabel = `👰(${rank}) `;

        return `
            <span class="ci-emoji">${spouseLabel}${emoji}</span>
            <span class="ci-code">${escapeHtml(code || '-')}</span>
            <span class="ci-name">${escapeHtml(member.FullName || '')}</span>
        `;
    }

    function renderTextResults(resultsEl, results, highlightedIndex, onPick) {
        if (results.length === 0) {
            resultsEl.hidden = false;
            resultsEl.innerHTML = `<div class="combobox-empty">कुनै मिल्दो सदस्य भेटिएन</div>`;
            return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = results.map((m, i) => {
            const cls = 'combobox-item' + (i === highlightedIndex ? ' is-highlighted' : '');
            return `<div class="${cls}" data-index="${i}" role="option">${buildTextSearchRow(m)}</div>`;
        }).join('');
        resultsEl.querySelectorAll('.combobox-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const idx = parseInt(el.dataset.index);
                const m = results[idx];
                if (m) onPick(m);
            });
        });
        if (highlightedIndex >= 0) {
            const el = resultsEl.querySelector('.combobox-item.is-highlighted');
            if (el) {
                const rTop = el.offsetTop, rBot = rTop + el.offsetHeight;
                if (rTop < resultsEl.scrollTop) resultsEl.scrollTop = rTop;
                else if (rBot > resultsEl.scrollTop + resultsEl.clientHeight)
                    resultsEl.scrollTop = rBot - resultsEl.clientHeight;
            }
        }
    }

    function closeTextResults(el) { if (el) el.hidden = true; }

    // ---------- NAME search ----------
    function filterByName(query) {
        const q = (query || '').trim().toLowerCase();

        if (!q) {
            return allMembers.slice().sort((a, b) => {
                const an = a.PersonalCode || '';
                const bn = b.PersonalCode || '';
                return an.localeCompare(bn);
            });
        }

        return allMembers.filter(m => {
            if (!m || !m.PersonalCode) return false;
            const name = (m.FullName || '').toLowerCase();
            if (name.includes(q)) return true;
            return memberMatchesRoman(m, q);
        }).sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    function refreshNameResults() {
        const input = document.getElementById('NameSearchInput');
        const resultsEl = document.getElementById('NameSearchResults');
        if (!input || !resultsEl) return;
        const q = input.value || '';
        nameCurrentResults = filterByName(q);
        if (nameHighlightedIndex >= nameCurrentResults.length) {
            nameHighlightedIndex = nameCurrentResults.length > 0 ? 0 : -1;
        }
        renderTextResults(resultsEl, nameCurrentResults, nameHighlightedIndex, onPickNameResult);
    }

    function onPickNameResult(member) {
        closeTextResults(document.getElementById('NameSearchResults'));
        const input = document.getElementById('NameSearchInput');
        if (input) {
            input.value = `${member.PersonalCode || ''} - ${member.FullName || ''}`;
        }
        namePickedMember = member;
        nameInputRawValue = input ? input.value : '';
        // Blur so the toggle state resets: next click opens fresh
        if (input) input.blur();
        selectMember(member);
    }

    // ---------- CODE search ----------
    function filterByCode(query) {
        const q = (query || '').trim().toLowerCase();

        if (!q) {
            return allMembers.slice().sort((a, b) => {
                const an = a.PersonalCode || '';
                const bn = b.PersonalCode || '';
                return an.localeCompare(bn);
            });
        }

        return allMembers.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return String(m.PersonalCode).toLowerCase().includes(q);
        }).sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    function refreshCodeResults() {
        const input = document.getElementById('CodeSearchInput');
        const resultsEl = document.getElementById('CodeSearchResults');
        if (!input || !resultsEl) return;
        const q = input.value || '';
        codeCurrentResults = filterByCode(q);
        if (codeHighlightedIndex >= codeCurrentResults.length) {
            codeHighlightedIndex = codeCurrentResults.length > 0 ? 0 : -1;
        }
        renderTextResults(resultsEl, codeCurrentResults, codeHighlightedIndex, onPickCodeResult);
    }

    function onPickCodeResult(member) {
        closeTextResults(document.getElementById('CodeSearchResults'));
        const input = document.getElementById('CodeSearchInput');
        if (input) {
            input.value = `${member.PersonalCode || ''} - ${member.FullName || ''}`;
        }
        codePickedMember = member;
        codeInputRawValue = input ? input.value : '';
        if (input) input.blur();
        selectMember(member);
    }

    // ---------- Wire the two text-comboboxes ----------
    function wireTextCombobox(inputId, resultsId, refreshFn, state) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        if (!input || !results) {
            console.warn('⚠️ Combobox elements not found:', inputId, resultsId);
            return;
        }

        // ----- TOGGLE on mousedown -----
        // Browser would normally focus the input on mousedown. We use this
        // to implement "click to open, click again to close".
        input.addEventListener('mousedown', (e) => {
            // If the input is already focused AND the dropdown is visible,
            // this click means "close me".
            if (document.activeElement === input && !results.hidden) {
                e.preventDefault();          // stop the browser from re-focusing
                input.blur();
                closeTextResults(results);
                return;
            }
            // Otherwise let the browser focus the input. We defer the open
            // to a microtask so focus lands first.
            // (no preventDefault here)
        });

        // When the input receives focus (including via click, Tab, etc.),
        // open the dropdown — UNLESS it's holding a picked label that the
        // user hasn't modified yet.
        input.addEventListener('focus', () => {
            const picked = state.getPicked();
            if (picked && input.value === state.getRawValue()) {
                // Input still shows the picked label; don't auto-open.
                return;
            }
            refreshFn();
        });

        // Filter on every keystroke
        input.addEventListener('input', () => {
            // If user edits after a pick, treat as cleared so view buttons
            // get disabled again.
            const picked = state.getPicked();
            if (picked) {
                if (input.value !== state.getRawValue()) {
                    state.setPicked(null);
                    state.setRawValue('');
                    currentSelectedMember = null;
                    updateMemberDisplay();
                }
            }
            state.setHighlight(-1);
            refreshFn();
        });

        input.addEventListener('keydown', (e) => {
            if (results.hidden) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const picked = state.getPicked();
                    if (picked && input.value === state.getRawValue()) return;
                    refreshFn();
                    return;
                }
                return;
            }
            const cur = state.getResults();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (cur.length === 0) return;
                const next = Math.min(cur.length - 1, state.getHighlight() + 1);
                state.setHighlight(next);
                refreshFn();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (cur.length === 0) return;
                const prev = Math.max(0, state.getHighlight() - 1);
                state.setHighlight(prev);
                refreshFn();
            } else if (e.key === 'Enter') {
                const idx = state.getHighlight();
                if (idx >= 0 && cur[idx]) {
                    e.preventDefault();
                    state.pick(cur[idx]);
                } else if (cur.length > 0) {
                    e.preventDefault();
                    state.pick(cur[0]);
                }
            } else if (e.key === 'Escape') {
                closeTextResults(results);
            }
        });

        // Clicking away closes the dropdown
        input.addEventListener('blur', () => {
            setTimeout(() => closeTextResults(results), 200);
        });
    }

    // ------------------------------------------------------------
    // 7. Build Ancestor Dropdowns (only visible in ancestor mode)
    // ------------------------------------------------------------
    function buildDropdownsFromDB() {
        const container = document.getElementById('DropDownBox');
        if (!container) return;
        container.innerHTML = '';
        const count = Math.max(1, MAX_GENERATIONS);
        for (let i = 0; i < count; i++) {
            const labelText = getGenerationLabel(i);
            const row = document.createElement('div');
            row.className = 'DropDownClass';
            row.innerHTML = `${labelText}: <select id="gen-${i + 1}"><option value="">छान्नुहोस्</option></select>`;
            container.appendChild(row);
        }
        attachDropdownEvents();
    }

    function populateDropdowns() {
        const gen1Select = document.getElementById('gen-1');
        if (gen1Select) {
            const currentValue = gen1Select.value;
            gen1Select.innerHTML = '<option value="">छान्नुहोस्</option>';
            const gen1Members = allMembers.filter(m => {
                if (!m || !m.PersonalCode) return false;
                return getParentBranch(m.PersonalCode) === null;
            });
            gen1Members.sort((a, b) => {
                const an = getChildIndex(a.PersonalCode);
                const bn = getChildIndex(b.PersonalCode);
                if (an !== bn) return an - bn;
                return String(a.PersonalCode).localeCompare(String(b.PersonalCode));
            });
            gen1Members.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.PersonalCode;
                opt.textContent = formatMemberLabel(m);
                gen1Select.appendChild(opt);
            });
            if (currentValue && gen1Select.querySelector(`option[value="${currentValue}"]`)) {
                gen1Select.value = currentValue;
            }
        }
        for (let i = 2; i <= MAX_GENERATIONS; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) {
                sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                sel.disabled = true;
            }
        }
        rebuildCascading();
    }

    function rebuildCascading() {
        const genSelects = [];
        for (let i = 1; i <= MAX_GENERATIONS; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) genSelects.push(sel);
        }
        let previousValue = null;
        for (let i = 0; i < genSelects.length; i++) {
            const sel = genSelects[i];
            if (i === 0) {
                sel.disabled = false;
                previousValue = sel.value;
            } else {
                if (previousValue) {
                    const children = getDirectChildren(previousValue, allMembers);
                    const currentValue = sel.value;
                    sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                    children.forEach(child => {
                        const opt = document.createElement('option');
                        opt.value = child.PersonalCode;
                        opt.textContent = formatMemberLabel(child);
                        sel.appendChild(opt);
                    });
                    sel.disabled = false;
                    if (currentValue && sel.querySelector(`option[value="${currentValue}"]`)) {
                        sel.value = currentValue;
                    }
                    previousValue = sel.value;
                } else {
                    sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                    sel.disabled = true;
                    previousValue = null;
                    for (let j = i + 1; j < genSelects.length; j++) {
                        genSelects[j].innerHTML = '<option value="">छान्नुहोस्</option>';
                        genSelects[j].disabled = true;
                    }
                    break;
                }
            }
        }
        updateMemberDisplayFromAncestors();
    }

    function attachDropdownEvents() {
        for (let i = 1; i <= MAX_GENERATIONS; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) {
                sel.removeEventListener('change', dropdownChangeHandler);
                sel.addEventListener('change', dropdownChangeHandler);
            }
        }
    }

    function dropdownChangeHandler() {
        let currentIndex = 1;
        for (let i = 1; i <= MAX_GENERATIONS; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel && sel === this) { currentIndex = i; break; }
        }
        for (let j = currentIndex + 1; j <= MAX_GENERATIONS; j++) {
            const nextSel = document.getElementById(`gen-${j}`);
            if (nextSel) {
                nextSel.innerHTML = '<option value="">छान्नुहोस्</option>';
                nextSel.disabled = true;
            }
        }
        rebuildCascading();
    }

    function updateMemberDisplayFromAncestors() {
        let selectedMember = null;
        for (let i = MAX_GENERATIONS; i >= 1; i--) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel && sel.value) {
                const member = getMemberByCode(sel.value, allMembers);
                if (member) { selectedMember = member; break; }
            }
        }
        currentSelectedMember = selectedMember;
        updateMemberDisplay();
    }

    // ------------------------------------------------------------
    // 8. Common selectMember (used by name + code search picks)
    // ------------------------------------------------------------
    function selectMember(member) {
        currentSelectedMember = member;
        for (let i = 1; i <= MAX_GENERATIONS; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) {
                if (i === 1) { sel.value = ''; }
                else { sel.innerHTML = '<option value="">छान्नुहोस्</option>'; sel.disabled = true; }
            }
        }
        updateMemberDisplay();
    }

    // ------------------------------------------------------------
    // 9. Common member display + view panel management
    // ------------------------------------------------------------
    const PANEL_IDS = {
        short:    'DescriptionBoxWrapper',
        detail:   'detailPanel',
        family:   'FamilyBox',
        ancestor: 'AnsestorsBox'
    };
    const BTN_IDS = {
        short:    'btnShortDescription',
        detail:   'btnDetailDescription',
        family:   'btnShowFamily',
        ancestor: 'btnShowAnsestors'
    };

    function showSearchPanel(which) {
        Object.keys(PANEL_IDS).forEach(key => {
            const panel = document.getElementById(PANEL_IDS[key]);
            const btn = document.getElementById(BTN_IDS[key]);
            const isActive = (key === which);
            if (panel) panel.classList.toggle('is-active', isActive);
            if (btn) btn.classList.toggle('active', isActive);
        });
        if (which) {
            const target = document.getElementById(PANEL_IDS[which]);
            if (target) {
                setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }
        }
    }
    function hideAllSearchPanels() { showSearchPanel(null); }

    function initViewToggleButtons() {
        document.getElementById('btnShortDescription')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('DescriptionBoxWrapper')?.classList.contains('is-active');
            isActive ? hideAllSearchPanels() : showSearchPanel('short');
        });
        document.getElementById('btnDetailDescription')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('detailPanel')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateDetailPanel(currentSelectedMember); showSearchPanel('detail'); }
        });
        document.getElementById('btnShowFamily')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('FamilyBox')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateFamilyBox(currentSelectedMember); showSearchPanel('family'); }
        });
        document.getElementById('btnShowAnsestors')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('AnsestorsBox')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateAncestorBox(currentSelectedMember); showSearchPanel('ancestor'); }
        });
    }

    function updateMemberDisplay() {
        const selectedMember = currentSelectedMember;
        updatePanelHeadings(selectedMember);

        const outputs = {
            code: document.getElementById('code-output'),
            name: document.getElementById('name-output'),
            gender: document.getElementById('gender-output'),
            address: document.getElementById('address-output'),
            birthDate: document.getElementById('birth-date-output'),
            father: document.getElementById('father-output'),
            mother: document.getElementById('mother-output'),
            mobile: document.getElementById('mobile-output'),
            email: document.getElementById('email-output'),
            spouse: document.getElementById('spouse-output'),
            occupation: document.getElementById('occupation-output'),
            education: document.getElementById('education-output'),
            position: document.getElementById('position-output'),
            dod: document.getElementById('dod-output'),
            sons: document.getElementById('sons-output'),
            daughters: document.getElementById('daughters-output')
        };
        const photo = document.getElementById('MemberPhoto');
        const saveBtn = document.getElementById('btnSaveImage');
        const allToggleBtns = Object.values(BTN_IDS).map(id => document.getElementById(id));

        if (!selectedMember) {
            Object.values(outputs).forEach(el => { if (el) el.textContent = '-'; });
            if (photo) { photo.src = '../no_pic.png'; photo.style.width = '100%'; photo.style.height = 'auto'; }
            if (saveBtn) saveBtn.disabled = true;
            allToggleBtns.forEach(b => { if (b) b.disabled = true; });
            hideAllSearchPanels();
            return;
        }

        if (outputs.code) outputs.code.textContent = selectedMember.PersonalCode || '-';
        if (outputs.name) outputs.name.textContent = selectedMember.FullName || '-';
        if (outputs.gender) outputs.gender.textContent = getGenderLabel(selectedMember);
        if (outputs.address) outputs.address.textContent = selectedMember.Address || '-';
        if (outputs.birthDate) outputs.birthDate.textContent = selectedMember.DOB || '-';
        if (outputs.father) outputs.father.textContent = selectedMember.Father || '-';
        if (outputs.mother) outputs.mother.textContent = selectedMember.Mother || '-';
        if (outputs.mobile) outputs.mobile.textContent = selectedMember.Mobile || '-';
        if (outputs.email) outputs.email.textContent = selectedMember.Email || '-';
        if (outputs.spouse) outputs.spouse.textContent = selectedMember.Spouse || '-';
        if (outputs.occupation) outputs.occupation.textContent = selectedMember.Profession || '-';
        if (outputs.education) outputs.education.textContent = selectedMember.Education || '-';
        if (outputs.position) outputs.position.textContent = selectedMember.Position || '-';
        if (outputs.dod) outputs.dod.textContent = selectedMember.DOD_Age || '-';
        if (outputs.sons) {
            const v = selectedMember.Sons;
            outputs.sons.textContent = (v && v.trim() !== '') ? v : '-';
        }
        if (outputs.daughters) {
            const v = selectedMember.Daughters;
            outputs.daughters.textContent = (v && v.trim() !== '') ? v : '-';
        }
        if (photo) {
            photo.src = (selectedMember.PhotoUrl && selectedMember.PhotoUrl.trim() !== '')
                ? selectedMember.PhotoUrl
                : '../no_pic.png';
        }
        if (saveBtn) saveBtn.disabled = false;
        allToggleBtns.forEach(b => { if (b) b.disabled = false; });

        if (document.getElementById('detailPanel')?.classList.contains('is-active')) {
            populateDetailPanel(selectedMember);
        }
        if (document.getElementById('FamilyBox')?.classList.contains('is-active')) {
            populateFamilyBox(selectedMember);
        }
        if (document.getElementById('AnsestorsBox')?.classList.contains('is-active')) {
            populateAncestorBox(selectedMember);
        }
    }

    function updatePanelHeadings(member) {
        const name = (member && member.FullName && String(member.FullName).trim() !== '')
            ? member.FullName : null;
        const rootName = currentRootName || 'मूल पुरूष';
        const titleShort    = document.getElementById('title-short');
        const titleDetail   = document.getElementById('title-detail');
        const titleFamily   = document.getElementById('title-family');
        const titleAncestor = document.getElementById('title-ancestor');

        if (!name) {
            if (titleShort)    titleShort.textContent    = 'संक्षिप्त विवरण';
            if (titleDetail)   titleDetail.textContent   = 'विस्तृत विवरण';
            if (titleFamily)   titleFamily.textContent   = 'पारिवारिक विवरण';
            if (titleAncestor) titleAncestor.textContent = `वंशावली (${rootName}बाट)`;
            return;
        }
        if (titleShort)    titleShort.textContent    = `${name}को संक्षिप्त विवरण`;
        if (titleDetail)   titleDetail.textContent   = `${name}को विस्तृत विवरण`;
        if (titleFamily)   titleFamily.textContent   = `${name}को पारिवारिक विवरण`;
        if (titleAncestor) titleAncestor.textContent = `${rootName}बाट ${name}सम्मको वंशावली`;
    }

    function populateDetailPanel(m) {
        if (!m) return;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (value && String(value).trim() !== '') ? value : '-';
        };
        setText('detail-name-hero', m.FullName);
        setText('detail-code', m.PersonalCode);
        setText('detail-dob-hero-value', m.DOB);
        setText('detail-father', m.Father);
        setText('detail-mother', m.Mother);
        setText('detail-spouse', m.Spouse);
        setText('detail-sons', m.Sons);
        setText('detail-daughters', m.Daughters);
        setText('detail-position', m.Position);
        setText('detail-address', m.Address);
        setText('detail-detailAddress', m.DetailAddress);
        setText('detail-mobile', m.Mobile);
        setText('detail-email', m.Email);
        setText('detail-dob', m.DOB);
        setText('detail-dod', m.DOD_Age);
        setText('detail-gender', getGenderLabel(m));
        setText('detail-education', m.Qualification);
        setText('detail-occupation', m.Profession);
        setText('detail-detailProfession', m.DetailProfession);
        setText('detail-lifeStory', m.LifeStory);

        const detailPhoto = document.getElementById('detail-photo');
        if (detailPhoto) {
            detailPhoto.src = (m.PhotoUrl && m.PhotoUrl.trim() !== '') ? m.PhotoUrl : '../no_pic.png';
        }
    }

    // ---------- Family Box ----------
    function getAllSpousesOf(member) {
        if (!member || !member.PersonalCode) return [];
        const code = String(member.PersonalCode).trim();
        if (/m+$/.test(code)) {
            const partnerCode = code.replace(/m+$/, '');
            const partner = getMemberByCode(partnerCode, allMembers);
            return partner ? [partner] : [];
        }
        return allMembers.filter(m => {
            if (!m || !m.PersonalCode) return false;
            const c = String(m.PersonalCode).trim();
            if (c.length <= code.length) return false;
            if (!c.startsWith(code)) return false;
            const suffix = c.substring(code.length);
            return /^m+$/.test(suffix);
        }).sort((a, b) => getSpouseRank(a.PersonalCode) - getSpouseRank(b.PersonalCode));
    }
    function getBloodRelative(member) {
        if (!member || !member.PersonalCode) return member;
        const code = String(member.PersonalCode).trim();
        if (/m+$/.test(code)) {
            const partnerCode = code.replace(/m+$/, '');
            const partner = getMemberByCode(partnerCode, allMembers);
            return partner || member;
        }
        return member;
    }
    function getChildrenOf(member) {
        const blood = getBloodRelative(member);
        if (!blood) return [];
        return getDirectChildren(blood.PersonalCode, allMembers);
    }
    function getSonsOf(member) {
        return getChildrenOf(member).filter(c => /\.M\d+$/.test(String(c.PersonalCode).trim()));
    }
    function getDaughtersOf(member) {
        return getChildrenOf(member).filter(c => /\.F\d+$/.test(String(c.PersonalCode).trim()));
    }
    function getOthersOf(member) {
        return getChildrenOf(member).filter(c => /\.N\d+$/.test(String(c.PersonalCode).trim()));
    }

    function populateFamilyBox(m) {
        if (!m) return;
        const container = document.getElementById('familyContent');
        if (!container) return;

        const blood = getBloodRelative(m);
        const spouses = getAllSpousesOf(blood);
        const sons = getSonsOf(blood);
        const daughters = getDaughtersOf(blood);
        const others = getOthersOf(blood);

        const sonsWithSpouse = sons.map(s => ({ member: s, spouse: getAllSpousesOf(s)[0] || null }));
        const daughtersWithSpouse = daughters.map(d => ({ member: d, spouse: getAllSpousesOf(d)[0] || null }));
        const othersWithSpouse = others.map(o => ({ member: o, spouse: getAllSpousesOf(o)[0] || null }));

        const grandsonsWithSpouse = [];
        const granddaughtersWithSpouse = [];
        const grandothersWithSpouse = [];

        const collectGrandchildren = (parent) => {
            getSonsOf(parent).forEach(gs => {
                if (!grandsonsWithSpouse.some(x => x.member.PersonalCode === gs.PersonalCode)) {
                    grandsonsWithSpouse.push({ member: gs, spouse: getAllSpousesOf(gs)[0] || null });
                }
            });
            getDaughtersOf(parent).forEach(gd => {
                if (!granddaughtersWithSpouse.some(x => x.member.PersonalCode === gd.PersonalCode)) {
                    granddaughtersWithSpouse.push({ member: gd, spouse: getAllSpousesOf(gd)[0] || null });
                }
            });
            getOthersOf(parent).forEach(go => {
                if (!grandothersWithSpouse.some(x => x.member.PersonalCode === go.PersonalCode)) {
                    grandothersWithSpouse.push({ member: go, spouse: getAllSpousesOf(go)[0] || null });
                }
            });
        };
        sons.forEach(collectGrandchildren);
        daughters.forEach(collectGrandchildren);
        others.forEach(collectGrandchildren);

        let html = '';
        html += `
            <div class="family-section family-hero">
                <div class="family-section-title"><i class="fas fa-home"></i> घरमुली</div>
                ${renderFamilyMemberCard(blood, 'primary', null, null)}
            </div>
        `;
        if (spouses.length > 0) {
            const spouseHeadingLabel = (blood.Gender === 'F') ? 'श्रीमान' : 'श्रीमती';
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-heart"></i> ${spouseHeadingLabel}${spouses.length > 1 ? ` (${spouses.length})` : ''}
                    </div>
                    <div class="family-cards-grid">
                        ${spouses.map((sp) => {
                            const rank = getSpouseRank(sp.PersonalCode);
                            let label = spouseHeadingLabel;
                            if (spouses.length > 1) label += ` #${rank}`;
                            return renderFamilyMemberCard(sp, 'spouse', null, null, label);
                        }).join('')}
                    </div>
                </div>
            `;
        }
        if (sonsWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-mars"></i> छोराहरू (${sonsWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${sonsWithSpouse.map(x => renderFamilyMemberCard(x.member, 'son', x.spouse, 'बुहारी')).join('')}
                    </div>
                </div>
            `;
        }
        if (daughtersWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-venus"></i> छोरीहरू (${daughtersWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${daughtersWithSpouse.map(x => renderFamilyMemberCard(x.member, 'daughter', x.spouse, 'ज्वाइँ')).join('')}
                    </div>
                </div>
            `;
        }
        if (othersWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-venus-mars"></i> अन्य सन्तानहरू (${othersWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${othersWithSpouse.map(x => renderFamilyMemberCard(x.member, 'other', x.spouse, 'जीवनसाथी')).join('')}
                    </div>
                </div>
            `;
        }
        if (grandsonsWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-child"></i> नातिहरू (${grandsonsWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${grandsonsWithSpouse.map(x => renderFamilyMemberCard(x.member, 'grandson', x.spouse, 'नाति बुहारी')).join('')}
                    </div>
                </div>
            `;
        }
        if (granddaughtersWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-child"></i> नातिनीहरू (${granddaughtersWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${granddaughtersWithSpouse.map(x => renderFamilyMemberCard(x.member, 'granddaughter', x.spouse, 'नातिनी ज्वाइँ')).join('')}
                    </div>
                </div>
            `;
        }
        if (grandothersWithSpouse.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title"><i class="fas fa-child"></i> अन्य नाति-नातिनीहरू (${grandothersWithSpouse.length})</div>
                    <div class="family-cards-grid">
                        ${grandothersWithSpouse.map(x => renderFamilyMemberCard(x.member, 'grandother', x.spouse, 'नाति जीवनसाथी')).join('')}
                    </div>
                </div>
            `;
        }
        if (spouses.length === 0 && sonsWithSpouse.length === 0 && daughtersWithSpouse.length === 0 && othersWithSpouse.length === 0) {
            html += `<div class="family-empty"><i class="fas fa-info-circle"></i> यो सदस्यको लागि कुनै पारिवारिक जानकारी उपलब्ध छैन।</div>`;
        }
        container.innerHTML = html;
    }

    function renderFamilyMemberCard(m, role, sp, spLabel, customRoleLabel) {
        if (!m) return '';
        const photo = (m.PhotoUrl && m.PhotoUrl.trim() !== '') ? m.PhotoUrl : '../no_pic.png';
        const dob = formatDob(m);
        const roleClass = 'family-card-' + role;

        let spouseBlock = '';
        if (sp && sp.FullName) {
            const spPhoto = (sp.PhotoUrl && sp.PhotoUrl.trim() !== '') ? sp.PhotoUrl : '../no_pic.png';
            const spDob = formatDob(sp);
            spouseBlock = `
                <div class="family-card-spouse-block">
                    <div class="family-card-spouse-label"><i class="fas fa-heart"></i> ${escapeHtml(spLabel || 'जीवनसाथी')}</div>
                    <div class="family-card-spouse-inner">
                        <div class="family-card-spouse-photo">
                            <img src="${escapeHtml(spPhoto)}" alt="${escapeHtml(sp.FullName || '')}" loading="lazy">
                        </div>
                        <div class="family-card-spouse-info">
                            <div class="family-card-spouse-name">${escapeHtml(sp.FullName)}</div>
                            <div class="family-card-spouse-code"><i class="fas fa-qrcode"></i> ${escapeHtml(sp.PersonalCode || '-')}</div>
                            ${spDob && spDob !== '-' ? `<div class="family-card-spouse-dob"><i class="fas fa-calendar-alt"></i> ${escapeHtml(spDob)}</div>` : ''}
                            ${sp.Mobile ? `<div class="family-card-spouse-mobile"><i class="fas fa-phone"></i> ${escapeHtml(sp.Mobile)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        const roleRibbon = customRoleLabel ? `<div class="family-card-role">${escapeHtml(customRoleLabel)}</div>` : '';

        return `
            <div class="family-card ${roleClass}">
                ${roleRibbon}
                <div class="family-card-main">
                    <div class="family-card-photo">
                        <img src="${escapeHtml(photo)}" alt="${escapeHtml(m.FullName || '')}" loading="lazy">
                    </div>
                    <div class="family-card-info">
                        <div class="family-card-name">${escapeHtml(m.FullName || '-')}</div>
                        <div class="family-card-code"><i class="fas fa-qrcode"></i> ${escapeHtml(m.PersonalCode || '-')}</div>
                        <div class="family-card-dob"><i class="fas fa-calendar-alt"></i> ${escapeHtml(dob)}</div>
                        ${m.Address ? `<div class="family-card-address"><i class="fas fa-map-pin"></i> ${escapeHtml(m.Address)}</div>` : ''}
                        ${m.Mobile ? `<div class="family-card-mobile"><i class="fas fa-phone"></i> ${escapeHtml(m.Mobile)}</div>` : ''}
                    </div>
                </div>
                ${spouseBlock}
            </div>
        `;
    }

    // ---------- Ancestor Box ----------
    function getAncestorChain(m) {
        if (!m || !m.PersonalCode) return [];
        const blood = getBloodRelative(m);
        const chain = [];
        let code = String(blood.PersonalCode).trim();
        let safety = 40;
        while (code && safety-- > 0) {
            let node = getMemberByCode(code, allMembers);
            if (!node) node = findAncestorMemberByBranch(code);
            if (node && !chain.some(c => c.PersonalCode === node.PersonalCode)) {
                chain.unshift(node);
            }
            const parentBranch = getParentBranch(code);
            if (!parentBranch || parentBranch === code) break;
            code = parentBranch;
        }
        return chain;
    }

    function populateAncestorBox(m) {
        if (!m) return;
        const container = document.getElementById('ancestorContent');
        if (!container) return;
        const chain = getAncestorChain(m);
        if (chain.length === 0) {
            container.innerHTML = `<div class="family-empty"><i class="fas fa-info-circle"></i> कुनै वंशावली जानकारी उपलब्ध छैन।</div>`;
            return;
        }
        const rootMember = chain[0];
        const rootName = rootMember.FullName || 'मूल पुरूष';
        const generationCount = chain.length - 1;
        const targetName = m.FullName || '-';

        let html = `
            <div class="ancestor-summary">
                <div class="ancestor-summary-line">
                    <i class="fas fa-sitemap"></i>
                    <span>${escapeHtml(rootName)}बाट <strong>${escapeHtml(targetName)}</strong> सम्मको वंशावली</span>
                </div>
                <div class="ancestor-summary-count">कुल पुस्ता: <strong>${generationCount}</strong></div>
            </div>
            <div class="ancestor-chain">
        `;
        chain.forEach((ancestor, idx) => {
            const isRoot = (idx === 0);
            const isSelected = (ancestor.PersonalCode === m.PersonalCode);
            const generation = getGenerationFromCode(ancestor.PersonalCode);
            const photo = (ancestor.PhotoUrl && ancestor.PhotoUrl.trim() !== '') ? ancestor.PhotoUrl : '../no_pic.png';
            let nodeClasses = 'ancestor-node';
            if (isRoot)     nodeClasses += ' ancestor-originator';
            if (isSelected) nodeClasses += ' ancestor-selected';
            const roleLabel = isRoot ? 'मूल पुरूष' : `पुस्ता ${generation}`;

            html += `
                <div class="${nodeClasses}">
                    <div class="ancestor-step">
                        <span class="ancestor-step-badge ${isRoot ? 'badge-originator' : ''}">${isRoot ? '★' : generation}</span>
                    </div>
                    <div class="ancestor-card">
                        <div class="ancestor-card-role">${roleLabel}</div>
                        <div class="ancestor-card-photo">
                            <img src="${escapeHtml(photo)}" alt="${escapeHtml(ancestor.FullName || '')}" loading="lazy">
                        </div>
                        <div class="ancestor-card-info">
                            <div class="ancestor-card-name">${escapeHtml(ancestor.FullName || '-')}</div>
                            <div class="ancestor-card-code"><i class="fas fa-qrcode"></i> ${escapeHtml(ancestor.PersonalCode || '-')}</div>
                            <div class="ancestor-card-dob"><i class="fas fa-calendar-alt"></i> ${escapeHtml(formatDob(ancestor))}</div>
                            ${ancestor.Address ? `<div class="ancestor-card-address"><i class="fas fa-map-pin"></i> ${escapeHtml(ancestor.Address)}</div>` : ''}
                            ${ancestor.Mobile ? `<div class="ancestor-card-mobile"><i class="fas fa-phone"></i> ${escapeHtml(ancestor.Mobile)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
            if (idx < chain.length - 1) {
                html += `
                    <div class="ancestor-connector">
                        <span class="ancestor-connector-line"></span>
                        <i class="fas fa-chevron-down ancestor-connector-arrow"></i>
                    </div>
                `;
            }
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // ------------------------------------------------------------
    // 10. Save as Image
    // ------------------------------------------------------------
    function saveElementAsImage(elementId, filename, saveBtn) {
        const element = document.getElementById(elementId);
        if (!element) { alert('तस्वीर सुरक्षित गर्न मिलेन।'); return; }
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        const clone = element.cloneNode(true);
        clone.querySelectorAll('button, .save-btn-icon, .btn-group').forEach(btn => btn.remove());
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = element.scrollWidth + 'px';
        tempContainer.style.background = '#ffffff';
        tempContainer.appendChild(clone);
        document.body.appendChild(tempContainer);

        html2canvas(clone, {
            scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
            width: clone.scrollWidth, height: clone.scrollHeight,
            windowWidth: clone.scrollWidth, windowHeight: clone.scrollHeight
        }).then(canvas => {
            document.body.removeChild(tempContainer);
            const link = document.createElement('a');
            link.download = filename || 'member-details.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i>'; }
        }).catch(error => {
            console.error('Error generating image:', error);
            document.body.removeChild(tempContainer);
            alert('तस्वीर सुरक्षित गर्न मिलेन।');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i>'; }
        });
    }

    function makeFilename(prefix) {
        if (!currentSelectedMember) return 'member.jpg';
        const safe = (currentSelectedMember.FullName || 'member').replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, '_');
        const code = (currentSelectedMember.PersonalCode || 'code').replace(/\./g, '-');
        return `${safe}_${code}_${prefix}.jpg`;
    }

    function saveMainViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('DescriptionBox', makeFilename('short'), document.getElementById('btnSaveImage'));
    }
    function saveDetailViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('modalCaptureArea', makeFilename('detail'), document.getElementById('btnSaveDetailImage'));
    }
    function saveFamilyViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('familyCaptureArea', makeFilename('family'), document.getElementById('btnSaveFamilyImage'));
    }
    function saveAncestorViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('ancestorCaptureArea', makeFilename('ancestors'), document.getElementById('btnSaveAncestorImage'));
    }

    // ------------------------------------------------------------
    // 11. Init
    // ------------------------------------------------------------
    function init() {
        initViewToggleButtons();
        initSearchModeButtons();

        // ✅ Wire the text comboboxes AFTER DOM is ready
        wireTextCombobox('NameSearchInput', 'NameSearchResults', refreshNameResults, {
            getResults: () => nameCurrentResults,
            getHighlight: () => nameHighlightedIndex,
            setHighlight: (v) => { nameHighlightedIndex = v; },
            pick: onPickNameResult,
            getPicked: () => namePickedMember,
            setPicked: (v) => { namePickedMember = v; },
            getRawValue: () => nameInputRawValue,
            setRawValue: (v) => { nameInputRawValue = v; }
        });

        wireTextCombobox('CodeSearchInput', 'CodeSearchResults', refreshCodeResults, {
            getResults: () => codeCurrentResults,
            getHighlight: () => codeHighlightedIndex,
            setHighlight: (v) => { codeHighlightedIndex = v; },
            pick: onPickCodeResult,
            getPicked: () => codePickedMember,
            setPicked: (v) => { codePickedMember = v; },
            getRawValue: () => codeInputRawValue,
            setRawValue: (v) => { codeInputRawValue = v; }
        });

        document.getElementById('btnSaveImage')?.addEventListener('click', saveMainViewAsImage);
        document.getElementById('btnSaveDetailImage')?.addEventListener('click', saveDetailViewAsImage);
        document.getElementById('btnSaveFamilyImage')?.addEventListener('click', saveFamilyViewAsImage);
        document.getElementById('btnSaveAncestorImage')?.addEventListener('click', saveAncestorViewAsImage);

        hideAllSearchPanels();

        // Do NOT activate any search mode by default.
        Object.keys(MODE_BOX_IDS).forEach(key => {
            const box = document.getElementById(MODE_BOX_IDS[key]);
            const btn = document.getElementById(MODE_BTN_IDS[key]);
            if (box) box.classList.remove('is-active');
            if (btn) btn.classList.remove('active');
        });
        currentSearchMode = null;

        // Start with all 4 view buttons disabled (nothing selected yet)
        updateMemberDisplay();

        loadMembers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('✅ SearchPage ready');
})();