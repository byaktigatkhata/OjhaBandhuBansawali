// RelationCalculator.js

const RelationCalculator = (function() {
    'use strict';

    function isSpouse(code) {
        return /m+$/.test(String(code).trim());
    }

    function getBaseCode(code) {
        return String(code).trim().replace(/m+$/, '');
    }

    // Strictly follows Rule D from your document to find gender based on code
    function getGenderFromCode(code) {
        const base = getBaseCode(code);
        if (/^[A-Z]$/.test(base)) return 'M'; // Rule D.iii: Root is always male
        
        const lastBlock = base.split('.').pop();
        const letter = lastBlock.charAt(0).toUpperCase();
        
        let g = (letter === 'F') ? 'F' : 'M';
        
        // Rule D.ii: If spouse (has 'm'), the meaning is changed (flipped)
        if (isSpouse(code)) {
            g = (g === 'M') ? 'F' : 'M'; 
        }
        return g;
    }

    // Safely gets the exact ancestor code (e.g., K.6.1.1 -> K.6.1.M1)
    function getAncestorCode(base) {
        const parts = base.split('.');
        if (parts.length <= 1) return null; // Root has no father
        
        // Remove the last block
        parts.pop(); 
        
        // Find the new last block to determine the father's number (e.g., "1" or "M3")
        let parentBlock = parts[parts.length - 1];
        let num = parentBlock.replace(/^[MF]/, ''); // Strip the M/F prefix
        
        // Reconstruct the father's code
        let parentPrefix = parts.slice(0, -1).join('.');
        return (parentPrefix ? parentPrefix + '.' : '') + 'M' + num;
    }

    // Checks if senior is a direct ancestor of junior
    function isDirectAncestor(seniorBase, juniorBase) {
        if (seniorBase === juniorBase) return false;
        let curr = juniorBase;
        let steps = 0;
        
        while (curr && curr.includes('.')) {
            curr = getAncestorCode(curr);
            if (!curr) break;
            if (curr === seniorBase) return true;
            
            steps++;
            if (steps > 20) break; // Prevent infinite loops
        }
        return false;
    }

    function getGenPrefix(diff) {
        const prefixes = {
            2: 'हजुर', 3: 'जिजु', 4: 'कुप्री',
            5: 'पाँच', 6: 'छ', 7: 'सात', 8: 'आठ', 9: 'नौ',
            10: 'दश', 11: 'एघार', 12: 'बाह्र', 13: 'तेह्र', 14: 'चौध', 15: 'पन्द्र'
        };
        return prefixes[diff] || `${diff}`;
    }

    // NEW: Calculate Common Generation & पिण्ड अन्तर (Pinda Antar)
    function calculatePindaAntar(codeA, codeB) {
        const baseA = getBaseCode(codeA);
        const baseB = getBaseCode(codeB);

        const partsA = baseA.split('.');
        const partsB = baseB.split('.');

        let commonCount = 0;
        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            if (partsA[i] === partsB[i]) {
                commonCount++;
            } else {
                break;
            }
        }

        const remainingA = partsA.length - commonCount;
        const remainingB = partsB.length - commonCount;
        const pindaAntar = Math.max(remainingA, remainingB);

        return {
            commonGen: commonCount,
            pindaAntar: pindaAntar
        };
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

        // Calculate Pinda Antar and Common Generation
        const pindaData = calculatePindaAntar(codeA, codeB);

        // Rely on strict code-based gender rules to prevent DB errors
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

        const dotsA = (baseA.match(/\./g) || []).length;
        const dotsB = (baseB.match(/\./g) || []).length;
        const genDiff = Math.abs(dotsA - dotsB);

        const seniorIsA = dotsA <= dotsB;
        const seniorBase = seniorIsA ? baseA : baseB;
        const juniorBase = seniorIsA ? baseB : baseA;
        const seniorGen = seniorIsA ? genderA : genderB;
        const juniorGen = seniorIsA ? genderB : genderA;
        const seniorSpouse = seniorIsA ? spouseA : spouseB;
        const juniorSpouse = seniorIsA ? spouseB : spouseA;

        const directLine = isDirectAncestor(seniorBase, juniorBase);

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
        if (directLine) {
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
        const partsAArr = baseA.split('.');
        const partsBArr = baseB.split('.');
        let lcaIndex = -1;
        for (let i = 0; i < Math.min(partsAArr.length, partsBArr.length); i++) {
            if (partsAArr[i] === partsBArr[i]) lcaIndex = i;
            else break;
        }
        
        let isPhupuLine = false;
        if (seniorGen === 'F') {
            isPhupuLine = true;
        } else if (lcaIndex >= 0 && lcaIndex + 1 < Math.min(partsAArr.length, partsBArr.length)) {
            const branchBlock = seniorIsA ? partsAArr[lcaIndex + 1] : partsBArr[lcaIndex + 1];
            if (branchBlock.toUpperCase().startsWith('F')) {
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
            kakaTitle = seniorGen === 'M' ? 'काका' : 'काकी';
            kakaSasuTitle = seniorGen === 'M' ? 'काका ससुरा' : 'काकी सासु';
        } else if (genDiff === 2) {
            kakaTitle = seniorGen === 'M' ? 'हजुरकाका' : 'हजुरकाकी';
            kakaSasuTitle = seniorGen === 'M' ? 'हजुरकाका ससुरा' : 'हजुरकाकी सासु';
        } else if (genDiff === 3) {
            kakaTitle = seniorGen === 'M' ? 'जिजुकाका' : 'जिजुकाकी';
            kakaSasuTitle = seniorGen === 'M' ? 'जिजुकाका ससुरा' : 'जिजुकाकी सासु';
        } else if (genDiff === 4) {
            kakaTitle = seniorGen === 'M' ? 'कुप्राकाका' : 'कुप्रीकाकी';
            kakaSasuTitle = seniorGen === 'M' ? 'कुप्राकाका ससुरा' : 'कुप्रीकाकी सासु';
        } else {
            kakaTitle = seniorGen === 'M' ? `${prefix}काका` : `${prefix}काकी`;
            kakaSasuTitle = seniorGen === 'M' ? `${prefix}काका ससुरा` : `${prefix}काकी सासु`;
        }

        let bhatijaTitle, bhatijaSpouseTitle;
        if (genDiff === 1) {
            bhatijaTitle = juniorGen === 'M' ? 'भतिजा' : 'भतिजी';
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        } else {
            bhatijaTitle = juniorGen === 'M' ? `${prefix}नाती` : `${prefix}नातिनी`;
            bhatijaSpouseTitle = juniorGen === 'M' ? 'ज्वाइँ' : 'बुहारी';
        }

        if (!seniorSpouse && !juniorSpouse) {
            relationText = `${kakaTitle} र ${bhatijaTitle}`;
        } else if (!seniorSpouse && juniorSpouse) {
            relationText = `${kakaSasuTitle} र ${bhatijaSpouseTitle}`;
        } else if (seniorSpouse && !juniorSpouse) {
            relationText = `${kakaTitle} र ${bhatijaTitle}`;
        } else {
            relationText = `${kakaSasuTitle} र ${bhatijaSpouseTitle}`;
        }

        return { success: true, message: relationText, lcaName: '', lcaCode: '', genDiff, ...pindaData };
    }

    return { calculateRelation };
})();