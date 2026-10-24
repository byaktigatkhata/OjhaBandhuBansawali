// NepaliFontForPDF.js - Embeds Mukta font (Base64) for PDF generation
window.addEventListener('load', () => {
    if (window.jspdf && window.jspdf.jsPDF) {
        // This is a compressed Base64 string of the Mukta-Regular.ttf font.
        // I'm loading it via an external URL to keep this file size small.
        // In a production environment, you might want to host the font and its JS wrapper locally.
        const fontUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/mukta@5.0.8/files/mukta-devanagari-400-normal.woff';
        
        fetch(fontUrl)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                const base64Font = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
                window.jspdf.jsPDF.API.addFileToVFS('Mukta-Regular.ttf', base64Font);
                window.jspdf.jsPDF.API.addFont('Mukta-Regular.ttf', 'Mukta', 'normal');
                console.log('✅ Nepali Font loaded for PDF');
            })
            .catch(err => console.warn('⚠️ Could not load Nepali font for PDF', err));
    }
});