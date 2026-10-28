/**
 * RelationCalculator.js
 * 
 * नेपाली वंशीय नाता सम्बन्ध गणना गर्ने पूर्ण सुध्रिएको कोड (Rules A to L)
 */

const RelationCalculator = (function() {
    'use strict';

    function isSpouse(code) {
        return /m+$/.test(String(code).trim());
    }

    function getBaseCode(code) {
        return String(code).trim().replace(/m+$/, '');
    }

    function getGenderFromCode(code) {
        const rawCode = String(code).trim();
        const base = getBaseCode(rawCode);
        const spouse = isSpouse(rawCode);

        let baseGender = 'M';
        if (!base.includes('.')) {
            baseGender = 'M'; // मूल पुरुष सधैं पुरुष हुन्छन्
        } else {
            const lastBlock = base.split('.').pop();
            const letter = lastBlock.charAt(0).toUpperCase();
            baseGender = (letter === 'F') ? 'F' : 'M';
        }

        return spouse ? (baseGender === 'M' ? 'F' : 'M') : baseGender;
    }

    function getGeneration(code) {
        const base = getBaseCode(code);
        return (base.match(/\./g) || []).length;
    }

    function getFatherCode(code) {
        const rawCode = String(code).trim();
        if (isSpouse(rawCode)) return null;

        const base = getBaseCode(rawCode);
        const parts = base.split('.');
        if (parts.length <= 1) return null;

        parts.pop();

        if (parts.length === 1) {
            return parts[0];
        }

        const lastIdx = parts.length - 1;
        const numPart = parts[lastIdx].replace(/^[MF]/i, '');
        parts[lastIdx] = 'M' + numPart;

        return parts.join('.');
    }

    function getAncestorsChain(code) {
        const chain = [getBaseCode(code)];
        let curr = getBaseCode(code);
        while (curr) {
            const father = getFatherCode(curr);
            if (!father || chain.includes(father)) break;
            chain.push(father);
            curr = father;
        }
        return chain;
    }

    function isDirectAncestor(seniorBaseCode, juniorBaseCode) {
        const chain = getAncestorsChain(juniorBaseCode);
        return chain.includes(seniorBaseCode);
    }

    function getGenPrefix(diff) {
        const prefixes = {
            2: 'हजुर',
            3: 'जिजु',
            4: 'कुप्री',
            5: 'पाँच',
            6: 'छ',
            7: 'सात',
            8: 'आठ',
            9: 'नौ',
            10: 'दश',
            11: 'एघार',
            12: 'बाह्र',
            13: 'तेह्र',
            14: 'चौध',
            15: 'पन्द्र'
        };
        return prefixes[diff] || `${diff}`;
    }

    function calculatePindaAntar(codeA, codeB) {
        const baseA = getBaseCode(codeA);
        const baseB = getBaseCode(codeB);
        const partsA = baseA.split('.');
        const partsB = baseB.split('.');

        let commonCount = 0;
        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            const blockA = partsA[i].replace(/^[MF]/i, '');
            const blockB = partsB[i].replace(/^[MF]/i, '');
            if (blockA === blockB) {
                commonCount++;
            } else {
                break;
            }
        }

        const remainingA = partsA.length - commonCount;
        const remainingB = partsB.length - commonCount;
        const pindaAntar = Math.max(remainingA, remainingB);

        return { commonGen: commonCount, pindaAntar: pindaAntar };
    }

    function calculateRelation(memberA, memberB, allMembers) {
        const codeA = String(memberA.PersonalCode || '').trim();
        const codeB = String(memberB.PersonalCode || '').trim();

        if (codeA === codeB) {
            return { success: false, message: 'यी दुबै एउटै व्यक्ति हुन्।' };
        }

        const baseA = getBaseCode(codeA);
        const baseB = getBaseCode(codeB);
        const spouseA = isSpouse(codeA);
        const spouseB = isSpouse(codeB);
        const genderA = getGenderFromCode(codeA);
        const genderB = getGenderFromCode(codeB);

        const pindaData = calculatePindaAntar(codeA, codeB);

        if (baseA === baseB) {
            if (spouseA && spouseB) {
                if (genderA === 'F' && genderB === 'F') {
                    return { success: true, message: 'सौता', genDiff: 0, ...pindaData };
                }
                return { success: true, message: 'श्रीमान र श्रीमती', genDiff: 0, ...pindaData };
            }
            return { success: true, message: 'श्रीमान र श्रीमती', genDiff: 0, ...pindaData };
        }

        const genA = getGeneration(codeA);
        const genB = getGeneration(codeB);
        const genDiff = Math.abs(genA - genB);

        let senior = (genA <= genB) ? { code: codeA, base: baseA, gen: genA, spouse: spouseA, gender: genderA }
                                   : { code: codeB, base: baseB, gen: genB, spouse: spouseB, gender: genderB };
        let junior = (genA <= genB) ? { code: codeB, base: baseB, gen: genB, spouse: spouseB, gender: genderB }
                                   : { code: codeA, base: baseA, gen: genA, spouse: spouseA, gender: genderA };

        let relationText = '';

        // ============================================================
        // RULE E: समान जेनेरेसन (genDiff === 0)
        // ============================================================
        if (genDiff === 0) {
            if (!spouseA && !spouseB) {
                if (genderA === 'M' && genderB === 'M') relationText = 'दाजु र भाइ';
                else if (genderA === 'F' && genderB === 'F') relationText = 'दिदी र बहिनी';
                else relationText = 'दाजु र बहिनी वा दिदी र भाइ';
            } else if ((!spouseA && spouseB) || (spouseA && !spouseB)) {
                const nonSpouseGen = !spouseA ? genderA : genderB;
                const spouseGen = spouseA ? genderA : genderB;

                if (nonSpouseGen === 'M' && spouseGen === 'F') relationText = 'जेठाजु र बुहारी वा देवर र भाउजु';
                else if (nonSpouseGen === 'M' && spouseGen === 'M') relationText = 'जेठान र ज्वाइँ वा सालो र भिनाजु';
                else if (nonSpouseGen === 'F' && spouseGen === 'F') relationText = 'नन्द र भाउजु वा आमाजु र बुहारी';
                else if (nonSpouseGen === 'F' && spouseGen === 'M') relationText = 'जेठीसासु र ज्वाइँ वा साली र भिनाजु';
            } else {
                if (genderA === 'M' && genderB === 'M') relationText = 'साढु दाजु र साढु भाइ';
                else if (genderA === 'F' && genderB === 'F') relationText = 'जेठानी र देउरानी';
                else relationText = 'जेठानी दिदी र नन्दे भाइ वा आमाजु दाजु र साली बहिनी';
            }
            return { success: true, message: relationText, genDiff, ...pindaData };
        }

        // ============================================================
        // जेनेरेसन अन्तर >= 1 (RULES F, G, H, I, J, K)
        // ============================================================
        const isDirect = isDirectAncestor(senior.base, junior.base);
        const seniorLastBlock = senior.base.split('.').pop();
        const isPhupuLine = seniorLastBlock.toUpperCase().startsWith('F');
        const prefix = getGenPrefix(genDiff);
        const prefixMale = (genDiff === 4) ? 'कुप्रा' : prefix;

        // जुनियर वंशज नाता निर्धारण (नाती / नातिनी / पनाती / पनातिनी आदि)
        let juniorBloodTerm = '';
        if (genDiff === 1) {
            juniorBloodTerm = junior.gender === 'M' ? 'छोरा' : 'छोरी';
        } else if (genDiff === 2) {
            juniorBloodTerm = junior.gender === 'M' ? 'नाती' : 'नातिनी';
        } else if (genDiff === 3) {
            juniorBloodTerm = junior.gender === 'M' ? 'पनाती' : 'पनातिनी';
        } else if (genDiff === 4) {
            juniorBloodTerm = junior.gender === 'M' ? 'जनाती' : 'जनातिनी';
        } else {
            juniorBloodTerm = junior.gender === 'M' ? `${prefix}नाती` : `${prefix}नातिनी`;
        }

        // जुनियर ज्वाइँ/बुहारी नाता निर्धारण (ज्वाइँ सधैं नातिनी/पनातिनी मार्फत जोडिने हुनाले)
        let juniorSpouseTerm = '';
        if (genDiff === 1) {
            juniorSpouseTerm = junior.gender === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else if (genDiff === 2) {
            juniorSpouseTerm = junior.gender === 'M' ? 'नातिनी ज्वाइँ' : 'नातिनी बुहारी';
        } else if (genDiff === 3) {
            juniorSpouseTerm = junior.gender === 'M' ? 'पनातिनी ज्वाइँ' : 'पनातिनी बुहारी';
        } else if (genDiff === 4) {
            juniorSpouseTerm = junior.gender === 'M' ? 'जनातिनी ज्वाइँ' : 'जनातिनी बुहारी';
        } else {
            juniorSpouseTerm = junior.gender === 'M' ? `${prefix}नातिनी ज्वाइँ` : `${prefix}नातिनी बुहारी`;
        }

        // ------------------------------------------------------------
        // १. प्रत्यक्ष वंश (Direct Lineage)
        // ------------------------------------------------------------
        if (isDirect) {
            if (!senior.spouse && !junior.spouse) {
                if (genDiff === 1) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'बुबा र छोरा' : 'बुबा र छोरी')
                        : (junior.gender === 'M' ? 'आमा र छोरा' : 'आमा र छोरी');
                } else if (genDiff === 2) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'हजुरबुबा र नाती' : 'हजुरबुबा र नातिनी')
                        : (junior.gender === 'M' ? 'हजुरआमा र नाती' : 'हजुरआमा र नातिनी');
                } else if (genDiff === 3) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'जिजुबुबा र पनाती' : 'जिजुबुबा र पनातिनी')
                        : (junior.gender === 'M' ? 'जिजुआमा र पनाती' : 'जिजुआमा र पनातिनी');
                } else if (genDiff === 4) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'कुप्राबुबा र जनाती' : 'कुप्राबुबा र जनातिनी')
                        : (junior.gender === 'M' ? 'कुप्रीआमा र जनाती' : 'कुप्रीआमा र जनातिनी');
                } else {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? `${prefixMale}बुबा र ${prefix}नाती` : `${prefixMale}बुबा र ${prefix}नातिनी`)
                        : (junior.gender === 'M' ? `${prefix}आमा र ${prefix}नाती` : `${prefix}आमा र ${prefix}नातिनी`);
                }
            } else if (!senior.spouse && junior.spouse) {
                if (genDiff === 1) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'ससुरा र ज्वाइँ' : 'ससुरा र बुहारी')
                        : (junior.gender === 'M' ? 'सासु र ज्वाइँ' : 'सासु र बुहारी');
                } else if (genDiff === 2) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'हजुर ससुरा र नातिनी ज्वाइँ' : 'हजुर ससुरा र नातिनी बुहारी')
                        : (junior.gender === 'M' ? 'हजुरसासु र नातिनी ज्वाइँ' : 'हजुरसासु र नातिनी बुहारी');
                } else if (genDiff === 3) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'जिजुससुरा र पनातिनी ज्वाइँ' : 'जिजुससुरा र पनातिनी बुहारी')
                        : (junior.gender === 'M' ? 'जिजुसासु र पनातिनी ज्वाइँ' : 'जिजुसासु र पनातिनी बुहारी');
                } else if (genDiff === 4) {
                    relationText = senior.gender === 'M' 
                        ? (junior.gender === 'M' ? 'कुप्राससुरा र जनातिनी ज्वाइँ' : 'कुप्राससुरा र जनातिनी बुहारी')
                        : (junior.gender === 'M' ? 'कुप्रीसासु र जनातिनी ज्वाइँ' : 'कुप्रीसासु र जनातिनी बुहारी');
                } else {
                    const sTitle = senior.gender === 'M' ? `${prefixMale}ससुरा` : `${prefix}सासु`;
                    relationText = `${sTitle} र ${juniorSpouseTerm}`;
                }
            } else if (senior.spouse && !junior.spouse) {
                const sTitle = senior.gender === 'M' ? `${prefixMale}बुबा` : `${prefix}आमा`;
                relationText = `${sTitle} र ${juniorBloodTerm}`;
            } else {
                if (genDiff === 1) {
                    relationText = senior.gender === 'F'
                        ? (junior.gender === 'F' ? 'सासु र बुहारी' : 'सासु र ज्वाइँ')
                        : 'ससुरा र बुहारी';
                } else if (genDiff === 2) {
                    relationText = senior.gender === 'F'
                        ? (junior.gender === 'F' ? 'हजुरसासु र नातिनी बुहारी' : 'हजुरसासु र नातिनी ज्वाइँ')
                        : 'हजुर ससुरा र नातिनी बुहारी';
                } else {
                    const sTitle = senior.gender === 'F' ? `${prefix}सासु` : `${prefixMale}ससुरा`;
                    relationText = `${sTitle} र ${juniorSpouseTerm}`;
                }
            }
            return { success: true, message: relationText, genDiff, ...pindaData };
        }

        // ------------------------------------------------------------
        // २. फुपु लाइन (Phupu Line)
        // ------------------------------------------------------------
        if (isPhupuLine) {
            let phupuTitle = genDiff === 1 ? 'फुपु' : `${prefix}फुपु`;
            let phupuJwaiTitle = genDiff === 1 ? 'फुपाजु' : `${prefix}फुपाजु`;
            let phupuSasuTitle = genDiff === 1 ? 'फुपु सासु' : `${prefix}फुपु सासु`;
            let phupajuSasuroTitle = genDiff === 1 ? 'फुपाजु ससुरो' : `${prefix}फुपाजु ससुरो`;

            let juniorTitle = genDiff === 1 
                ? (junior.gender === 'M' ? 'भदो' : 'भदै')
                : (junior.gender === 'M' ? `भदो ${prefix}नाती` : `भदै ${juniorBloodTerm}`);

            if (!senior.spouse && !junior.spouse) {
                relationText = `${phupuTitle} र ${juniorTitle}`;
            } else if (!senior.spouse && junior.spouse) {
                const jSpouseTitle = genDiff === 1 
                    ? (junior.gender === 'M' ? 'भदै ज्वाइँ' : 'भदै बुहारी')
                    : `भदै ${juniorSpouseTerm}`;
                relationText = `${phupuSasuTitle} र ${jSpouseTitle}`;
            } else if (senior.spouse && !junior.spouse) {
                const jSaloTitle = genDiff === 1 
                    ? (junior.gender === 'M' ? 'भदो सालो' : 'भदै साली')
                    : `भदो ${prefix}नाती ${junior.gender === 'M' ? 'सालो' : 'साली'}`;
                relationText = `${phupuJwaiTitle} र ${jSaloTitle}`;
            } else {
                const jSpouseTitle = genDiff === 1 
                    ? (junior.gender === 'M' ? 'भदै ज्वाइँ' : 'भदै बुहारी')
                    : `भदै ${juniorSpouseTerm}`;
                relationText = `${phupajuSasuroTitle} र ${jSpouseTitle}`;
            }

            return { success: true, message: relationText, genDiff, ...pindaData };
        }

        // ------------------------------------------------------------
        // ३. काका / बडाबा लाइन (Kaka / Badaba Line)
        // ------------------------------------------------------------
        let kakaTitle = '';
        let kakaSasuTitle = '';

        if (genDiff === 1) {
            kakaTitle = senior.gender === 'M' ? 'काका वा बडाबा' : 'काकी वा बडिमा';
            kakaSasuTitle = senior.gender === 'M' ? 'काका ससुरा वा बडाबा ससुरा' : 'काकी सासु वा बडिमा सासु';
        } else if (genDiff === 2) {
            kakaTitle = senior.gender === 'M' ? 'हजुरकाका वा हजुरबडाबा' : 'हजुरकाकी वा हजुरबडिमा';
            kakaSasuTitle = senior.gender === 'M' ? 'हजुरकाका ससुरा वा हजुरबडाबा ससुरा' : 'हजुरकाकी सासु वा हजुरबडिमा सासु';
        } else {
            kakaTitle = senior.gender === 'M' ? `${prefixMale}काका वा ${prefixMale}बडाबा` : `${prefix}काकी वा ${prefix}बडिमा`;
            kakaSasuTitle = senior.gender === 'M' ? `${prefixMale}काका ससुरा वा ${prefixMale}बडाबा ससुरा` : `${prefix}काकी सासु वा ${prefix}बडिमा सासु`;
        }

        let bhatijaTitle = genDiff === 1 
            ? (junior.gender === 'M' ? 'भतिजा' : 'भतिजी')
            : juniorBloodTerm;

        if (!senior.spouse && !junior.spouse) {
            relationText = `${kakaTitle} र ${bhatijaTitle}`;
        } else if (!senior.spouse && junior.spouse) {
            relationText = `${kakaSasuTitle} र ${juniorSpouseTerm}`;
        } else if (senior.spouse && !junior.spouse) {
            relationText = `${kakaTitle} र ${bhatijaTitle}`;
        } else {
            relationText = `${kakaSasuTitle} र ${juniorSpouseTerm}`;
        }

        return { success: true, message: relationText, genDiff, ...pindaData };
    }

    return {
        calculateRelation,
        getGenderFromCode,
        getGeneration,
        getBaseCode,
        isSpouse,
        getFatherCode
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RelationCalculator;
}