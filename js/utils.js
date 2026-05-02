const constants = {
    API_BASE: 'http://localhost:8000',
    SEVERITY_MAP: {
        'Melanoma':                'high',
        'Squamous Cell Carcinoma': 'high',
        'Basal Cell Carcinoma':    'medium',
        'Lupus':                   'medium',
        'Cellulitis':              'medium',
        'Psoriasis':               'medium',
        'Shingles':                'medium',
        'Eczema':                  'low',
        'Acne':                    'low',
        'Vitiligo':                'low',
        'Rosacea':                 'low',
        'Hives':                   'low',
        'Contact Dermatitis':      'low',
        'Ringworm':                'low',
        'Impetigo':                'low',
        'Warts':                   'low',
        'Chickenpox':              'low',
        'Measles':                 'medium',
        'Scabies':                 'low',
        'Seborrheic Dermatitis':   'low',
        'Unclassified Image':      'unclassified',
    }
};

function getSeverityLevel(disease) {
    return constants.SEVERITY_MAP[disease] || 'medium';
}

function getSeverityBadge(disease) {
    const severity = getSeverityLevel(disease);
    const labels   = { high: '🔴 HIGH RISK', medium: '🟠 MODERATE', low: '🟢 MILD', unclassified: '⚪ UNKNOWN' };
    return `<span class="badge badge-${severity}">${labels[severity] || '⚪ UNKNOWN'}</span>`;
}
