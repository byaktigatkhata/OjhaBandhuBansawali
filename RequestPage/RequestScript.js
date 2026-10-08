// RequestScript.js - Public suggestion form (v6)
// Robust roman search that works even without Sanscript CDN.

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Supabase
    // ------------------------------------------------------------
    if (!window.SupabaseConfig || !window.SupabaseConfig.supabase) {
        console.error('❌ SupabaseConfig.js not loaded properly!');
        alert('Configuration error: SupabaseConfig.js is missing.');
        return;
    }
    const supabase = window.SupabaseConfig.supabase;
    const SUPABASE_ANON_KEY = window.SupabaseConfig.SUPABASE_ANON_KEY;
    const EDGE_FUNCTION_URL =
        'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-to-imgbb';

    // ------------------------------------------------------------
    // 2. State
    // ------------------------------------------------------------
    let allMembers = [];

    let selectedExistingMember = null;
    let existingHighlightedIndex = -1;
    let existingCurrentResults = [];
    let existingSubmitting = false;

    let newRelation = '';
    let selectedConnectedMember = null;
    let newHighlightedIndex = -1;
    let newCurrentResults = [];
    let newSubmitting = false;

    let previewContext = null;

    let cropImageData = null;
    let cropImage = null;
    let cropZoom = 1;
    let cropRotation = 0;
    let cropBox = { x: 0, y: 0, w: 0, h: 0 };
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartBox = null;
    let imageRect = null;
    let cropTargetFlow = '';
    let cropSourceFile = null;

    // ------------------------------------------------------------
    // 2b. Roman (transliteration) index
    // ------------------------------------------------------------
    const memberRomanIndex = new Map();

    /** Built-in Devanagari → Roman fallback (used when Sanscript is absent). */
    const DEV_FALLBACK = [
        // conjuncts / vowel signs first
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
        //थरहरू
        'ओझा':    ['ojha', 'ozha'], 'शर्मा':   ['sharma'], 'भट्ट':   ['bhatta', 'bhatt'],
        'आचार्य': ['acharya', 'achariya'], 'पौडेल':  ['paudel', 'poudel'], 'अधिकारी': ['adhikari'],
        'दाहाल':   ['dahal'], 'खनाल':   ['khanal'], 'श्रेष्ठ': ['shrestha', 'srestha'], 'महर्जन': ['maharjan'],
        'गौतम':   ['gautam'], 'पाण्डे': ['pandey', 'pande'], 'त्रिपाठी':['tripathi', 'tiwari'],
        'चौधरी':  ['chaudhary', 'chaudhari'], 'काफ्ले': ['kafle', 'kaphle'], 'दंगाल': ['dangal'],
        'गुप्ता': ['gupta'], 'यादव': ['yadav'], 'बन्जरा': ['banjra'], 'ढकाल': ['dhakal'],
        'न्यौपाने': ['nyoupane'], 'नेउपाने': ['neupane'], 'अचार्ज': ['acharj'], 'अर्याल': ['aryal'],
        'बाँसकोटा': ['bansakota', 'basakota'], 'बाँस्कोटा': ['banskota'], 'बाँस्तोला': ['bansatola'],
        'बाँसतोला': ['basatola'], 'पौडेल': ['paudel', 'poudel'], 'शिवाकोटी': ['shivakoti', 'shiwakoti'],
        'प्रसाइँ': ['prasaain', 'prasain'], 'पर्साइँ': ['parsain'], 'चुडाल': ['chudal'],
        'चुँडाल': ['chundal'], 'भट्टराई': ['bhattarai'], 'भटराई': ['bhatrai'], 'भण्डारी': ['bhandari'],
        'गुरागाइँ': ['guragain'], 'चापागाइँ': ['chhapagain'], 'उप्रेती': ['upreti'], 'राउत': ['raut'],
        'तिमिल्सिना': ['timilsina'], 'तिमल्सिना': ['timalsina'], 'तिम्सिना': ['timsinA'],
        'उपाध्याय': ['upadhyay'], 'पोखरेल': ['pokharel'], 'पोख्रेल': ['pokhrel'],
        'खरेल': ['kharal'], 'खराल': ['kharal'], 'नेपाली': ['nepali'], 'सिग्देल': ['sigdel'],
        'सिक्तेल': ['siktel'], 'सिटौला': ['sitaula'], 'महत': ['mahat'], 'महत्तो': ['mahatto'],
        'राई': ['rai'], 'लिम्बु': ['limbu'], 'मैनाली': ['mainali'], 'वस्ती': ['vasti'],
        'ओस्ती': ['osthi'], 'ओली': ['oli'], 'थपलिया': ['thapliya'], 'तिवारी': ['tivari'],
        'तियारी': ['tiyari'], 'गौतम': ['gautam'], 'गोतामे': ['gotame'], 'रिजाल': ['rizal'],
        'क्षेत्री': ['kshetri'], 'पराजुली': ['parajuli'], 'ढुंगेल': ['dungel'], 'ढुङ्गेल': ['dungel'],
        'नेपाल': ['nepal'], 'रिसेल': ['risel'], 'रिमाल': ['rimal'], 'घिमिरे': ['ghimire'],
        'कार्की': ['karki'], 'थापा': ['thapa'], 'बस्नेत': ['basnet'], 'रावल': ['raval'],
        'तामाङ': ['tamang'], 'मगर': ['magar'], 'गुरुङ': ['gurung'], 'शेर्पा': ['sherpa'],
        'लामा': ['lama'],
        //बिचका नामहरू
        'प्रसाद':  ['prasad', 'prashad'], 'बहादुर':  ['bahadur'], 'कुमार':   ['kumar'],
        'कुमारी': ['kumari'], 'देवी':    ['devi'], 'लाल':    ['lal'],
        'नारायण':  ['narayan', 'narayana','naran'],        
        //शुरूका नामहरू        
        'विष्णु':  ['bishnu', 'bisnu', 'vishnu'], 'लक्ष्मी': ['laxmi', 'lakshmi'],
        'गणेश':   ['ganesh'], 'कृष्ण':   ['krishna', 'krisna'], 'राम':    ['ram'],
        'श्याम':   ['shyam', 'syam'], 'सीता':    ['sita'], 'गीता':    ['gita', 'geeta'],
        'हरि':     ['hari'], 'विनोद':   ['binod', 'vinod'], 'सुशीला':  ['sushila', 'susila'],
        'जय':     ['jay', 'jai', 'jaya'], 'नारायन':  ['narayan', 'narayana'],
        'प्रेम': ['prem'], 'यज्ञ': ['yajna'], 'मनोज': ['manoj'], 'सनोज': ['sonoj'],
        'भिम': ['bhim'], 'सन्तोष': ['santosh'], 'विपिन': ['vipin'], 'रमेश': ['ramesh'],
        'उमेश': ['umesh'], 'तारा': ['tara'],'अ': ['a'], 'आ': ['aa'], 'इ': ['i'],
        'ई': ['ii'], 'उ': ['u'], 'ऊ': ['uu'], 'ए': ['e'], 'ऐ': ['ai'], 'ओ': ['o'], 'औ': ['au'],
        'अं': ['am'], 'क': ['k'], 'का': ['ka'], 'कि': ['ki'], 'की': ['ki'], 'कु': ['ku'],
        'कू': ['ku'], 'के': ['ke'], 'कै': ['kai'], 'को': ['ko'], 'कौ': ['kau'], 'कं': ['kam'],
        'ख': ['kh'], 'खा': ['kha'], 'खि': ['khi'], 'खी': ['khi'], 'खु': ['khu'], 'खू': ['khu'],
        'खे': ['khe'], 'खै': ['khai'], 'खो': ['kho'], 'खौ': ['khou'], 'ग': ['g'], 'गा': ['ga'],
        'गि': ['gi'], 'गी': ['gi'], 'गु': ['gu'], 'गू': ['gu'], 'गे': ['ge'], 'गै': ['gai'],
        'गो': ['go'], 'गौ': ['gau'], 'गं': ['gam'], 'घ': ['gh'], 'घा': ['gha'], 'घि': ['ghi'],
        'घी': ['ghi'], 'घु': ['ghu'], 'घू': ['ghu'], 'घे': ['ghe'], 'घै': ['ghai'], 'घो': ['gho'],
        'घौ': ['ghou'], 'ङ': ['nga'], 'च': ['ch'], 'चा': ['cha'], 'चि': ['chi'], 'ची': ['chi'],
        'चु': ['chu'], 'चू': ['chu'], 'चे': ['che'], 'चै': ['chai'], 'चो': ['cho'], 'चौ': ['chou'],
        'चं': ['cham'], 'छ': ['ch'], 'छा': ['cha'], 'छि': ['chi'], 'छी': ['chi'], 'छु': ['chu'],
        'छू': ['chu'], 'छे': ['che'], 'छै': ['chai'], 'छो': ['cho'], 'छौ': ['chou'], 'ज': ['j'],
        'जा': ['ja'], 'जि': ['ji'], 'जी': ['ji'], 'जु': ['ju'], 'जू': ['ju'], 'जे': ['je'],
        'जै': ['jai'], 'जो': ['jo'], 'जौ': ['jau'], 'जं': ['jam'], 'झ': ['jha'], 'झा': ['jha'],
        'झि': ['jhi'], 'झी': ['jhi'], 'झु': ['jhu'], 'झू': ['jhu'], 'झे': ['jhe'], 'झै': ['jhai'],
        'झो': ['jho'], 'झौ': ['jhau'], 'ञ': ['nya'], 'ट': ['t'], 'टा': ['ta'], 'टि': ['ti'],
        'टी': ['ti'], 'टु': ['tu'], 'टू': ['tu'], 'टे': ['te'], 'टै': ['tai'], 'टो': ['to'],
        'टौ': ['tau'], 'टं': ['tam'], 'ठ': ['th'], 'ठा': ['tha'], 'ठि': ['thi'], 'ठी': ['thi'],
        'ठु': ['thu'], 'ठू': ['thu'], 'ठे': ['the'], 'ठै': ['thai'], 'ठो': ['tho'], 'ठौ': ['thou'],
        'ठं': ['tham'], 'ड': ['d'], 'डा': ['da'], 'डि': ['di'], 'डी': ['di'], 'डु': ['du'],
        'डू': ['du'], 'डे': ['de'], 'डै': ['dai'], 'डो': ['do'], 'डौ': ['dau'], 'डं': ['dam'],
        'ण': ['na'], 'त': ['t'], 'ता': ['ta'], 'ति': ['ti'], 'ती': ['ti'], 'तु': ['tu'],
        'तू': ['tu'], 'ते': ['te'], 'तै': ['tai'], 'तो': ['to'], 'तौ': ['tou'], 'तं': ['tam'],
        'थ': ['th'], 'था': ['tha'], 'थि': ['thi'], 'थी': ['thi'], 'थु': ['thu'], 'थू': ['thu'],
        'थे': ['the'], 'थै': ['thai'], 'थो': ['tho'], 'थौ': ['thou'], 'थं': ['tham'], 'द': ['d'],
        'दा': ['da'], 'दि': ['di'], 'दी': ['di'], 'दु': ['du'], 'दू': ['du'], 'दे': ['de'],
        'दै': ['dai'], 'दो': ['do'], 'दौ': ['dau'], 'दं': ['dam'], 'ध': ['dh'], 'धा': ['dha'],
        'धि': ['dhi'], 'धी': ['dhi'], 'धु': ['dhu'], 'धू': ['dhu'], 'धे': ['dhe'], 'धै': ['dhai'],
        'धो': ['dho'], 'धौ': ['dhau'], 'धं': ['dham'], 'न': ['na'], 'ना': ['na'], 'नि': ['ni'],
        'नी': ['ni'], 'नु': ['nu'], 'नू': ['nu'], 'ने': ['ne'], 'नै': ['nai'], 'नो': ['no'],
        'नौ': ['nau'], 'नं': ['nam'], 'प': ['p'], 'पा': ['pa'], 'पि': ['pi'], 'पी': ['pi'],
        'पु': ['pu'], 'पू': ['pu'], 'पे': ['pe'], 'पै': ['pai'], 'पो': ['po'], 'पौ': ['pau'],
        'पं': ['pam'], 'फ': ['ph'], 'फा': ['pha'], 'फि': ['phi'], 'फी': ['phi'], 'फु': ['phu'],
        'फू': ['phu'], 'फे': ['phe'], 'फै': ['phai'], 'फो': ['pho'], 'फौ': ['phou'],
        'फं': ['pham'], 'ब': ['b'], 'बा': ['ba'], 'बि': ['bi'], 'बी': ['bi'], 'बु': ['bu'],
        'बू': ['bu'], 'बे': ['be'], 'बै': ['bai'], 'बो': ['bo'], 'बौ': ['bau'], 'बं': ['bam'],
        'भ': ['bh'], 'भा': ['bha'], 'भि': ['bhi'], 'भी': ['bhi'], 'भु': ['bhu'], 'भू': ['bhu'],
        'भे': ['bhe'], 'भै': ['bhai'], 'भो': ['bho'], 'भौ': ['bhou'], 'भं': ['bham'],
        'म': ['m'], 'मा': ['ma'], 'मि': ['mi'], 'मी': ['mi'], 'मु': ['mu'], 'मू': ['mu'],
        'मे': ['me'], 'मै': ['mai'], 'मो': ['mo'], 'मौ': ['mau'], 'मं': ['nam'], 'य': ['y'],
        'या': ['ya'], 'यि': ['yi'], 'यी': ['yi'], 'यु': ['yu'], 'यू': ['yu'], 'ये': ['ye'],
        'यै': ['yai'], 'यो': ['yo'], 'यौ': ['yau'], 'यं': ['yam'],  'र': ['r'], 'रा': ['ra'],
        'रि': ['ri'], 'री': ['ri'], 'रु': ['ru'], 'रू': ['ru'], 'रे': ['re'], 'रै': ['rai'],
        'रो': ['ro'], 'रौ': ['rau'], 'रं': ['ram'], 'ल': ['l'], 'ला': ['la'], 'लि': ['li'],
        'ली': ['li'], 'लु': ['lu'], 'लू': ['lu'], 'ले': ['le'], 'लै': ['lai'], 'लो': ['lo'],
        'लौ': ['lau'], 'लं': ['lam'], 'व': ['v'], 'वा': ['va'], 'वि': ['vi'], 'वी': ['vi'],
        'वु': ['vu'], 'वू': ['vu'], 'वे': ['ve'], 'वै': ['vai'], 'वो': ['vo'], 'वौ': ['vau'],
        'वं': ['vam'], 'श': ['sh'], 'शा': ['sha'], 'शि': ['shi'], 'शी': ['shi'], 'शु': ['shu'],
        'शू': ['shu'], 'शे': ['she'], 'शै': ['shai'], 'शो': ['sho'],  'शौ': ['shou'], 'शं': ['sham'],
        'ष': ['sh'], 'षा': ['sha'], 'षि': ['shi'], 'षी': ['shi'], 'षु': ['shu'], 'षू': ['shu'],
        'षे': ['she'], 'षै': ['shai'], 'षो': ['sho'], 'षौ': ['shou'], 'षं': ['sham'], 'स': ['s'],
        'सा': ['sa'], 'सि': ['si'], 'सी': ['si'], 'सु': ['su'], 'सू': ['su'], 'से': ['se'],
        'सै': ['sai'], 'सो': ['so'], 'सौ': ['sau'], 'सं': ['sam'], 'ह': ['h'], 'हा': ['ha'],
        'हि': ['hi'], 'ही': ['hi'], 'हु': ['hu'], 'हू': ['hu'], 'हे': ['he'], 'है': ['hai'],
        'हो': ['ho'], 'हौ': ['hou'], 'हं': ['ham'], 'क्ष': ['ksh'], 'क्षा': ['ksha'], 'क्षि': ['kshi'],
        'क्षी': ['kshi'], 'क्षु': ['kshu'], 'क्षू': ['kshu'], 'क्षे': ['kshe'], 'क्षै': ['kshai'],
        'क्षो': ['ksho'], 'क्षौ': ['kshou'], 'क्षं': ['ksham'], 'त्र': ['tr'], 'त्रा': ['tra'],
        'त्रि': ['tri'], 'त्री': ['tri'], 'त्रु': ['tru'], 'त्रू': ['tru'], 'त्रे': ['tre'], 'त्रै': ['trai'],
        'त्रो': ['tro'], 'त्रौ': ['trou'], 'त्रं': ['tram'], 'ज्ञ': ['jnya'], 'ज्ञा': ['jnyaa'],
        'ज्ञि': ['jnyi'], 'ज्ञी': ['jnyi'], 'ज्ञु': ['jnyu'], 'ज्ञू': ['jnyu'], 'ज्ञे': ['jnye'],
        'ज्ञै': ['jnyai'], 'ज्ञो': ['jnyo'], 'ज्ञौ': ['jnyou'], 'ज्ञं': ['jnyam'],
        
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
            for (let len = 2; len <= word.length; len++) {
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
    // 3. DOM helpers
    // ------------------------------------------------------------
    const $ = (id) => document.getElementById(id);

    function safeVal(id) {
        const el = $ (id);
        if (!el) { console.warn(`⚠️ safeVal: #${id} missing`); return ''; }
        return String(el.value == null ? '' : el.value).trim();
    }
    function safeSelectVal(id, fallback) {
        const el = $ (id);
        if (!el) { console.warn(`⚠️ safeSelectVal: #${id} missing`); return fallback; }
        return String(el.value == null ? fallback : el.value);
    }
    function setSafeVal(id, value) {
        const el = $ (id);
        if (!el) return;
        el.value = value == null ? '' : value;
    }
    function setChecked(id, value) {
        const el = $ (id);
        if (el) el.checked = !!value;
    }

    function updateExistingSubmitVisibility() {
        const chk = $ ('exConsentCheck');
        const btn = $ ('exBtnSubmit');
        if (!chk || !btn) return;
        btn.style.display = chk.checked ? '' : 'none';
    }
    function updateNewSubmitVisibility() {
        const chk = $ ('newConsentCheck');
        const btn = $ ('newBtnSubmit');
        if (!chk || !btn) return;
        btn.style.display = chk.checked ? '' : 'none';
    }

    // ------------------------------------------------------------
    // 4. Code + gender helpers
    // ------------------------------------------------------------
    const GENDER_BLOCK_REGEX = /\.([MFN])(\d+)$/;

    function normalizeGender(g) {
        if (!g) return '';
        const s = String(g).trim().toUpperCase();
        if (s === 'O') return 'N';
        return s;
    }
    function isRootCode(code) { return !!code && /^[A-Z]$/.test(String(code).trim()); }
    function isSpouseCode(code) { return !!code && /m+$/.test(String(code).trim()); }
    function getGenderLetter(code) {
        if (!code) return '';
        const m = String(code).match(GENDER_BLOCK_REGEX);
        return m ? m[1] : '';
    }
    function getGenderOfMember(m) {
        if (!m) return '';
        const gl = getGenderLetter(m.PersonalCode);
        if (gl) return gl;
        return normalizeGender(m.Gender);
    }
    function getGenderLabel(m) {
        const g = getGenderOfMember(m);
        if (g === 'M') return 'पुरुष (Male)';
        if (g === 'F') return 'महिला (Female)';
        if (g === 'N') return 'अन्य (Other)';
        return '—';
    }
    function getSpouseRank(code) {
        if (!code) return 0;
        const m = String(code).trim().match(/m+$/);
        return m ? m[0].length : 0;
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

    // ------------------------------------------------------------
    // 5. Feedback / errors
    // ------------------------------------------------------------
    function showFeedback(msg, kind) {
        const el = $ ('formFeedback');
        if (!el) return;
        el.className = 'is-visible ' + (kind ? 'is-' + kind : 'is-info');
        el.innerHTML = msg;
        setTimeout(() => {
            if (el.innerHTML === msg) {
                el.className = '';
                el.innerHTML = '';
            }
        }, 5000);
    }
    function clearFeedback() {
        const el = $ ('formFeedback');
        if (!el) return;
        el.className = '';
        el.innerHTML = '';
    }
    function setFieldError(fieldId, message) {
        const field = $ (fieldId);
        const errEl = $ ('err-' + fieldId);
        if (field) {
            const group = field.closest('.form-group');
            if (group) group.classList.add('has-error');
        }
        if (errEl) errEl.textContent = message || '';
    }
    function clearFieldError(fieldId) {
        const field = $ (fieldId);
        const errEl = $ ('err-' + fieldId);
        if (field) {
            const group = field.closest('.form-group');
            if (group) group.classList.remove('has-error');
        }
        if (errEl) errEl.textContent = '';
    }
    function clearAllFieldErrorsInForm(formId) {
        const form = $ (formId);
        if (!form) return;
        form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
        form.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    }
    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button._originalText = button.innerHTML;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'प्रक्रिया चलिरहेको छ...'}`;
        } else {
            button.disabled = false;
            button.innerHTML = button._originalText || button.innerHTML;
        }
    }

    // ------------------------------------------------------------
    // 6. Filtering + row rendering
    // ------------------------------------------------------------
    function filterMembers(query, options) {
        options = options || {};
        const includeSpouses = options.includeSpouses === true;
        const genderFilter = options.genderFilter || null;

        const q = (query || '').trim().toLowerCase();
        let list = allMembers.filter(m => {
            if (!m || !m.PersonalCode) return false;
            const code = String(m.PersonalCode).trim();
            if (code === '') return false;
            if (!includeSpouses && /m+$/.test(code)) return false;
            return true;
        });

        if (genderFilter === 'M' || genderFilter === 'F') {
            list = list.filter(m => getGenderOfMember(m) === genderFilter);
        }

        if (q) {
            list = list.filter(m => {
                const code = (m.PersonalCode || '').toLowerCase();
                const name = (m.FullName || '').toLowerCase();
                if (code.includes(q) || name.includes(q)) return true;
                return memberMatchesRoman(m, q);
            });
        }

        return list.sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    function buildRowHtml(m) {
        const code = String(m.PersonalCode || '');
        const rank = getSpouseRank(code);
        let emoji = '';
        const gl = getGenderOfMember(m);
        if (gl === 'M') emoji = '♂️';
        else if (gl === 'F') emoji = '♀️';
        else if (gl === 'N') emoji = '⚧️';

        let spouseLabel = '';
        if (rank > 0) {
            if (rank === 1) spouseLabel = '👰 ';
            else if (rank === 2) spouseLabel = '👰(२) ';
            else if (rank === 3) spouseLabel = '👰(३) ';
            else spouseLabel = `👰(${rank}) `;
        }

        return `
            <span class="ci-emoji">${spouseLabel}${emoji}</span>
            <span class="ci-code">${escapeHtml(code || '-')}</span>
            <span class="ci-name">${escapeHtml(m.FullName || '')}</span>
        `;
    }

    function renderResults(resultsEl, results, highlightedIndex, onPick) {
        if (results.length === 0) {
            resultsEl.hidden = false;
            resultsEl.innerHTML = `<div class="combobox-empty">कुनै मिल्दो व्यक्ति भेटिएन</div>`;
            return;
        }
        resultsEl.hidden = false;
        resultsEl.innerHTML = results.map((m, i) => {
            const cls = 'combobox-item' + (i === highlightedIndex ? ' is-highlighted' : '');
            return `<div class="${cls}" data-index="${i}" role="option">${buildRowHtml(m)}</div>`;
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

    function closeCombobox(el) { if (el) el.hidden = true; }

    // ------------------------------------------------------------
    // 7. Flows
    // ------------------------------------------------------------
    function hideAllFlows() {
        const ex = $ ('ExistingMemberFlow');
        const nw = $ ('NewMemberFlow');
        const sp = $ ('SuccessPanel');
        if (ex) ex.style.display = 'none';
        if (nw) nw.style.display = 'none';
        if (sp) sp.style.display = 'none';
        $ ('btnEditExistingMember')?.classList.remove('active');
        $ ('btnAddNewMember')?.classList.remove('active');
    }
    function showExistingFlow() {
        hideAllFlows();
        const ex = $ ('ExistingMemberFlow');
        if (ex) ex.style.display = 'flex';
        $ ('btnEditExistingMember')?.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function showNewFlow() {
        hideAllFlows();
        const nw = $ ('NewMemberFlow');
        if (nw) nw.style.display = 'flex';
        $ ('btnAddNewMember')?.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function showSuccessPanel() {
        hideAllFlows();
        const sp = $ ('SuccessPanel');
        if (sp) sp.style.display = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ------------------------------------------------------------
    // 8. Pop-up
    // ------------------------------------------------------------
    function ensurePreviewModal() {
        if ($ ('memberPreviewModal')) return;
        const modal = document.createElement('div');
        modal.id = 'memberPreviewModal';
        modal.className = 'member-preview-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="member-preview-dialog">
                <div class="member-preview-header">
                    <h3><i class="fas fa-user-circle"></i> सदस्यको विवरण</h3>
                    <span class="member-preview-counter" id="memberPreviewCounter">—</span>
                </div>
                <div class="member-preview-body" id="memberPreviewBody"></div>
                <div class="member-preview-actions">
                    <button type="button" class="preview-btn preview-btn-nav" id="memberPreviewPrev">
                        <i class="fas fa-chevron-left"></i> अघिल्लो
                    </button>
                    <button type="button" class="preview-btn preview-btn-nav" id="memberPreviewNext">
                        अर्को <i class="fas fa-chevron-right"></i>
                    </button>
                    <button type="button" class="preview-btn preview-btn-reject" id="memberPreviewReject">
                        <i class="fas fa-times"></i> रद्द गर्नुहोस्
                    </button>
                    <button type="button" class="preview-btn preview-btn-confirm" id="memberPreviewConfirm">
                        <i class="fas fa-check"></i> यही सदस्य हो
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        $ ('memberPreviewPrev').addEventListener('click', () => navigatePreview(-1));
        $ ('memberPreviewNext').addEventListener('click', () => navigatePreview(1));
        $ ('memberPreviewReject').addEventListener('click', closePreviewModal);
        $ ('memberPreviewConfirm').addEventListener('click', confirmPreviewSelection);
        modal.addEventListener('click', (e) => { if (e.target === modal) closePreviewModal(); });
        document.addEventListener('keydown', (e) => {
            if ($ ('memberPreviewModal').style.display !== 'flex') return;
            if (e.key === 'Escape') closePreviewModal();
            else if (e.key === 'ArrowLeft') navigatePreview(-1);
            else if (e.key === 'ArrowRight') navigatePreview(1);
        });
    }

    function openPreviewModal(flow, results, index) {
        ensurePreviewModal();
        previewContext = { flow, results, index };
        renderPreviewMember();
        const modal = $ ('memberPreviewModal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    function closePreviewModal() {
        const modal = $ ('memberPreviewModal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
        previewContext = null;
    }
    function navigatePreview(direction) {
        if (!previewContext) return;
        const { results, index } = previewContext;
        if (results.length === 0) return;
        let nextIndex = index + direction;
        if (nextIndex < 0) nextIndex = results.length - 1;
        if (nextIndex >= results.length) nextIndex = 0;
        previewContext.index = nextIndex;
        renderPreviewMember();
    }
    function renderPreviewMember() {
        if (!previewContext) return;
        const { results, index } = previewContext;
        if (results.length === 0) return;
        const m = results[index];
        if (!m) return;
        const counter = $ ('memberPreviewCounter');
        if (counter) counter.textContent = `${index + 1} / ${results.length}`;
        const body = $ ('memberPreviewBody');
        if (!body) return;
        const photo = (m.PhotoUrl && String(m.PhotoUrl).trim() !== '') ? m.PhotoUrl : '../no_pic.png';
        const row = (label, value) => {
            const v = (value && String(value).trim() !== '') ? value : '—';
            return `<div class="preview-row"><div class="preview-row-label">${escapeHtml(label)}</div><div class="preview-row-value">${escapeHtml(v)}</div></div>`;
        };
        const spouseRank = getSpouseRank(m.PersonalCode);
        const spouseSuffix = spouseRank > 0 ? ` (${spouseRank === 1 ? 'पहिलो' : spouseRank === 2 ? 'दोस्रो' : `${spouseRank}औं`} श्रीमान/श्रीमती)` : '';
        body.innerHTML = `
            <div class="preview-hero">
                <div class="preview-hero-photo"><img src="${escapeHtml(photo)}" alt=""></div>
                <div class="preview-hero-info">
                    <div class="preview-hero-name">${escapeHtml(m.FullName || '—')}</div>
                    <div class="preview-hero-code"><i class="fas fa-qrcode"></i> ${escapeHtml(m.PersonalCode || '—')}${escapeHtml(spouseSuffix)}</div>
                    <div class="preview-hero-gender">${escapeHtml(getGenderLabel(m))}</div>
                </div>
            </div>
            <div class="preview-rows">
                ${row('जन्म मिति', m.DOB)}
                ${row('मृत्यु मिति / उमेर', m.DOD_Age)}
                ${row('बाबु', m.Father)}
                ${row('आमा', m.Mother)}
                ${row('श्रीमान/श्रीमती', m.Spouse)}
                ${row('ठेगाना', m.Address)}
                ${row('मोबाइल', m.Mobile)}
                ${row('इमेल', m.Email)}
                ${row('पेशा', m.Profession)}
                ${row('शैक्षिक योग्यता', m.Qualification)}
                ${row('परिवारमा स्थान', m.Position)}
            </div>
        `;
    }
    function confirmPreviewSelection() {
        if (!previewContext) return;
        const { flow, results, index } = previewContext;
        const m = results[index];
        closePreviewModal();
        if (!m) return;
        if (flow === 'existing') acceptExistingMember(m);
        else if (flow === 'new') acceptConnectedMember(m);
    }

    // ------------------------------------------------------------
    // 9. Existing Member flow
    // ------------------------------------------------------------
    function refreshExistingResults() {
        const input = $ ('ExistingMemberSearch');
        const resultsEl = $ ('existingMemberResults');
        if (!input || !resultsEl) return;
        const q = input.value || '';
        existingCurrentResults = filterMembers(q, { includeSpouses: true });
        if (q.trim() === '') existingHighlightedIndex = -1;
        renderResults(resultsEl, existingCurrentResults, existingHighlightedIndex, previewExisting);
    }
    function previewExisting(member) {
        closeCombobox($ ('existingMemberResults'));
        const idx = existingCurrentResults.findIndex(x => x.PersonalCode === member.PersonalCode);
        openPreviewModal('existing', existingCurrentResults, Math.max(0, idx));
    }
    function acceptExistingMember(member) {
        selectedExistingMember = member;
        const input = $ ('ExistingMemberSearch');
        if (input) input.value = member.PersonalCode || '';
        closeCombobox($ ('existingMemberResults'));
        const confirmBox = $ ('ExistingMemberConfirmBox');
        const codeEl = $ ('ExistingMemberCode');
        const nameEl = $ ('ExistingMemberName');
        if (confirmBox) confirmBox.style.display = 'block';
        if (codeEl) codeEl.textContent = member.PersonalCode || '—';
        if (nameEl) nameEl.textContent = member.FullName || '—';
        prefillExistingForm(member);
        const form = $ ('existingMemberForm');
        if (form) form.style.display = 'block';
        const selectBox = $ ('ExistingMemberSelectBox');
        if (selectBox) selectBox.style.display = 'none';
        updateExistingSubmitVisibility();
        setTimeout(() => form?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
    function prefillExistingForm(m) {
        if (!m) return;
        setSafeVal('exFullName', m.FullName || '');
        setSafeVal('exGender', normalizeGender(m.Gender) || 'M');
        setSafeVal('exDob', m.DOB || '');
        setSafeVal('exDodAge', m.DOD_Age || '');
        setSafeVal('exFather', m.Father || '');
        setSafeVal('exMother', m.Mother || '');
        setSafeVal('exSpouse', m.Spouse || '');
        setSafeVal('exSonsInput', m.Sons || '');
        setSafeVal('exDaughtersInput', m.Daughters || '');
        setSafeVal('exPosition', m.Position || '');
        setSafeVal('exAddress', m.Address || '');
        setSafeVal('exMobile', m.Mobile || '');
        setSafeVal('exEmail', m.Email || '');
        setSafeVal('exProfession', m.Profession || '');
        setSafeVal('exQualification', m.Qualification || '');
        setSafeVal('exDetailAddress', m.DetailAddress || '');
        setSafeVal('exDetailProfession', m.DetailProfession || '');
        setSafeVal('exLifeStory', m.LifeStory || '');
        setSafeVal('exPhotoUrl', m.PhotoUrl || '');
        setSafeVal('exPublicId', m.PublicId || '');
        const photo = $ ('exPhotoPreview');
        const fileName = $ ('exPhotoFileNameDisplay');
        if (photo) {
            if (m.PhotoUrl) { photo.src = m.PhotoUrl; photo.style.display = 'block'; }
            else { photo.src = ''; photo.style.display = 'none'; }
        }
        if (fileName) fileName.textContent = m.PhotoUrl ? 'अवस्थित फोटो' : 'कुनै फोटो छैन';
        setChecked('exConsentCheck', false);
        updateExistingSubmitVisibility();
    }
    function resetExistingFlow() {
        selectedExistingMember = null;
        setSafeVal('ExistingMemberSearch', '');
        closeCombobox($ ('existingMemberResults'));
        const confirmBox = $ ('ExistingMemberConfirmBox'); if (confirmBox) confirmBox.style.display = 'none';
        const form = $ ('existingMemberForm'); if (form) { form.reset(); form.style.display = 'none'; }
        const selectBox = $ ('ExistingMemberSelectBox'); if (selectBox) selectBox.style.display = 'flex';
        const photo = $ ('exPhotoPreview'); if (photo) { photo.src = ''; photo.style.display = 'none'; }
        const fileName = $ ('exPhotoFileNameDisplay'); if (fileName) fileName.textContent = 'कुनै फोटो छानिएको छैन';
        const status = $ ('exUploadStatus'); if (status) status.innerHTML = '';
        setSafeVal('exPhotoUrl', ''); setSafeVal('exPublicId', '');
        clearAllFieldErrorsInForm('existingMemberForm');
        updateExistingSubmitVisibility();
    }

    // ------------------------------------------------------------
    // 10. New Member flow
    // ------------------------------------------------------------
    function onRelationChange() {
        const sel = $ ('newConnectedRelation');
        if (!sel) return;
        newRelation = sel.value || '';
        selectedConnectedMember = null;
        setSafeVal('NewConnectedMemberSearch', '');
        closeCombobox($ ('newConnectedMemberResults'));
        const confirmBox = $ ('NewConnectedConfirmBox'); if (confirmBox) confirmBox.style.display = 'none';
        const form = $ ('newMemberForm'); if (form) form.style.display = 'none';
        if (!newRelation) {
            const box = $ ('NewConnectedMemberBox'); if (box) box.style.display = 'none';
            return;
        }
        const box = $ ('NewConnectedMemberBox'); if (box) box.style.display = 'flex';
        const label = $ ('newConnectedMemberLabel');
        if (label) {
            if (newRelation === 'बाबु') label.textContent = 'बाबु छान्नुहोस्';
            else if (newRelation === 'श्रीमान') label.textContent = 'श्रीमान छान्नुहोस्';
            else if (newRelation === 'श्रीमती') label.textContent = 'श्रीमती छान्नुहोस्';
        }
        const input = $ ('NewConnectedMemberSearch');
        if (input) {
            input.placeholder = 'कोड, नेपाली नाम, वा अंग्रेजी नाम टाइप गर्नुहोस्...';
            input.focus();
        }
        refreshNewResults();
    }
    function getNewGenderFilter() {
        if (newRelation === 'बाबु') return 'M';
        if (newRelation === 'श्रीमान') return 'M';
        if (newRelation === 'श्रीमती') return 'F';
        return null;
    }
    function refreshNewResults() {
        const input = $ ('NewConnectedMemberSearch');
        const resultsEl = $ ('newConnectedMemberResults');
        if (!input || !resultsEl) return;
        if (!newRelation) { closeCombobox(resultsEl); return; }
        const q = input.value || '';
        newCurrentResults = filterMembers(q, { includeSpouses: false, genderFilter: getNewGenderFilter() });
        if (q.trim() === '') newHighlightedIndex = -1;
        renderResults(resultsEl, newCurrentResults, newHighlightedIndex, previewNew);
    }
    function previewNew(member) {
        closeCombobox($ ('newConnectedMemberResults'));
        const idx = newCurrentResults.findIndex(x => x.PersonalCode === member.PersonalCode);
        openPreviewModal('new', newCurrentResults, Math.max(0, idx));
    }
    function acceptConnectedMember(member) {
        selectedConnectedMember = member;
        const input = $ ('NewConnectedMemberSearch');
        if (input) input.value = member.PersonalCode || '';
        closeCombobox($ ('newConnectedMemberResults'));
        const confirmBox = $ ('NewConnectedConfirmBox'); if (confirmBox) confirmBox.style.display = 'block';
        const codeEl = $ ('NewConnectedCode'); if (codeEl) codeEl.textContent = member.PersonalCode || '—';
        const nameEl = $ ('NewConnectedName'); if (nameEl) nameEl.textContent = member.FullName || '—';
        const selectBox = $ ('NewConnectedMemberBox'); if (selectBox) selectBox.style.display = 'none';
        prefillNewForm(member, newRelation);
        const form = $ ('newMemberForm'); if (form) form.style.display = 'block';
        updateNewSubmitVisibility();
        setTimeout(() => form?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
    function prefillNewForm(connected, relation) {
        if (!connected) return;
        const connectedName = connected.FullName || '';
        const connectedCode = connected.PersonalCode || '';
        setSafeVal('newFather', ''); setSafeVal('newSpouse', '');
        if (relation === 'बाबु') setSafeVal('newFather', `${connectedName} (${connectedCode})`);
        else if (relation === 'श्रीमान') setSafeVal('newSpouse', `${connectedName} (${connectedCode})`);
        else if (relation === 'श्रीमती') setSafeVal('newSpouse', `${connectedName} (${connectedCode})`);
        setChecked('newConsentCheck', false);
        updateNewSubmitVisibility();
    }
    function resetNewFlow() {
        newRelation = ''; selectedConnectedMember = null;
        setSafeVal('newConnectedRelation', ''); setSafeVal('NewConnectedMemberSearch', '');
        closeCombobox($ ('newConnectedMemberResults'));
        const selectBox = $ ('NewConnectedMemberBox'); if (selectBox) selectBox.style.display = 'none';
        const confirmBox = $ ('NewConnectedConfirmBox'); if (confirmBox) confirmBox.style.display = 'none';
        const form = $ ('newMemberForm'); if (form) { form.reset(); form.style.display = 'none'; }
        const photo = $ ('newPhotoPreview'); if (photo) { photo.src = ''; photo.style.display = 'none'; }
        const fileName = $ ('newPhotoFileNameDisplay'); if (fileName) fileName.textContent = 'कुनै फोटो छानिएको छैन';
        const status = $ ('newUploadStatus'); if (status) status.innerHTML = '';
        setSafeVal('newPhotoUrl', ''); setSafeVal('newPublicId', '');
        clearAllFieldErrorsInForm('newMemberForm');
        updateNewSubmitVisibility();
    }

    // ------------------------------------------------------------
    // 11. Combobox wiring
    // ------------------------------------------------------------
    function wireCombobox(inputId, resultsId, refreshFn, state) {
        const input = $ (inputId);
        const results = $ (resultsId);
        if (!input || !results) return;
        input.addEventListener('focus', refreshFn);
        input.addEventListener('input', refreshFn);
        input.addEventListener('keydown', (e) => {
            if (results.hidden) return;
            const cur = state.getResults();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (cur.length === 0) return;
                state.setHighlight(Math.min(cur.length - 1, state.getHighlight() + 1));
                refreshFn();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (cur.length === 0) return;
                state.setHighlight(Math.max(0, state.getHighlight() - 1));
                refreshFn();
            } else if (e.key === 'Enter') {
                const idx = state.getHighlight();
                if (idx >= 0 && cur[idx]) { e.preventDefault(); state.pick(cur[idx]); }
            } else if (e.key === 'Escape') {
                closeCombobox(results);
            }
        });
        input.addEventListener('blur', () => { setTimeout(() => closeCombobox(results), 200); });
    }

    wireCombobox('ExistingMemberSearch', 'existingMemberResults', refreshExistingResults, {
        getResults: () => existingCurrentResults,
        getHighlight: () => existingHighlightedIndex,
        setHighlight: (v) => { existingHighlightedIndex = v; },
        pick: previewExisting
    });
    wireCombobox('NewConnectedMemberSearch', 'newConnectedMemberResults', refreshNewResults, {
        getResults: () => newCurrentResults,
        getHighlight: () => newHighlightedIndex,
        setHighlight: (v) => { newHighlightedIndex = v; },
        pick: previewNew
    });
    document.addEventListener('click', (e) => {
        const exCb = $ ('existingMemberCombobox');
        if (exCb && !exCb.contains(e.target)) closeCombobox($ ('existingMemberResults'));
        const newCb = $ ('newConnectedCombobox');
        if (newCb && !newCb.contains(e.target)) closeCombobox($ ('newConnectedMemberResults'));
    });

    // ------------------------------------------------------------
    // 12. Photo / crop
    // ------------------------------------------------------------
    function openCropModal(file, flow) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert('❌ फोटो 5MB भन्दा ठुलो छ।'); return; }
        if (!file.type.startsWith('image/')) { alert('❌ कृपया मान्य फोटो फाइल छान्नुहोस्।'); return; }
        cropSourceFile = file; cropTargetFlow = flow;
        const reader = new FileReader();
        reader.onload = function(e) {
            const modal = $ ('cropModal'); const imgEl = $ ('cropImage');
            if (!modal || !imgEl) return;
            modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
            cropZoom = 1; cropRotation = 0; imgEl.style.transform = 'none';
            const img = new Image();
            img.onload = function() { cropImage = img; imgEl.src = e.target.result; setTimeout(initCropBox, 200); };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    function hideCropModal() {
        const modal = $ ('cropModal'); if (modal) modal.style.display = 'none';
        document.body.style.overflow = ''; cropImageData = null; cropImage = null; cropSourceFile = null;
        document.removeEventListener('mousemove', onGlobalMouseMove);
        document.removeEventListener('mouseup', onGlobalMouseUp);
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
    }
    function initCropBox() {
        const imgEl = $ ('cropImage'); const boxEl = $ ('cropBox');
        if (!imgEl || !boxEl) return;
        if (!imgEl.complete || !imgEl.naturalWidth) { setTimeout(initCropBox, 100); return; }
        const wrapper = imgEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        imageRect = { left: imgRect.left - wrapperRect.left, top: imgRect.top - wrapperRect.top, width: imgRect.width, height: imgRect.height };
        let boxW = imgRect.width * 0.85; let boxH = boxW / (3 / 4);
        if (boxH > imgRect.height * 0.85) { boxH = imgRect.height * 0.85; boxW = boxH * (3 / 4); }
        cropBox = { x: (imgRect.width - boxW) / 2, y: (imgRect.height - boxH) / 2, w: boxW, h: boxH };
        updateCropBoxDisplay(); setupCropEvents();
    }
    function updateCropBoxDisplay() {
        const box = $ ('cropBox'); if (!box) return;
        box.style.left = cropBox.x + 'px'; box.style.top = cropBox.y + 'px';
        box.style.width = cropBox.w + 'px'; box.style.height = cropBox.h + 'px';
        box.style.display = 'block';
    }
    function setupCropEvents() {
        const box = $ ('cropBox'); if (!box) return;
        box.removeEventListener('mousedown', onCropMouseDown);
        box.removeEventListener('touchstart', onCropTouchStart);
        box.addEventListener('mousedown', onCropMouseDown);
        box.addEventListener('touchstart', onCropTouchStart, { passive: false });
        document.removeEventListener('mousemove', onGlobalMouseMove);
        document.removeEventListener('mouseup', onGlobalMouseUp);
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
        document.addEventListener('mousemove', onGlobalMouseMove);
        document.addEventListener('mouseup', onGlobalMouseUp);
        document.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
        document.addEventListener('touchend', onGlobalTouchEnd);
    }
    function onCropMouseDown(e) {
        e.preventDefault(); e.stopPropagation();
        const imgEl = $ ('cropImage'); const boxEl = $ ('cropBox');
        if (!imgEl || !boxEl) return;
        const wrapperRect = imgEl.parentElement.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        imageRect = { left: imgRect.left - wrapperRect.left, top: imgRect.top - wrapperRect.top, width: imgRect.width, height: imgRect.height };
        const mx = e.clientX - wrapperRect.left, my = e.clientY - wrapperRect.top;
        if (e.target.classList.contains('crop-handle')) {
            isResizing = true; isDragging = false; resizeHandle = e.target.dataset.handle;
            dragStartX = mx; dragStartY = my; dragStartBox = { ...cropBox };
        } else {
            isDragging = true; isResizing = false;
            dragStartX = mx; dragStartY = my; dragStartBox = { ...cropBox };
            boxEl.style.cursor = 'grabbing';
        }
    }
    function onCropTouchStart(e) {
        e.preventDefault(); e.stopPropagation();
        const imgEl = $ ('cropImage'); if (!imgEl) return;
        const touch = e.touches[0];
        const wrapperRect = imgEl.parentElement.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        imageRect = { left: imgRect.left - wrapperRect.left, top: imgRect.top - wrapperRect.top, width: imgRect.width, height: imgRect.height };
        const tx = touch.clientX - wrapperRect.left, ty = touch.clientY - wrapperRect.top;
        if (e.target.classList.contains('crop-handle')) {
            isResizing = true; isDragging = false; resizeHandle = e.target.dataset.handle;
            dragStartX = tx; dragStartY = ty; dragStartBox = { ...cropBox };
        } else {
            isDragging = true; isResizing = false;
            dragStartX = tx; dragStartY = ty; dragStartBox = { ...cropBox };
        }
    }
    function onGlobalMouseMove(e) {
        if (!isDragging && !isResizing) return;
        const imgEl = $ ('cropImage'); if (!imgEl) return;
        const wr = imgEl.parentElement.getBoundingClientRect();
        handleCropMove(e.clientX - wr.left, e.clientY - wr.top);
    }
    function onGlobalTouchMove(e) {
        if (!isDragging && !isResizing) return;
        e.preventDefault();
        const imgEl = $ ('cropImage'); if (!imgEl) return;
        const touch = e.touches[0];
        const wr = imgEl.parentElement.getBoundingClientRect();
        handleCropMove(touch.clientX - wr.left, touch.clientY - wr.top);
    }
    function onGlobalMouseUp() {
        if (isDragging || isResizing) {
            isDragging = false; isResizing = false; resizeHandle = null;
            const box = $ ('cropBox'); if (box) box.style.cursor = 'move';
        }
    }
    function onGlobalTouchEnd() {
        if (isDragging || isResizing) { isDragging = false; isResizing = false; resizeHandle = null; }
    }
    function handleCropMove(mx, my) {
        if (!imageRect) return;
        const dx = mx - dragStartX, dy = my - dragStartY;
        const minSize = 40, ratio = 3 / 4;
        if (isDragging) {
            let nx = dragStartBox.x + dx, ny = dragStartBox.y + dy;
            nx = Math.max(0, Math.min(imageRect.width - cropBox.w, nx));
            ny = Math.max(0, Math.min(imageRect.height - cropBox.h, ny));
            cropBox.x = nx; cropBox.y = ny; updateCropBoxDisplay(); return;
        }
        if (!isResizing || !resizeHandle) return;
        let nx = dragStartBox.x, ny = dragStartBox.y, nw = dragStartBox.w, nh = dragStartBox.h;
        switch (resizeHandle) {
            case 'nw':
                nx = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + dx));
                ny = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + dy));
                nw = dragStartBox.w + (dragStartBox.x - nx);
                nh = dragStartBox.h + (dragStartBox.y - ny);
                if (nw / nh > ratio) { nw = nh * ratio; nx = dragStartBox.x + dragStartBox.w - nw; }
                else { nh = nw / ratio; ny = dragStartBox.y + dragStartBox.h - nh; }
                break;
            case 'n':
                ny = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + dy));
                nh = dragStartBox.h + (dragStartBox.y - ny);
                nw = nh * ratio; nx = dragStartBox.x + (dragStartBox.w - nw) / 2;
                break;
            case 'ne':
                ny = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + dy));
                nw = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + dx));
                nh = dragStartBox.h + (dragStartBox.y - ny);
                if (nw / nh > ratio) nw = nh * ratio;
                else { nh = nw / ratio; ny = dragStartBox.y + dragStartBox.h - nh; }
                break;
            case 'e':
                nw = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + dx));
                nh = nw / ratio; ny = dragStartBox.y + (dragStartBox.h - nh) / 2;
                break;
            case 'se':
                nw = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + dx));
                nh = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + dy));
                if (nw / nh > ratio) nw = nh * ratio;
                else nh = nw / ratio;
                break;
            case 's':
                nh = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + dy));
                nw = nh * ratio; nx = dragStartBox.x + (dragStartBox.w - nw) / 2;
                break;
            case 'sw':
                nx = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + dx));
                nh = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + dy));
                nw = dragStartBox.w + (dragStartBox.x - nx);
                if (nw / nh > ratio) { nw = nh * ratio; nx = dragStartBox.x + dragStartBox.w - nw; }
                else { nh = nw / ratio; }
                break;
            case 'w':
                nx = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + dx));
                nw = dragStartBox.w + (dragStartBox.x - nx);
                nh = nw / ratio; ny = dragStartBox.y + (dragStartBox.h - nh) / 2;
                break;
        }
        nx = Math.max(0, Math.min(imageRect.width - nw, nx));
        ny = Math.max(0, Math.min(imageRect.height - nh, ny));
        cropBox.x = nx; cropBox.y = ny; cropBox.w = nw; cropBox.h = nh;
        updateCropBoxDisplay();
    }
    function performCrop() {
        if (!cropImage) return;
        const imgEl = $ ('cropImage'); if (!imgEl) return;
        const imgRect = imgEl.getBoundingClientRect();
        const sx = cropImage.width / imgRect.width;
        const sy = cropImage.height / imgRect.height;
        const cx = cropBox.x * sx, cy = cropBox.y * sy;
        const cw = cropBox.w * sx, ch = cropBox.h * sy;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cw); canvas.height = Math.round(ch);
        canvas.getContext('2d').drawImage(cropImage, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        cropImageData = dataUrl;
        if (cropTargetFlow === 'existing') {
            const preview = $ ('exPhotoPreview'); const fileName = $ ('exPhotoFileNameDisplay');
            if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
            if (fileName) fileName.textContent = 'काटिएको फोटो';
            setSafeVal('exPhotoUrl', dataUrl);
        } else if (cropTargetFlow === 'new') {
            const preview = $ ('newPhotoPreview'); const fileName = $ ('newPhotoFileNameDisplay');
            if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
            if (fileName) fileName.textContent = 'काटिएको फोटो';
            setSafeVal('newPhotoUrl', dataUrl);
        }
        hideCropModal();
    }
    function rotateImage(deg) { cropRotation = (cropRotation + deg) % 360; applyTransform(); }
    function zoomImage(delta) { cropZoom = Math.max(0.3, Math.min(3, cropZoom + delta)); applyTransform(); }
    function resetTransform() { cropZoom = 1; cropRotation = 0; applyTransform(); }
    function applyTransform() {
        const img = $ ('cropImage'); if (!img) return;
        img.style.transform = `scale(${cropZoom}) rotate(${cropRotation}deg)`;
    }

    // ------------------------------------------------------------
    // 13. ImgBB upload
    // ------------------------------------------------------------
    async function uploadToImgBB(dataUrl, name, code) {
        const file = dataURLtoFile(dataUrl, `${name}_${code}_${Date.now()}.jpg`);
        const formData = new FormData();
        formData.append('file', file); formData.append('filename', file.name);
        try {
            const res = await fetch(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: formData
            });
            const result = await res.json();
            if (result.success && result.url) return { success: true, url: result.url };
            return { success: false, error: result.error || 'Upload failed' };
        } catch (e) { return { success: false, error: e.message }; }
    }
    function dataURLtoFile(dataUrl, filename) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
    }

    // ------------------------------------------------------------
    // 14. Load members
    // ------------------------------------------------------------
    async function loadMembers() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('MemberDataTable').select('*');
            if (error) throw error;
            allMembers = data || [];
            console.log('✅ Loaded', allMembers.length, 'members');
            buildMemberRomanIndex();
        } catch (e) {
            console.warn('Could not load members:', e);
            allMembers = [];
            memberRomanIndex.clear();
        }
    }

    // ------------------------------------------------------------
    // 15. Validation
    // ------------------------------------------------------------
    function validateForm(prefix, mandatoryNameId) {
        let ok = true;
        const fullName = safeVal(mandatoryNameId);
        if (!fullName) { setFieldError(mandatoryNameId, 'कृपया पूरा नाम भर्नुहोस्।'); ok = false; }
        else clearFieldError(mandatoryNameId);
        const mobile = safeVal(prefix + 'Mobile');
        if (mobile && !/^9[678]\d{8}$/.test(mobile)) { setFieldError(prefix + 'Mobile', 'कृपया 10 अंकको मान्य मोबाइल नम्बर लेख्नुहोस्।'); ok = false; }
        else clearFieldError(prefix + 'Mobile');
        const email = safeVal(prefix + 'Email');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError(prefix + 'Email', 'कृपया मान्य इमेल ठेगाना लेख्नुहोस्।'); ok = false; }
        else clearFieldError(prefix + 'Email');
        const consent = $ (prefix + 'ConsentCheck');
        if (consent && !consent.checked) { showFeedback('<i class="fas fa-exclamation-circle"></i> कृपया सहमति बाकसमा चिन्ह लगाउनुहोस्।', 'error'); ok = false; }
        if (!ok) { const firstErr = document.querySelector('.has-error'); if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return ok;
    }

    // ------------------------------------------------------------
    // 16. Submit
    // ------------------------------------------------------------
    async function submitExisting(e) {
        e.preventDefault();
        if (existingSubmitting) return;
        clearFeedback();
        if (!selectedExistingMember) { showFeedback('<i class="fas fa-exclamation-circle"></i> कृपया पहिले सदस्य छान्नुहोस्।', 'error'); return; }
        if (!validateForm('ex', 'exFullName')) return;
        existingSubmitting = true;
        const submitBtn = $ ('exBtnSubmit');
        setButtonLoading(submitBtn, true, 'पठाउँदै...');
        try {
            let photoUrl = safeVal('exPhotoUrl');
            if (photoUrl && photoUrl.startsWith('data:image')) {
                const r = await uploadToImgBB(photoUrl, safeVal('exFullName') || 'member', selectedExistingMember.PersonalCode || 'unknown');
                if (r.success) photoUrl = r.url; else photoUrl = selectedExistingMember.PhotoUrl || '';
            }
            const payload = {
                MemberFullName: safeVal('exFullName'), MemberCode: selectedExistingMember.PersonalCode || '',
                MemberGender: normalizeGender(safeSelectVal('exGender', 'M')) || 'M',
                MemberAddress: safeVal('exAddress'), MemberMobile: safeVal('exMobile'), MemberEmail: safeVal('exEmail'),
                MemberFather: safeVal('exFather'), MemberMother: safeVal('exMother'), MemberSpouse: safeVal('exSpouse'),
                MemberDOB: safeVal('exDob'), MemberSons: safeVal('exSonsInput'), MemberDaughters: safeVal('exDaughtersInput'),
                MemberQualification: safeVal('exQualification'), MemberPlace: safeVal('exPosition'),
                MemberDetailAddress: safeVal('exDetailAddress'), MemberDetailProfession: safeVal('exDetailProfession'),
                MemberLifeStory: safeVal('exLifeStory'), MemberDOD: safeVal('exDodAge'),
                MemberPhotoUrl: photoUrl, MemberProfession: safeVal('exProfession'),
                ConnectedRelation: '', ConnectedName: '', ConnectedCode: '', RequestType: 'Edit'
            };
            const { error } = await supabase.from('MemberSuggestionTable').insert([payload]);
            if (error) throw error;
            resetExistingFlow(); showSuccessPanel();
        } catch (err) {
            console.error('Submit error:', err);
            showFeedback(`<i class="fas fa-exclamation-circle"></i> त्रुटि: ${escapeHtml(err.message)}`, 'error');
        } finally { setButtonLoading(submitBtn, false); existingSubmitting = false; }
    }
    async function submitNew(e) {
        e.preventDefault();
        if (newSubmitting) return;
        clearFeedback();
        if (!newRelation) { showFeedback('<i class="fas fa-exclamation-circle"></i> कृपया सम्बन्ध छान्नुहोस्।', 'error'); return; }
        if (!selectedConnectedMember) { showFeedback('<i class="fas fa-exclamation-circle"></i> कृपया जोडिने सदस्य छान्नुहोस्।', 'error'); return; }
        if (!validateForm('new', 'newFullName')) return;
        newSubmitting = true;
        const submitBtn = $ ('newBtnSubmit');
        setButtonLoading(submitBtn, true, 'पठाउँदै...');
        try {
            let photoUrl = safeVal('newPhotoUrl');
            if (photoUrl && photoUrl.startsWith('data:image')) {
                const r = await uploadToImgBB(photoUrl, safeVal('newFullName') || 'member', 'new');
                if (r.success) photoUrl = r.url; else photoUrl = '';
            }
            const payload = {
                MemberFullName: safeVal('newFullName'), MemberCode: '',
                MemberGender: normalizeGender(safeSelectVal('newGender', 'M')) || 'M',
                MemberAddress: safeVal('newAddress'), MemberMobile: safeVal('newMobile'), MemberEmail: safeVal('newEmail'),
                MemberFather: safeVal('newFather'), MemberMother: safeVal('newMother'), MemberSpouse: safeVal('newSpouse'),
                MemberDOB: safeVal('newDob'), MemberSons: safeVal('newSonsInput'), MemberDaughters: safeVal('newDaughtersInput'),
                MemberQualification: safeVal('newQualification'), MemberPlace: safeVal('newPosition'),
                MemberDetailAddress: safeVal('newDetailAddress'), MemberDetailProfession: safeVal('newDetailProfession'),
                MemberLifeStory: safeVal('newLifeStory'), MemberDOD: safeVal('newDodAge'),
                MemberPhotoUrl: photoUrl, MemberProfession: safeVal('newProfession'),
                ConnectedRelation: newRelation, ConnectedName: selectedConnectedMember.FullName || '',
                ConnectedCode: selectedConnectedMember.PersonalCode || '', RequestType: 'New'
            };
            const { error } = await supabase.from('MemberSuggestionTable').insert([payload]);
            if (error) throw error;
            resetNewFlow(); showSuccessPanel();
        } catch (err) {
            console.error('Submit error:', err);
            showFeedback(`<i class="fas fa-exclamation-circle"></i> त्रुटि: ${escapeHtml(err.message)}`, 'error');
        } finally { setButtonLoading(submitBtn, false); newSubmitting = false; }
    }

    // ------------------------------------------------------------
    // 17. Wire events
    // ------------------------------------------------------------
    function wireEvents() {
        $ ('btnEditExistingMember')?.addEventListener('click', () => {
            resetNewFlow(); resetExistingFlow(); clearFeedback();
            const active = $ ('ExistingMemberFlow')?.style.display !== 'none';
            if (active) { hideAllFlows(); return; }
            showExistingFlow();
        });
        $ ('btnAddNewMember')?.addEventListener('click', () => {
            resetExistingFlow(); resetNewFlow(); clearFeedback();
            const active = $ ('NewMemberFlow')?.style.display !== 'none';
            if (active) { hideAllFlows(); return; }
            showNewFlow();
        });
        document.querySelectorAll('.flow-close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const id = btn.dataset.close;
                if (id === 'ExistingMemberFlow') resetExistingFlow();
                if (id === 'NewMemberFlow') resetNewFlow();
                hideAllFlows();
            });
        });
        $ ('btnChangeExistingMember')?.addEventListener('click', () => {
            selectedExistingMember = null;
            const input = $ ('ExistingMemberSearch'); if (input) input.value = '';
            const confirmBox = $ ('ExistingMemberConfirmBox'); if (confirmBox) confirmBox.style.display = 'none';
            const selectBox = $ ('ExistingMemberSelectBox'); if (selectBox) selectBox.style.display = 'flex';
            const form = $ ('existingMemberForm'); if (form) form.style.display = 'none';
            updateExistingSubmitVisibility(); input?.focus();
        });
        $ ('btnChangeNewConnected')?.addEventListener('click', () => {
            selectedConnectedMember = null;
            const input = $ ('NewConnectedMemberSearch'); if (input) input.value = '';
            const confirmBox = $ ('NewConnectedConfirmBox'); if (confirmBox) confirmBox.style.display = 'none';
            const selectBox = $ ('NewConnectedMemberBox'); if (selectBox) selectBox.style.display = 'flex';
            const form = $ ('newMemberForm'); if (form) form.style.display = 'none';
            updateNewSubmitVisibility(); input?.focus();
        });
        $ ('newConnectedRelation')?.addEventListener('change', onRelationChange);
        $ ('exConsentCheck')?.addEventListener('change', updateExistingSubmitVisibility);
        $ ('newConsentCheck')?.addEventListener('change', updateNewSubmitVisibility);
        $ ('exUploadPhotoBtn')?.addEventListener('click', () => $ ('exPhotoFile')?.click());
        $ ('exPhotoFile')?.addEventListener('change', function() {
            if (this.files && this.files[0]) openCropModal(this.files[0], 'existing');
            this.value = '';
        });
        $ ('newUploadPhotoBtn')?.addEventListener('click', () => $ ('newPhotoFile')?.click());
        $ ('newPhotoFile')?.addEventListener('change', function() {
            if (this.files && this.files[0]) openCropModal(this.files[0], 'new');
            this.value = '';
        });
        $ ('cropModalClose')?.addEventListener('click', hideCropModal);
        $ ('cropCancel')?.addEventListener('click', hideCropModal);
        $ ('cropConfirm')?.addEventListener('click', performCrop);
        $ ('cropChooseAnother')?.addEventListener('click', () => {
            const flow = cropTargetFlow; hideCropModal();
            setTimeout(() => {
                if (flow === 'existing') $ ('exPhotoFile')?.click();
                else if (flow === 'new') $ ('newPhotoFile')?.click();
            }, 100);
        });
        $ ('cropZoomIn')?.addEventListener('click', () => zoomImage(0.1));
        $ ('cropZoomOut')?.addEventListener('click', () => zoomImage(-0.1));
        $ ('cropRotateLeft')?.addEventListener('click', () => rotateImage(-90));
        $ ('cropRotateRight')?.addEventListener('click', () => rotateImage(90));
        $ ('cropReset')?.addEventListener('click', resetTransform);
        $ ('cropModal')?.addEventListener('click', (e) => { if (e.target === $ ('cropModal')) hideCropModal(); });
        document.addEventListener('keydown', (e) => {
            const modal = $ ('cropModal');
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') hideCropModal();
        });
        $ ('existingMemberForm')?.addEventListener('submit', submitExisting);
        $ ('newMemberForm')?.addEventListener('submit', submitNew);
        $ ('exBtnReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (!confirm('तपाईंले भरेको सबै विवरण मेटिनेछ। निश्चित हुनुहुन्छ?')) return;
            if (selectedExistingMember) prefillExistingForm(selectedExistingMember);
            clearAllFieldErrorsInForm('existingMemberForm');
            updateExistingSubmitVisibility();
        });
        $ ('newBtnReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (!confirm('तपाईंले भरेको सबै विवरण मेटिनेछ। निश्चित हुनुहुन्छ?')) return;
            if (selectedConnectedMember) prefillNewForm(selectedConnectedMember, newRelation);
            clearAllFieldErrorsInForm('newMemberForm');
            updateNewSubmitVisibility();
        });
        ['exMobile', 'exEmail', 'newMobile', 'newEmail'].forEach(id => {
            const el = $ (id); if (!el) return;
            el.addEventListener('blur', () => {
                const v = el.value.trim();
                if (id.endsWith('Mobile') && v && !/^9[678]\d{8}$/.test(v)) setFieldError(id, 'कृपया 10 अंकको मान्य मोबाइल नम्बर लेख्नुहोस्।');
                else if (id.endsWith('Email') && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) setFieldError(id, 'कृपया मान्य इमेल ठेगाना लेख्नुहोस्।');
                else clearFieldError(id);
            });
        });
        $ ('btnSubmitAnother')?.addEventListener('click', () => {
            hideAllFlows(); resetExistingFlow(); resetNewFlow(); clearFeedback();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ------------------------------------------------------------
    // 18. Init
    // ------------------------------------------------------------
    async function init() {
        hideAllFlows();
        const exBtn = $ ('exBtnSubmit'); if (exBtn) exBtn.style.display = 'none';
        const newBtn = $ ('newBtnSubmit'); if (newBtn) newBtn.style.display = 'none';
        ensurePreviewModal();
        await loadMembers();
        wireEvents();
        console.log('✅ RequestPage ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();