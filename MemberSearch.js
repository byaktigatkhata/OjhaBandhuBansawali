/**
 * MemberSearch.js (Optimized for Multi-Token & Partial English/Nepali Matching)
 */

const MemberSearch = (function() {
    'use strict';

    const consonantMap = {
        'kh': 'ख', 'gh': 'घ', 'ch': 'च', 'chh': 'छ', 'jh': 'झ',
        'th': 'ठ', 'dh': 'ढ', 'ph': 'फ', 'bh': 'भ', 'sh': 'श',
        'chhy': 'क्ष', 'tr': 'त्र', 'gyn': 'ज्ञ', 'gyan': 'ज्ञ',
        'k': 'क', 'g': 'ग', 'ng': 'ङ', 'ny': 'ञ', 
        't': 'त', 'ṭ': 'ट', 'd': 'द', 'ḍ': 'ड', 'n': 'न', 'ṇ': 'ण',
        'p': 'प', 'b': 'ब', 'm': 'म', 'y': 'य', 'r': 'र', 
        'l': 'ल', 'w': 'व', 'v': 'व', 's': 'स', 'h': 'ह', 'x': 'क्ष'
    };

    const vowelMap = {
        'aa': 'ा', 'ee': 'ी', 'oo': 'ू', 'ai': 'ै', 'au': 'ौ', 'ri': 'रि',
        'a': '', 'i': 'ि', 'u': 'ु', 'e': 'े', 'o': 'ो',
        'A': 'आ', 'I': 'ई', 'U': 'ऊ', 'E': 'ए', 'O': 'ओ'
    };

    const reverseConsonantMap = {
        'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
        'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
        'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
        'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
        'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
        'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'w', 'श': 'sh',
        'ष': 'sh', 'स': 's', 'ह': 'h', 'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gyan'
    };

    const reverseVowelMap = {
        'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
        'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
        'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
        'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
    };

    function romanToDevanagari(input) {
        if (!input) return '';
        let str = String(input).trim();
        if (/[\u0900-\u097F]/.test(str)) return str;

        let lower = str.toLowerCase();
        let result = '';
        let i = 0;
        const cKeys = Object.keys(consonantMap).sort((a, b) => b.length - a.length);

        while (i < lower.length) {
            let matchedConsonant = '';
            for (let k of cKeys) {
                if (lower.startsWith(k, i)) {
                    matchedConsonant = consonantMap[k];
                    i += k.length;
                    break;
                }
            }

            if (matchedConsonant) {
                result += matchedConsonant;
                let matchedVowel = '';
                const vKeys = Object.keys(vowelMap).sort((a, b) => b.length - a.length);
                for (let vk of vKeys) {
                    if (lower.startsWith(vk, i) && vk !== 'a') {
                        matchedVowel = vowelMap[vk];
                        i += vk.length;
                        break;
                    }
                }
                if (matchedVowel) {
                    result += matchedVowel;
                } else if (lower.startsWith('a', i)) {
                    i += 1;
                }
            } else {
                let matchedStandalone = '';
                const vKeys = Object.keys(vowelMap).sort((a, b) => b.length - a.length);
                for (let vk of vKeys) {
                    if (lower.startsWith(vk, i)) {
                        matchedStandalone = vowelMap[vk];
                        i += vk.length;
                        break;
                    }
                }
                if (matchedStandalone) {
                    result += matchedStandalone;
                } else {
                    result += str[i];
                    i++;
                }
            }
        }
        return result;
    }

    function devanagariToRoman(input) {
        if (!input) return '';
        let str = String(input).trim();
        let result = '';
        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (reverseConsonantMap[char]) {
                result += reverseConsonantMap[char] + 'a';
            } else if (reverseVowelMap[char]) {
                result += reverseVowelMap[char];
            } else {
                result += char;
            }
        }
        return result.toLowerCase();
    }

    function normalizeText(text) {
        if (!text) return '';
        let str = String(text).toLowerCase().trim();
        str = str.replace(/ई/g, 'इ').replace(/ी/g, 'ि');
        str = str.replace(/ऊ/g, 'उ').replace(/ू/g, 'ु');
        str = str.replace(/[शष]/g, 'स');
        str = str.replace(/व/g, 'ब');
        str = str.replace(/ण/g, 'न');
        str = str.replace(/ँ|ं/g, '');
        return str;
    }

    function filterMembers(members, query) {
        if (!query || !query.trim()) {
            return members.slice(0, 30);
        }

        const rawQuery = query.trim().toLowerCase();
        const queryTokens = rawQuery.split(/\s+/).filter(t => t.length > 0);

        return members.filter(member => {
            const name = member.FullName || '';
            const code = member.PersonalCode || '';
            const father = member.Father || '';
            const mother = member.Mother || '';
            const address = member.Address || member.Thegana || '';

            const romanName = devanagariToRoman(name);
            const normName = normalizeText(name);
            const normCode = normalizeText(code);
            const normFather = normalizeText(father);
            const normMother = normalizeText(mother);

            // सभी संभव रूपों को मिलाकर एक सर्च पूल तैयार करना
            const searchPools = [
                code.toLowerCase(), normCode,
                name.toLowerCase(), normName, romanName,
                father.toLowerCase(), normalizeText(father), devanagariToRoman(father),
                mother.toLowerCase(), normalizeText(mother), devanagariToRoman(mother),
                address.toLowerCase()
            ];

            // **सुधार:** मल्टी-टोकन मिलान (प्रत्येक शब्द जैसे "Ganesh" और "O" अलग-अलग मैच होने चाहिए)
            const allTokensMatch = queryTokens.every(token => {
                const devToken = romanToDevanagari(token);
                const normToken = normalizeText(token);
                
                // चेक करें कि क्या यह टोकन किसी भी फील्ड के किसी भी शब्द से शुरू होता है (Prefix Match)
                return searchPools.some(pool => {
                    const words = pool.split(/\s+/);
                    return words.some(word => word.startsWith(token) || word.startsWith(normToken) || word.startsWith(devToken.toLowerCase()));
                });
            });

            return allTokensMatch;
        }).slice(0, 50);
    }

    return {
        romanToDevanagari,
        devanagariToRoman,
        normalizeText,
        filterMembers
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemberSearch;
}