// RelationCalculator.js

const RelationCalculator = (function() {
    'use strict';

    function isSpouse(code) {
        return /m+$/.test(String(code).trim());
    }

    function getBaseCode(code) {
        return String(code).trim().replace(/m+$/, '');
    }

    // Strictly follows Rule D to find gender
    function getGenderFromCode(code) {
        const base = getBaseCode(code);
        if (/^[A-Z]$/.test(base)) return 'M'; // Root is male
        
        const lastBlock = base.split('.').pop();
        const letter = lastBlock.charAt(0).toUpperCase();
        
        let g = (letter === 'F') ? 'F' : 'M';
        if (isSpouse(code)) g = (g === 'M') ? 'F' : 'M'; 
        
        return g;
    }

    function getGenPrefix(diff) {
        const prefixes = {
            2: 'हजुर', 3: 'जिजु', 4: 'कुप्री',
            5: 'पाँच', 6: 'छ', 7: 'सात', 8: 'आठ', 9: 'नौ',
            10: 'दश', 11: 'एघार', 12: 'बाह्र', 13: 'तेह्र', 14: 'चौध', 15: 'पन्द्र'
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
            // Strip M/F from the block for structural comparison
            const blockA = partsA[i].replace(/^[MF]/, '');
            const blockB = partsB[i].replace(/^[MF]/, '');
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
        const codeA = String(memberA.PersonalCode).trim();
        const codeB = String(memberB.PersonalCode).trim();

        if (codeA === codeB) {
            return { success: false, message: 'यी दुबै एउटै व्यक्ति हुन्।' };
        }

        const baseA = getBaseCode(codeA);
        const baseB = getBaseCode(codeB);
        const spouseA = isSpouse(codeA);
        const spouseB = isSpouse(codeB);

        const pindaData = calculatePindaAntar(codeA, codeB);
        const genderA = getGenderFromCode(codeA);
        const genderB = getGenderFromCode(codeB);

        // Same base code -> Husband/Wife or Co-wives
        if (baseA === baseB) {
            if (spouseA && spouseB) {
                if (genderA === 'F' && genderB === 'F') {
                    return { success: true, message: 'सौता', lcaName: memberA.FullName, lcaCode: baseA, genDiff: 0, ...pindaData };
                }
                return { success: true, message: 'श्रीमान र श्रीमती', lcaName: memberA.FullName, lcaCode: baseA, genDiff: 0, ...pindaData };
            }
            return { success: true, message: 'श्रीमान र श्रीमती', lcaName: memberA.FullName, lcaCode: baseA, genDiff: 0, ...pindaData };
        }

        // --- Find LCA (Lowest Common Ancestor) structurally ---
        const partsA = baseA.split('.');
        const partsB = baseB.split('.');
        
        let commonLength = 0;
        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            const blockA = partsA[i].replace(/^[MF]/, '');
            const blockB = partsB[i].replace(/^[MF]/, '');
            if (blockA === blockB) {
                commonLength++;
            } else {
                break;
            }
        }
        
        // Direct Line check: Senior's structural blocks are an exact prefix of Junior's structural blocks
        const isDirectLine = (commonLength === Math.min(partsA.length, partsB.length));

        let seniorIsA = false;
        let seniorBase = "", juniorBase = "", seniorGen = "", juniorGen = "", seniorSpouse = false, juniorSpouse = false;

        if (isDirectLine) {
            // Senior is the one with fewer structural blocks
            seniorIsA = partsA.length <= partsB.length;
            seniorBase = seniorIsA ? baseA : baseB;
            juniorBase = seniorIsA ? baseB : baseA;
            seniorGen = seniorIsA ? genderA : genderB;
            juniorGen = seniorIsA ? genderB : genderA;
            seniorSpouse = seniorIsA ? spouseA : spouseB;
            juniorSpouse = seniorIsA ? spouseB : spouseA;
        } else {
            // If not direct line, assign based on generation length or string comparison
            seniorIsA = partsA.length < partsB.length || (partsA.length === partsB.length && partsA.join('.') < partsB.join('.'));
            seniorBase = seniorIsA ? baseA : baseB;
            juniorBase = seniorIsA ? baseB : baseA;
            seniorGen = seniorIsA ? genderA : genderB;
            juniorGen = seniorIsA ? genderB : genderA;
            seniorSpouse = seniorIsA ? spouseA : spouseB;
            juniorSpouse = seniorIsA ? spouseB : spouseA;
        }

        const genDiff = Math.abs(partsA.length - partsB.length);
        let relationText = '';
        const prefix = getGenPrefix(genDiff);

        // ============================================================
        // SAME GENERATION (Rule E)
        // ============================================================
        if (genDiff === 0) {
            if (!spouseA && !spouseB && genderA === 'M' && genderB === 'M') {
                relationText = 'दाजु र भाइ';
            } else if (!spouseA && !spouseB && genderA === 'F' && genderB === 'F') {
                relationText = 'दिदी र बहिनी';
            } else if (!spouseA && !spouseB && genderA !== genderB) {
                relationText = 'दाजु र बहिनी वा दिदी र भाइ';
            } else if (spouseA !== spouseB) {
                const mGender = spouseA ? genderA : genderB; 
                const otherGender = spouseA ? genderB : genderA;
                
                if (mGender === 'F' && otherGender === 'M') {
                    relationText = 'जेठाजु र बुहारी वा देवर र भाउजु';
                } else if (mGender === 'M' && otherGender === 'M') {
                    relationText = 'जेठान र ज्वाइँ वा सालो र भिनाजु';
                } else if (mGender === 'F' && otherGender === 'F') {
                    relationText = 'नन्द र भाउजु वा आमाजु र बुहारी';
                } else {
                    relationText = 'जेठीसासु र ज्वाइँ वा साली र भिनाजु';
                }
            } else {
                if (genderA === 'M' && genderB === 'M') {
                    relationText = 'साढु दाजु र साढु भाइ'; 
                } else if (genderA === 'F' && genderB === 'F') {
                    relationText = 'जेठानी र देउरानी'; 
                } else {
                    relationText = 'जेठानी दिदी र नन्दे भाइ वा आमाजु दाजु र साली बहिनी'; 
                }
            }
            return { success: true, message: relationText, lcaName: '', lcaCode: '', genDiff, ...pindaData };
        }

        // ============================================================
        // DIRECT LINE
        // ============================================================
        if (isDirectLine) {
            let sTitle = '', jTitle = '';
            if (genDiff === 1) {
                sTitle = seniorGen === 'M' ? 'बुबा' : 'आमा';
                jTitle = juniorGen === 'M' ? 'छोरा' : 'छोरी';
            } else if (genDiff === 2) {
                sTitle = seniorGen === 'M' ? 'हजुरबुबा' : 'हजुरआमा';
                jTitle = juniorGen === 'M' ? 'नाती' : 'नातिनी';
            } else if (genDiff === 3) {
                sTitle = seniorGen === 'M' ? 'जिजुबुबा' : 'जिजुआमा';
                jTitle = juniorGen === 'M' ? 'पनाती' : 'पनातिनी';
            } else if (genDiff === 4) {
                sTitle = seniorGen === 'M' ? 'कुप्राबुबा' : 'कुप्रीआमा';
                jTitle = juniorGen === 'M' ? 'जनाती' : 'जनातिनी';
            } else {
                sTitle = seniorGen === 'M' ? `${prefix}बुबा` : `${prefix}आमा`;
                jTitle = juniorGen === 'M' ? `${prefix}नाती` : `${prefix}नातिनी`;
            }

            if (!seniorSpouse && !juniorSpouse) {
                relationText = `${sTitle} र ${jTitle}`;
            } else if (!seniorSpouse && juniorSpouse) {
                if (genDiff === 1) {
                    if (seniorGen === 'M') relationText = juniorGen === 'M' ? 'ससुरा र ज्वाइँ' : 'ससुरा र बुहारी';
                    else relationText = juniorGen === 'M' ? 'सासु र ज्वाइँ' : 'सासु र बुहारी';
                } else if (genDiff === 2) {
                    if (seniorGen === 'M') relationText = juniorGen === 'M' ? 'बुढाससुरा र नातिनी ज्वाइँ' : 'बुढाससुरा र नातिनी बुहारी';
                    else relationText = juniorGen === 'M' ? 'हजुरसासु र नातिनी ज्वाइँ' : 'हजुरसासु र नातिनी बुहारी';
                } else {
                    const anc = seniorGen === 'M' ? `${prefix}ससुरा` : `${prefix}सासु`;
                    relationText = `${anc} र ${jTitle} ${juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी'}`;
                }
            } else if (seniorSpouse && !juniorSpouse) {
                relationText = `${sTitle} र ${jTitle}`;
            } else {
                if (genDiff === 1) {
                    if (seniorGen === 'F' && juniorGen === 'F') relationText = 'सासु र बुहारी';
                    else if (seniorGen === 'F' && juniorGen === 'M') relationText = 'सासु र ज्वाइँ';
                    else relationText = `${sTitle} र ${jTitle}`;
                } else if (genDiff === 2) {
                    relationText = juniorGen === 'M' ? 'हजुरसासु र नातिनी ज्वाइँ' : 'हजुरसासु र नातिनी बुहारी';
                } else {
                    relationText = `${prefix}सासु र ${jTitle} ${juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी'}`;
                }
            }
            return { success: true, message: relationText, lcaName: '', lcaCode: '', genDiff, ...pindaData };
        }

        // ============================================================
        // SIBLING BRANCHES (Phupu / Kaka lines)
        // ============================================================
        let isPhupuLine = false;
        if (commonLength < Math.min(partsA.length, partsB.length)) {
            const branchBlock = partsA[commonLength]; // Child of the LCA
            if (branchBlock && branchBlock.toUpperCase().startsWith('F')) {
                isPhupuLine = true;
            }
        }

        // -------- PHUPU LINE --------
        if (isPhupuLine) {
            let phupuTitle, phupuJwaiTitle, phupuSasuTitle;
            if (genDiff === 1) {
                phupuTitle = 'फुपु'; phupuJwaiTitle = 'फुपाजु'; phupuSasuTitle = 'फुपु सासु';
            } else if (genDiff === 2) {
                phupuTitle = 'हजुरफुपु'; phupuJwaiTitle = 'हजुरफुपाजु'; phupuSasuTitle = 'हजुरफुपु सासु';
            } else if (genDiff === 3) {
                phupuTitle = 'जिजुफुपु'; phupuJwaiTitle = 'जिजुफुपाजु'; phupuSasuTitle = 'जिजुफुपु सासु';
            } else if (genDiff === 4) {
                phupuTitle = 'कुप्रीफुपु'; phupuJwaiTitle = 'कुप्रीफुपाजु'; phupuSasuTitle = 'कुप्रीफुपु सासु';
            } else {
                phupuTitle = `${prefix}फुपु`; phupuJwaiTitle = `${prefix}फुपाजु`; phupuSasuTitle = `${prefix}फुपु सासु`;
            }

            let bhadoTitle, bhadiTitle, bhadoSaloTitle, bhadiSaliTitle;
            if (genDiff === 1) {
                bhadoTitle = 'भदो'; bhadiTitle = 'भदै'; bhadoSaloTitle = 'भदो सालो'; bhadiSaliTitle = 'भदै साली';
            } else {
                bhadoTitle = `भदो ${prefix}नाती`; bhadiTitle = `भदै ${prefix}नातिनी`;
                bhadoSaloTitle = `भदो ${prefix}नाती सालो`; bhadiSaliTitle = `भदै ${prefix}नातिनी साली`;
            }

            if (!seniorSpouse && !juniorSpouse) {
                relationText = juniorGen === 'M' ? `${phupuTitle} र ${bhadoTitle}` : `${phupuTitle} र ${bhadiTitle}`;
            } else if (!seniorSpouse && juniorSpouse) {
                if (genDiff === 1) relationText = juniorGen === 'M' ? 'फुपु सासु र भदै ज्वाइँ' : 'फुपु सासु र भदै बुहारी';
                else relationText = juniorGen === 'M' ? `${phupuSasuTitle} र ${bhadiTitle} ज्वाइँ` : `${phupuSasuTitle} र ${bhadiTitle} बुहारी`;
            } else if (seniorSpouse && !juniorSpouse) {
                if (genDiff === 1) relationText = juniorGen === 'M' ? 'फुपाजु र भदो सालो' : 'फुपाजु र भदै साली';
                else relationText = juniorGen === 'M' ? `${phupuJwaiTitle} र ${bhadoSaloTitle}` : `${phupuJwaiTitle} र ${bhadiSaliTitle}`;
            } else {
                if (genDiff === 1) relationText = juniorGen === 'M' ? 'फुपाजु ससुरो र भदै ज्वाइँ' : 'फुपाजु ससुरो र भदै बुहारी';
                else relationText = juniorGen === 'M' ? `${phupuJwaiTitle} ससुरो र ${bhadiTitle} ज्वाइँ` : `${phupuJwaiTitle} ससुरो र ${bhadiTitle} बुहारी`;
            }
            return { success: true, message: relationText, lcaName: '', lcaCode: '', genDiff, ...pindaData };
        }

        // -------- KAKA LINE --------
        let kakaTitle, kakaSasuTitle;
        if (genDiff === 1) {
            kakaTitle = seniorGen === 'M' ? 'काका र भतिजा वा बडाबा र भतिजा' : 'काकी र भतिजा वा बडिमा र भतिजा';
            kakaSasuTitle = seniorGen === 'M' ? 'काका ससुरा र बुहारी वा बडाबा ससुरा र बुहारी' : 'काकी सासु र बुहारी वा बडिमा सासु र बुहारी';
        } else if (genDiff === 2) {
            kakaTitle = seniorGen === 'M' ? 'हजुरकाका वा हजुरबडाबा' : 'हजुरकाकी वा हजुरबडिमा';
            kakaSasuTitle = seniorGen === 'M' ? 'हजुरकाका ससुरा वा हजुरबडाबा ससुरा' : 'हजुरकाकी सासु वा हजुरबडिमा सासु';
        } else if (genDiff === 3) {
            kakaTitle = seniorGen === 'M' ? 'जिजुकाका वा जिजुबडाबा' : 'जिजुकाकी वा जिजुबडिमा';
            kakaSasuTitle = seniorGen === 'M' ? 'जिजुकाका ससुरा वा जिजुबडाबा ससुरा' : 'जिजुकाकी सासु वा जिजुबडिमा सासु';
        } else if (genDiff === 4) {
            kakaTitle = seniorGen === 'M' ? 'कुप्राकाका वा कुप्राबडाबा' : 'कुप्रीकाकी वा कुप्रीबडिमा';
            kakaSasuTitle = seniorGen === 'M' ? 'कुप्राकाका ससुरा वा कुप्राबडाबा ससुरा' : 'कुप्रीकाकी सासु वा कुप्रीबडिमा सासु';
        } else {
            kakaTitle = seniorGen === 'M' ? `${prefix}काका वा ${prefix}बडाबा` : `${prefix}काकी वा ${prefix}बडिमा`;
            kakaSasuTitle = seniorGen === 'M' ? `${prefix}काका ससुरा वा ${prefix}बडाबा ससुरा` : `${prefix}काकी सासु वा ${prefix}बडिमा सासु`;
        }

        let bhatijaTitle, bhatijaSpouseTitle;
        if (genDiff === 1) {
            bhatijaTitle = juniorGen === 'M' ? 'भतिजा' : 'भतिजी';
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else if (genDiff === 2) {
            bhatijaTitle = juniorGen === 'M' ? 'नाती' : 'नातिनी';
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else if (genDiff === 3) {
            bhatijaTitle = juniorGen === 'M' ? 'पनाती' : 'पनातिनी';
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else if (genDiff === 4) {
            bhatijaTitle = juniorGen === 'M' ? 'जनाती' : 'जनातिनी';
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else {
            bhatijaTitle = juniorGen === 'M' ? `${prefix}नाती` : `${prefix}नातिनी`;
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        }

        if (!seniorSpouse && !juniorSpouse) {
            if (genDiff === 1) {
                relationText = kakaTitle.replace(/भतिजा/g, juniorGen === 'M' ? 'भतिजा' : 'भतिजी');
            } else {
                relationText = `${kakaTitle} र ${bhatijaTitle}`;
            }
        } else if (!seniorSpouse && juniorSpouse) {
            if (genDiff === 1) {
                relationText = kakaSasuTitle.replace(/बुहारी/g, juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी');
            } else {
                relationText = `${kakaSasuTitle} र ${bhatijaSpouseTitle}`;
            }
        } else if (seniorSpouse && !juniorSpouse) {
            relationText = `${kakaTitle} र ${bhatijaTitle}`;
        } else {
            if (genDiff === 1) {
                relationText = kakaSasuTitle.replace(/बुहारी/g, juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी');
            } else {
                relationText = `${kakaSasuTitle} र ${bhatijaSpouseTitle}`;
            }
        }

        return { success: true, message: relationText, lcaName: '', lcaCode: '', genDiff, ...pindaData };
    }

    return { calculateRelation };
})();